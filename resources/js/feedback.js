import { applyReviewerColor, dateLocale, initials, onReady, rememberReviewer, reviewBusy, reviewConfig, reviewerColor, reviewerName, reviewFetch, reviewMode, reviewToast, t, typing } from './review-ui';

export function initFeedback() {
  onReady(() => {
  const root = document.querySelector('[data-feedback]');
  if (!root) return;
  const $ = selector => root.querySelector(selector);
  const launcher = $('.feedback-launcher');
  const sticky = $('[data-feedback-sticky]');
  const form = $('[data-feedback-form]');
  const editCancel = $('[data-feedback-edit-cancel]');
  const detail = $('[data-feedback-detail]');
  const thread = $('[data-feedback-thread]');
  const replyForm = $('[data-feedback-reply-form]');
  const status = $('[data-feedback-status]');
  const board = $('#feedback-board');
  const toggle = $('.feedback-notes-toggle');
  const visibilityToggle = $('[data-feedback-visibility]');
  const list = $('[data-feedback-list]');
  const pins = $('[data-feedback-pins]');
  const hint = $('[data-feedback-hint]');
  const loadStatus = $('[data-feedback-load-status]');
  const sections = [...document.querySelectorAll('main section, body > section')];
  sections.forEach((section, index) => { section.id ||= `review-section-${index + 1}`; });
  let placing = false;
  let saving = false;
  let loading = false;
  let notesRevision = 0;
  let notes = [];
  let draft = null;
  let editingNote = null;
  let editingRootNote = null;
  let active = null;
  let returnFocus = launcher;
  let frame;
  let temporaryTargets = [];
  let notesVisible = true;
  let highlightedAnchor = null;
  const replyDrafts = new Map();
  try {
    const stored = localStorage.getItem('site-review-notes-visible') ?? localStorage.getItem('state-notes-visible');
    notesVisible = stored !== 'false';
  } catch { /* Storage is optional. */ }
  rememberReviewer(reviewerName());

  function bindComposer(targetForm) {
    const field = targetForm.elements.body;
    field.addEventListener('invalid', () => {
      field.setCustomValidity(field.validity.valueMissing
        ? t('comment_required')
        : t('max_length', { max: field.maxLength }));
    });
    field.addEventListener('input', () => field.setCustomValidity(''));
    field.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        targetForm.requestSubmit();
      }
    });
  }
  bindComposer(form);
  bindComposer(replyForm);
  replyForm.elements.body.addEventListener('input', () => {
    if (!active?.id) return;
    const value = replyForm.elements.body.value;
    if (value) replyDrafts.set(active.id, value);
    else replyDrafts.delete(active.id);
  });

  class FeedbackError extends Error {}

  function shortInitial(name) {
    const trimmed = (name || '').trim();
    return trimmed ? [...trimmed][0].toUpperCase() : '?';
  }

  function sameReviewer(a, b) {
    const left = (a || '').trim().toLowerCase();
    const right = (b || '').trim().toLowerCase();
    return Boolean(left && right && left === right);
  }

  function threadParticipants(note) {
    const seen = new Set();
    const participants = [];
    for (const entry of [note, ...(note.replies || [])]) {
      const name = (entry.name || '').trim();
      const key = name.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      participants.push(name);
    }
    return participants;
  }

  function resetEditing() {
    if (editingNote) {
      editingNote = null;
      editingRootNote = null;
      editCancel.hidden = true;
      form.elements.body.value = '';
      form.elements.body.setCustomValidity('');
    }
  }

  function applyVisibility() {
    visibilityToggle.setAttribute('aria-checked', String(notesVisible));
    pins.hidden = !notesVisible;
    if (notesVisible) schedulePositions();
  }

  function setBoard(open) {
    board.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }
  function setPlacing(enabled) {
    if (enabled) {
      resetEditing();
      highlightedAnchor?.removeAttribute('data-review-comment-target');
      document.documentElement.style.setProperty('--comment-target-color', reviewerColor(reviewerName()));
      document.dispatchEvent(new Event('review:notes'));
      notesVisible = true;
      applyVisibility();
    }
    reviewMode(enabled ? 'comment' : 'cursor');
    placing = enabled;
    document.documentElement.classList.toggle('feedback-placing', enabled);
    launcher.setAttribute('aria-pressed', String(enabled));
    hint.hidden = !enabled;
    temporaryTargets.forEach(el => el.removeAttribute('tabindex'));
    temporaryTargets = [];
    if (enabled) {
      document.querySelectorAll('main h1, main h2, main h3, main h4, main p, main li, main dt, main dd, main img, main [data-copy-key]').forEach(el => {
        if (!el.hasAttribute('tabindex')) { el.tabIndex = 0; temporaryTargets.push(el); }
      });
      setBoard(false);
      sticky.hidden = true;
      active = null;
    }
  }

  const extraTargets = (reviewConfig().captureTargets || []).filter(Boolean);
  const CAPTURE_TARGETS = [
    '[data-copy-key]',
    '[data-review-target]',
    'img', 'video',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'li', 'dt', 'dd', 'blockquote', 'label',
    'a', 'button', 'figure',
    ...extraTargets,
    'article', 'nav', '[role="region"]', 'dialog',
    '.container',
    'section', 'header', 'footer', 'main',
  ].join(', ');

  function selectorFor(element) {
    const path = [];
    for (let el = element; el && el !== document.body; el = el.parentElement) {
      const siblings = [...el.parentElement.children].filter(sibling => sibling.tagName === el.tagName);
      path.unshift(`${el.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(el) + 1})`);
    }
    return `body > ${path.join(' > ')}`;
  }
  function resolveAnchor(anchor) {
    try { return anchor && anchor !== 'body' ? document.querySelector(anchor) : null; } catch { return null; }
  }
  function cleanText(node) {
    if (!node) return '';
    const clone = node.cloneNode(true);
    clone.querySelectorAll('script, style, svg, [aria-hidden="true"]').forEach(el => el.remove());
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function labelFor(element, section = element?.closest?.('section')) {
    const finish = value => (value || '').replace(/\s+/g, ' ').trim().slice(0, 255);
    if (!element || element === document.body) {
      return finish(cleanText(section?.querySelector('h1, h2'))) || t('page_detail');
    }
    const explicitLabel = element.getAttribute?.('data-review-label') || element.closest?.('[data-review-label]')?.getAttribute('data-review-label');
    if (explicitLabel?.trim()) return finish(explicitLabel);

    if (element.matches('img, video')) {
      const mediaLabel = element.getAttribute('alt') || element.getAttribute('aria-label');
      if (mediaLabel?.trim()) return finish(mediaLabel);
    }
    if (element.matches('nav')) {
      const links = [...element.querySelectorAll('a')].map(cleanText).filter(Boolean);
      if (links.length) return finish(links.join(' · '));
    }
    if (element.matches('article, [role="region"], dialog')) {
      const heading = cleanText(element.querySelector('h1, h2, h3, h4'));
      if (heading) return finish(heading);
    }
    if (element.matches('section, header, footer, main, .container')) {
      const ownHeading = cleanText(element.querySelector(':scope > h1, :scope > h2, :scope > header h1, :scope > header h2, :scope > div > h1, :scope > div > h2, :scope > div > header h2'));
      if (ownHeading) return finish(ownHeading);
      const subHeadings = [...element.querySelectorAll('h2, h3, h4')].map(cleanText).filter(Boolean);
      if (subHeadings.length) return finish(subHeadings.join(' · '));
    }
    const direct = cleanText(element) || element.getAttribute?.('aria-label') || element.querySelector?.('img[alt]')?.getAttribute('alt');
    if (direct) return finish(direct);
    return finish(cleanText(section?.querySelector('h1, h2'))) || t('page_detail');
  }
  function contextLabel(note) {
    const el = resolveAnchor(note?.anchor);
    return el ? labelFor(el) : (note?.section_label || t('page_detail'));
  }
  function capture(target, x, y) {
    let element = target.closest('[data-review-target]') || target.closest(CAPTURE_TARGETS) || document.body;
    while (element && element !== document.body) {
      const r = element.getBoundingClientRect();
      if (element instanceof HTMLElement && r.width && r.height) break;
      element = element.parentElement?.closest(CAPTURE_TARGETS) || document.body;
    }
    if (element.matches?.('section, header, footer')) {
      const inner = element.querySelector(':scope > .container');
      const ir = inner?.getBoundingClientRect();
      if (ir && ir.width && ir.height && x >= ir.left && x <= ir.right) element = inner;
    }
    const rect = element.getBoundingClientRect();
    const section = element.closest('section') || sections.find(el => { const r = el.getBoundingClientRect(); return r.top <= y && r.bottom >= y; });
    return {
      page: location.pathname,
      section: section?.id || null,
      section_label: labelFor(element, section),
      position: Math.round(Math.min(1, Math.max(0, (scrollY + y) / Math.max(1, document.documentElement.scrollHeight))) * 10000),
      anchor: element === document.body ? 'body' : selectorFor(element),
      pin_x: Math.min(100, Math.max(0, (x - rect.left) / Math.max(1, rect.width) * 100)),
      pin_y: Math.min(100, Math.max(0, (y - rect.top) / Math.max(1, rect.height) * 100)),
    };
  }
  function pointFor(note) {
    const element = resolveAnchor(note?.anchor);
    if (element) {
      const r = element.getBoundingClientRect();
      if (r.width && r.height) {
        return { x: r.left + r.width * Number(note.pin_x) / 100, y: r.top + r.height * Number(note.pin_y) / 100, element };
      }
      for (let ancestor = element.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
        const ar = ancestor.getBoundingClientRect();
        if (ar.width && ar.height) {
          return { x: ar.right - Math.min(28, ar.width * 0.15), y: ar.top + Math.min(28, ar.height * 0.15), element: ancestor };
        }
      }
    }
    const section = note.section && document.getElementById(note.section);
    if (section) { const r = section.getBoundingClientRect(); return { x: r.left + Math.min(r.width * .85, r.width - 24), y: r.top + 100, element: section }; }
    return { x: innerWidth * .8, y: Number(note.position) / 10000 * document.documentElement.scrollHeight - scrollY, element: null };
  }
  function clippedByScroller(point, element) {
    for (let scroller = element?.parentElement; scroller && scroller !== document.body; scroller = scroller.parentElement) {
      const style = getComputedStyle(scroller);
      if (!/(auto|scroll)/.test(style.overflowX + style.overflowY)) continue;
      const rect = scroller.getBoundingClientRect();
      if (/(auto|scroll)/.test(style.overflowX) && (point.x < rect.left - 8 || point.x > rect.right + 8)) return true;
      if (/(auto|scroll)/.test(style.overflowY) && (point.y < rect.top - 8 || point.y > rect.bottom + 8)) return true;
    }
    return false;
  }
  function revealTarget(note, scrollPage = false) {
    const element = resolveAnchor(note?.anchor);
    if (element) {
      for (let ancestor = element; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
        if (ancestor.tagName === 'DETAILS' && !ancestor.open) {
          ancestor.open = true;
        }
        if (ancestor.hidden && ancestor.id) {
          const controller = document.querySelector(`[aria-controls="${CSS.escape(ancestor.id)}"][aria-expanded="false"]`);
          controller?.click();
        }
      }
      document.dispatchEvent(new CustomEvent('review:reveal-target', { detail: { element, note } }));
      for (let scroller = element.parentElement; scroller && scroller !== document.body; scroller = scroller.parentElement) {
        const style = getComputedStyle(scroller);
        if (!/(auto|scroll)/.test(style.overflowX + style.overflowY)) continue;
        const sr = scroller.getBoundingClientRect();
        const er = element.getBoundingClientRect();
        if (/(auto|scroll)/.test(style.overflowX) && er.width && (er.left < sr.left || er.right > sr.right)) {
          scroller.scrollTo({ left: scroller.scrollLeft + (er.left + er.width / 2) - (sr.left + sr.width / 2), behavior: 'instant' });
        }
        if (/(auto|scroll)/.test(style.overflowY) && er.height && (er.top < sr.top || er.bottom > sr.bottom)) {
          scroller.scrollTo({ top: scroller.scrollTop + (er.top + er.height / 2) - (sr.top + sr.height / 2), behavior: 'instant' });
        }
      }
    }
    if (scrollPage) {
      const point = pointFor(note);
      window.scrollBy({ top: point.y - innerHeight * .35, behavior: 'instant' });
    }
    return element;
  }
  function positionSticky(point) {
    const width = sticky.offsetWidth;
    const height = sticky.offsetHeight;
    const activePin = active?.id ? pins.querySelector(`[data-id="${active.id}"]`) : null;
    const pinWidth = activePin?.offsetWidth || 33;
    const right = point.x + pinWidth + 5;
    const left = right + width < innerWidth - 16 ? right : point.x - width - 12;
    sticky.style.left = `${Math.max(16, Math.min(innerWidth - width - 16, left))}px`;
    sticky.style.top = `${Math.max(24, Math.min(innerHeight - height - 90, point.y - 42))}px`;
  }
  function updatePositions() {
    frame = null;
    pins.querySelectorAll('button').forEach(pin => {
      const note = pin.dataset.draft ? draft : notes.find(item => item.id === Number(pin.dataset.id));
      if (!note) return;
      const point = pointFor(note);
      const pinWidth = pin.offsetWidth || 33;
      pin.setAttribute('aria-expanded', String(note.id === active?.id && !sticky.hidden && !!note.id));
      pin.hidden = point.y < 4 || point.y > innerHeight - 44 || point.x < -(pinWidth - 2) || point.x > innerWidth + 4 || clippedByScroller(point, point.element);
      pin.style.left = `${Math.max(6, Math.min(innerWidth - pinWidth - 2, point.x))}px`;
      pin.style.top = `${point.y}px`;
    });
    if (active && !sticky.hidden) positionSticky(pointFor(active));
  }
  function schedulePositions() { if (!frame) frame = requestAnimationFrame(updatePositions); }
  function closeSticky() {
    if (saving) return;
    resetEditing();
    sticky.hidden = true;
    active = null;
    highlightedAnchor?.removeAttribute('data-review-comment-target');
    highlightedAnchor = null;
    schedulePositions();
    returnFocus?.focus({ preventScroll: true });
  }

  async function removeComment(item, rootNote, submitButton, cancelButton) {
    if (saving || !item?.id) return;
    saving = true;
    reviewBusy(true);
    submitButton.disabled = true;
    cancelButton.disabled = true;
    submitButton.textContent = t('deleting');
    status.textContent = '';
    try {
      const response = await reviewFetch(`${root.dataset.endpoint}/${item.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: reviewerName() || null }),
      });
      if (!response.ok) {
        if (response.status === 401) { document.dispatchEvent(new Event('review:expired')); throw new FeedbackError(t('delete_error_401')); }
        if (response.status === 419) throw new FeedbackError(t('error_419_reload'));
        if (response.status === 404) throw new FeedbackError(t('delete_error_404'));
        if (response.status === 429) throw new FeedbackError(t('delete_error_429'));
        throw new FeedbackError(t('delete_error_generic'));
      }
      notesRevision++;
      if (item.id === rootNote.id) {
        replyDrafts.delete(rootNote.id);
        notes = notes.filter(note => note.id !== rootNote.id);
        sticky.hidden = true;
        active = null;
        highlightedAnchor?.removeAttribute('data-review-comment-target');
        highlightedAnchor = null;
        saving = false;
        reviewBusy(false);
        renderNotes();
        toggle.focus({ preventScroll: true });
        reviewToast(t('comment_deleted_toast'));
      } else {
        rootNote.replies = (rootNote.replies || []).filter(reply => reply.id !== item.id);
        saving = false;
        reviewBusy(false);
        renderNotes();
        openNote(rootNote, returnFocus);
        reviewToast(t('reply_deleted_toast'));
      }
    } catch (error) {
      status.textContent = error instanceof FeedbackError ? error.message : t('delete_error_network');
    } finally {
      saving = false;
      reviewBusy(false);
      submitButton.disabled = false;
      cancelButton.disabled = false;
      submitButton.textContent = t('delete_confirm_yes');
      if (!sticky.hidden && active) positionSticky(pointFor(active));
    }
  }

  function renderThreadEntry(item, rootNote) {
    const isRoot = item.id === rootNote.id;
    const replyCount = rootNote.replies?.length || 0;
    const entry = document.createElement('article');
    entry.className = isRoot ? 'feedback-entry' : 'feedback-entry feedback-reply-entry';
    applyReviewerColor(entry, item.name);

    const authorRow = document.createElement('div');
    authorRow.className = 'feedback-author-row';
    const avatar = document.createElement('span');
    avatar.className = 'review-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = initials(item.name);
    applyReviewerColor(avatar, item.name);
    const meta = document.createElement('div');
    const author = document.createElement('span');
    author.className = 'feedback-signature';
    author.textContent = item.name;
    const date = document.createElement('time');
    date.className = 'feedback-date';
    date.textContent = new Date(item.created_at).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' });
    meta.append(author, date);
    authorRow.append(avatar, meta);

    const body = document.createElement('p');
    body.className = 'feedback-body';
    body.textContent = item.body;

    const actions = document.createElement('div');
    actions.className = 'feedback-detail-actions';
    if (isRoot) {
      const replyButton = document.createElement('button');
      replyButton.type = 'button';
      replyButton.className = 'feedback-reply-action';
      replyButton.textContent = t('reply_action');
      replyButton.addEventListener('click', () => replyForm.elements.body.focus({ preventScroll: true }));
      actions.append(replyButton);
    }
    if (sameReviewer(item.name, reviewerName())) {
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'feedback-edit';
      editButton.textContent = t('edit_action');
      editButton.addEventListener('click', () => openEdit(item, rootNote));
      actions.append(editButton);
    }

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'feedback-delete';
    deleteButton.textContent = isRoot ? t('delete_comment_action') : t('delete_reply_action');
    actions.append(deleteButton);

    const confirmBox = document.createElement('div');
    confirmBox.className = 'feedback-delete-confirm';
    confirmBox.hidden = true;
    const confirmPrompt = document.createElement('p');
    confirmPrompt.textContent = !isRoot
      ? t('confirm_delete_reply')
      : (replyCount ? t('confirm_delete_thread') : t('confirm_delete_comment'));
    const confirmButtons = document.createElement('div');
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = t('delete_confirm_keep');
    const submitButton = document.createElement('button');
    submitButton.type = 'button';
    submitButton.dataset.feedbackDeleteSubmit = '';
    submitButton.textContent = t('delete_confirm_yes');
    confirmButtons.append(cancelButton, submitButton);
    confirmBox.append(confirmPrompt, confirmButtons);

    deleteButton.addEventListener('click', () => {
      if (saving) return;
      actions.hidden = true;
      confirmBox.hidden = false;
      cancelButton.focus({ preventScroll: true });
      positionSticky(pointFor(rootNote));
    });
    cancelButton.addEventListener('click', () => {
      if (saving) return;
      confirmBox.hidden = true;
      actions.hidden = false;
      deleteButton.focus({ preventScroll: true });
      positionSticky(pointFor(rootNote));
    });
    submitButton.addEventListener('click', () => removeComment(item, rootNote, submitButton, cancelButton));

    entry.append(authorRow, body, actions, confirmBox);
    return entry;
  }

  function openNote(note, source, jump = false, focusReply = false) {
    if (saving || root.dataset.busy === 'true') return;
    const rootNote = notes.find(item => item.id === note.id) || note;
    document.dispatchEvent(new Event('review:notes'));
    resetEditing();
    setPlacing(false);
    setBoard(false);
    highlightedAnchor?.removeAttribute('data-review-comment-target');
    highlightedAnchor = revealTarget(rootNote, jump);
    document.documentElement.style.setProperty('--comment-target-color', reviewerColor(rootNote.name));
    highlightedAnchor?.setAttribute('data-review-comment-target', '');
    active = rootNote;
    returnFocus = source || toggle;
    applyReviewerColor(sticky, rootNote.name);
    applyReviewerColor(replyForm, reviewerName());
    form.hidden = true;
    detail.hidden = false;
    status.textContent = '';
    const replyCount = rootNote.replies?.length || 0;
    $('#feedback-sticky-title').textContent = replyCount
      ? `${t('comment_title')} · ${replyCount} ${replyCount === 1 ? t('reply_singular') : t('reply_plural')}`
      : t('comment_title');
    $('[data-feedback-context]').textContent = contextLabel(rootNote);
    thread.replaceChildren(
      renderThreadEntry(rootNote, rootNote),
      ...(rootNote.replies || []).map(reply => renderThreadEntry(reply, rootNote)),
    );
    replyForm.elements.body.placeholder = sameReviewer(rootNote.name, reviewerName())
      ? t('add_comment_placeholder')
      : t('reply_to_placeholder', { name: rootNote.name });
    replyForm.elements.body.value = replyDrafts.get(rootNote.id) || '';
    replyForm.elements.body.setCustomValidity('');
    sticky.hidden = false;
    positionSticky(pointFor(rootNote));
    schedulePositions();
    if (focusReply) {
      replyForm.elements.body.focus({ preventScroll: true });
    } else {
      $('[data-feedback-close]').focus({ preventScroll: true });
    }
  }
  function openEdit(item, rootNote) {
    if (saving || !item) return;
    editingNote = item;
    editingRootNote = rootNote || notes.find(n => n.id === (item.parent_id || item.id)) || item;
    draft = null;
    active = editingRootNote;
    applyReviewerColor(sticky, item.name);
    form.hidden = false;
    detail.hidden = true;
    editCancel.hidden = false;
    status.textContent = '';
    $('#feedback-sticky-title').textContent = item.parent_id ? t('edit_reply_title') : t('edit_comment_title');
    $('[data-feedback-context]').textContent = contextLabel(editingRootNote);
    form.elements.body.value = item.body;
    form.elements.body.setCustomValidity('');
    renderPins();
    positionSticky(pointFor(editingRootNote));
    form.elements.body.focus({ preventScroll: true });
    const end = form.elements.body.value.length;
    form.elements.body.setSelectionRange(end, end);
  }
  function openDraft(context) {
    if (saving || root.dataset.busy === 'true') return;
    document.dispatchEvent(new Event('review:notes'));
    resetEditing();
    draft = context;
    setPlacing(false);
    active = draft;
    applyReviewerColor(sticky, reviewerName());
    highlightedAnchor?.removeAttribute('data-review-comment-target');
    highlightedAnchor = resolveAnchor(context.anchor);
    document.documentElement.style.setProperty('--comment-target-color', reviewerColor(reviewerName()));
    highlightedAnchor?.setAttribute('data-review-comment-target', '');
    returnFocus = launcher;
    form.hidden = false;
    editCancel.hidden = true;
    detail.hidden = true;
    status.textContent = '';
    $('#feedback-sticky-title').textContent = t('new_comment_title');
    $('[data-feedback-context]').textContent = contextLabel(context);
    sticky.hidden = false;
    renderPins();
    positionSticky(pointFor(draft));
    form.elements.body.focus({ preventScroll: true });
  }
  function renderPins() {
    pins.replaceChildren();
    notes.forEach((note, index) => {
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'feedback-pin';
      pin.dataset.id = note.id;
      applyReviewerColor(pin, note.name);
      const replyCount = note.replies?.length || 0;
      const participants = threadParticipants(note);
      if (participants.length >= 2) {
        pin.classList.add('feedback-pin-thread');
        const shown = participants.length <= 3 ? participants : participants.slice(0, 2);
        shown.forEach((participant, idx) => {
          if (idx > 0) {
            const sep = document.createElement('span');
            sep.className = 'feedback-pin-sep';
            sep.textContent = '+';
            pin.append(sep);
          }
          const part = document.createElement('span');
          part.textContent = shortInitial(participant);
          pin.append(part);
        });
        if (participants.length > 3) {
          const more = document.createElement('span');
          more.className = 'feedback-pin-sep';
          more.textContent = `+${participants.length - 2}`;
          pin.append(more);
        }
        const colors = participants.slice(0, 3).map(name => reviewerColor(name));
        pin.style.background = colors.length === 2
          ? `linear-gradient(105deg, ${colors[0]} 0% 42%, ${colors[1]} 58% 100%)`
          : `linear-gradient(105deg, ${colors[0]} 0% 28%, ${colors[1]} 50%, ${colors[2]} 72% 100%)`;
      } else if (replyCount > 0) {
        pin.classList.add('feedback-pin-thread');
        const first = document.createElement('span');
        first.textContent = shortInitial(note.name);
        const sep = document.createElement('span');
        sep.className = 'feedback-pin-sep';
        sep.textContent = '+';
        const count = document.createElement('span');
        count.textContent = String(replyCount);
        pin.append(first, sep, count);
      } else {
        pin.textContent = initials(note.name);
      }
      const namesLabel = participants.join(' + ');
      const aria = replyCount
        ? t('pin_open_thread', { index: index + 1, names: namesLabel, count: 1 + replyCount, preview: note.body.slice(0, 80) })
        : t('pin_open_single', { index: index + 1, name: note.name, preview: note.body.slice(0, 80) });
      pin.setAttribute('aria-label', aria);
      pin.title = replyCount
        ? `${namesLabel}: ${note.body.slice(0, 100)}`
        : `${note.name}: ${note.body.slice(0, 100)}`;
      pin.addEventListener('click', () => openNote(note, pin, false, placing));
      pins.append(pin);
    });
    if (draft) {
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'feedback-pin feedback-pin-draft';
      pin.dataset.draft = 'true';
      pin.textContent = '+';
      applyReviewerColor(pin, reviewerName());
      pin.setAttribute('aria-label', t('pin_draft_aria'));
      pin.addEventListener('click', () => openDraft(draft));
      pins.append(pin);
    }
    updatePositions();
  }
  function renderNotes() {
    const totalCount = notes.reduce((sum, note) => sum + 1 + (note.replies?.length || 0), 0);
    $('[data-feedback-count]').textContent = totalCount;
    const noun = totalCount === 1 ? t('comment_singular') : t('comment_plural');
    toggle.setAttribute('aria-label', `${totalCount} ${noun}`);
    $('.review-count-label').textContent = noun;
    $('[data-feedback-board-count]').textContent = totalCount;
    list.replaceChildren();
    if (!notes.length) {
      const empty = document.createElement('p');
      empty.className = 'feedback-empty';
      empty.textContent = t('comments_empty');
      list.append(empty);
    }
    const element = (className, text) => {
      const el = document.createElement('span');
      el.className = className;
      el.textContent = text;
      return el;
    };
    const latestActivityId = note => Math.max(note.id, ...(note.replies || []).map(reply => reply.id));
    const locale = dateLocale();
    [...notes].sort((a, b) => latestActivityId(b) - latestActivityId(a)).forEach(note => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'feedback-mini-note';
      applyReviewerColor(card, note.name);
      const content = element('feedback-mini-content', '');
      const meta = element('feedback-mini-meta', '');
      const date = new Date(note.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
      const participants = threadParticipants(note);
      const authorLabel = participants.length >= 2 ? participants.join(' + ') : note.name;
      meta.append(element('feedback-mini-author', authorLabel), element('feedback-mini-date', date));
      const replyCount = note.replies?.length || 0;
      if (replyCount > 0) {
        meta.append(element('feedback-mini-replies', `${replyCount} ${replyCount === 1 ? t('reply_singular') : t('reply_plural')}`));
      }
      content.append(meta, element('feedback-mini-body', note.body));
      if (replyCount > 0) {
        const lastReply = note.replies[replyCount - 1];
        content.append(element('feedback-mini-latest-reply', `${lastReply.name}: ${lastReply.body}`));
      }
      content.append(element('feedback-mini-context', t('context_at', { label: contextLabel(note) })));
      card.append(applyReviewerColor(element('review-avatar', initials(note.name)), note.name), content);
      card.addEventListener('click', () => openNote(note, toggle, true));
      list.append(card);
    });
    renderPins();
  }
  async function loadNotes(retry = true) {
    if (loading) return;
    loading = true;
    const revision = notesRevision;
    $('[data-feedback-refresh]').disabled = true;
    loadStatus.textContent = t('comments_loading');
    let shouldRetry = false;
    try {
      const collected = [];
      let page = 1;
      let lastPage = 1;
      do {
        const url = new URL(root.dataset.endpoint, location.origin);
        url.searchParams.set('page', location.pathname);
        url.searchParams.set('notes_page', page);
        const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok) {
          if (retry && response.status >= 500) shouldRetry = true;
          throw new FeedbackError(response.status === 404 ? t('comments_disabled') : t('comments_load_failed'));
        }
        const data = await response.json();
        collected.push(...data.data);
        lastPage = data.last_page;
        page++;
      } while (page <= lastPage);
      if (revision === notesRevision) {
        notes = collected
          .map(note => ({ ...note, replies: [...(note.replies || [])].sort((a, b) => a.id - b.id) }))
          .sort((a, b) => a.id - b.id);
        if (active?.id) {
          const updatedActive = notes.find(note => note.id === active.id);
          if (!updatedActive) closeSticky();
          else if (!sticky.hidden && !editingNote) openNote(updatedActive, returnFocus);
        }
        renderNotes();
      }
      loadStatus.textContent = '';
    } catch (error) {
      if (!(error instanceof FeedbackError) && retry) shouldRetry = true;
      loadStatus.textContent = error instanceof FeedbackError ? error.message : t('comments_load_failed');
    } finally {
      loading = false;
      $('[data-feedback-refresh]').disabled = false;
      if (shouldRetry) setTimeout(() => loadNotes(false), 500);
    }
  }
  visibilityToggle.addEventListener('click', () => {
    notesVisible = !notesVisible;
    try { localStorage.setItem('site-review-notes-visible', String(notesVisible)); } catch { /* Storage is optional. */ }
    applyVisibility();
  });
  document.addEventListener('review:editing', () => {
    if (saving) return;
    setPlacing(false);
    if (!sticky.hidden) closeSticky();
    setBoard(false);
  });
  document.addEventListener('review:cursor', () => {
    if (saving) return;
    setPlacing(false);
    if (!sticky.hidden) closeSticky();
    setBoard(false);
  });
  $('[data-review-cursor]').addEventListener('click', () => document.dispatchEvent(new Event('review:cursor')));
  document.addEventListener('review:saved', () => {
    if (active && !sticky.hidden) $('[data-feedback-context]').textContent = contextLabel(active);
    renderNotes();
  });
  document.addEventListener('review:renamed', () => {
    if (placing || draft) document.documentElement.style.setProperty('--comment-target-color', reviewerColor(reviewerName()));
    if (draft) { applyReviewerColor(sticky, reviewerName()); renderPins(); }
    applyReviewerColor(replyForm, reviewerName());
    if (active?.id && !sticky.hidden && !editingNote) openNote(active, returnFocus);
  });
  launcher.addEventListener('click', () => {
    if (saving) return;
    if (placing) return setPlacing(false);
    resetEditing();
    if (draft && form.elements.body.value.trim()) return openDraft(draft);
    draft = null;
    renderPins();
    setPlacing(true);
  });
  editCancel.addEventListener('click', () => {
    if (saving) return;
    const backTo = editingRootNote;
    resetEditing();
    if (backTo) openNote(backTo, returnFocus);
    else closeSticky();
  });
  $('[data-feedback-cancel]').addEventListener('click', () => { setPlacing(false); launcher.focus(); });
  document.addEventListener('click', event => {
    if (!placing || root.contains(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const r = event.target.getBoundingClientRect();
    openDraft(capture(event.target, event.detail === 0 ? r.left + r.width / 2 : event.clientX, event.detail === 0 ? r.top + r.height / 2 : event.clientY));
  }, true);
  document.addEventListener('keydown', event => {
    if (!typing(event) && !saving && !event.repeat) {
      if (event.key.toLowerCase() === 'c') {
        event.preventDefault();
        if (event.shiftKey) visibilityToggle.click(); else launcher.click();
        return;
      }
      if (event.key.toLowerCase() === 'v') { event.preventDefault(); $('[data-review-cursor]').click(); return; }
    }
    if (placing && event.key === 'Enter' && !root.contains(event.target)) {
      event.preventDefault(); event.stopImmediatePropagation();
      const r = event.target.getBoundingClientRect();
      openDraft(capture(event.target, r.left + r.width / 2, r.top + r.height / 2));
    }
    if (event.key === 'Escape' && (placing || !sticky.hidden || !board.hidden)) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (editingNote && editingRootNote && !saving) {
        const backTo = editingRootNote;
        resetEditing();
        openNote(backTo, returnFocus);
        return;
      }
      setPlacing(false); closeSticky(); setBoard(false);
    }
  }, true);
  $('[data-feedback-close]').addEventListener('click', closeSticky);
  toggle.addEventListener('click', () => {
    if (saving) return;
    document.dispatchEvent(new Event('review:notes'));
    setPlacing(false);
    if (!sticky.hidden) closeSticky();
    setBoard(board.hidden);
  });
  $('[data-feedback-board-close]').addEventListener('click', () => { setBoard(false); toggle.focus(); });
  $('[data-feedback-refresh]').addEventListener('click', () => loadNotes());
  document.addEventListener('scroll', schedulePositions, { capture: true, passive: true });
  window.addEventListener('resize', schedulePositions);
  document.addEventListener('click', () => requestAnimationFrame(schedulePositions));
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(schedulePositions).observe(document.body);
  document.fonts?.ready.then(schedulePositions);
  window.addEventListener('load', schedulePositions);

  async function parseSaveError(response) {
    if (response.status === 401) { document.dispatchEvent(new Event('review:expired')); return new FeedbackError(t('delete_error_401')); }
    if (response.status === 419) return new FeedbackError(t('save_error_419'));
    if (response.status === 404) return new FeedbackError(t('save_error_404'));
    if (response.status === 429) return new FeedbackError(t('save_error_429'));
    if (response.status === 422) {
      const data = await response.json().catch(() => ({}));
      const msg = data.errors ? Object.values(data.errors).flat().join(' ') : data.message;
      if (msg) return new FeedbackError(msg);
    }
    return new FeedbackError(t('save_error_generic'));
  }

  replyForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || !active?.id) return;
    const rootNote = notes.find(item => item.id === active.id) || active;
    const body = replyForm.elements.body.value.trim();
    const name = reviewerName();
    if (!body || !name) { status.textContent = !name ? t('reauth_for_author') : t('comment_write_first'); return; }
    saving = true;
    reviewBusy(true);
    const submit = replyForm.querySelector('.feedback-submit');
    submit.disabled = true;
    replyForm.elements.body.disabled = true;
    submit.setAttribute('aria-label', t('adding_comment'));
    status.textContent = '';
    try {
      const response = await reviewFetch(root.dataset.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: rootNote.id, page: location.pathname, name, body }),
      });
      if (!response.ok) throw await parseSaveError(response);
      const saved = await response.json();
      rememberReviewer(saved.name);
      notesRevision++;
      rootNote.replies = [...(rootNote.replies || []), saved].sort((a, b) => a.id - b.id);
      replyDrafts.delete(rootNote.id);
      replyForm.elements.body.value = '';
      saving = false;
      reviewBusy(false);
      renderNotes();
      openNote(rootNote, returnFocus);
      thread.scrollTop = thread.scrollHeight;
      reviewToast(t('reply_added_toast'));
    } catch (error) {
      status.textContent = error instanceof FeedbackError ? error.message : t('save_error_network');
    } finally {
      saving = false;
      reviewBusy(false);
      submit.disabled = false;
      replyForm.elements.body.disabled = false;
      submit.setAttribute('aria-label', t('add_comment_aria'));
      if (!sticky.hidden && active) positionSticky(pointFor(active));
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || (!draft && !editingNote)) return;
    const body = form.elements.body.value.trim();
    const name = reviewerName();
    if (!body || !name) { status.textContent = !name ? t('reauth_for_author') : t('comment_write_first'); return; }
    saving = true;
    reviewBusy(true);
    const submit = form.querySelector('.feedback-submit');
    const isEditing = Boolean(editingNote);
    submit.disabled = true;
    form.elements.body.disabled = true;
    editCancel.disabled = true;
    submit.setAttribute('aria-label', t('saving_comment'));
    status.textContent = '';
    try {
      const response = await reviewFetch(
        isEditing ? `${root.dataset.endpoint}/${editingNote.id}` : root.dataset.endpoint,
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isEditing ? { body } : { ...draft, name, body }),
        },
      );
      if (!response.ok) throw await parseSaveError(response);
      const saved = await response.json();
      rememberReviewer(saved.name);
      notesRevision++;
      if (isEditing) {
        const editedWasReply = Boolean(editingNote.parent_id);
        let targetThread = null;
        if (editedWasReply) {
          targetThread = notes.find(note => note.id === editingNote.parent_id) || editingRootNote;
          if (targetThread) {
            targetThread.replies = (targetThread.replies || []).map(reply => (reply.id === saved.id ? saved : reply));
          }
        } else {
          saved.replies = [...(saved.replies || editingNote.replies || [])].sort((a, b) => a.id - b.id);
          notes = notes.map(note => (note.id === saved.id ? saved : note));
          targetThread = saved;
        }
        resetEditing();
        saving = false;
        reviewBusy(false);
        renderNotes();
        if (targetThread) openNote(targetThread, returnFocus);
        else closeSticky();
        reviewToast(editedWasReply ? t('reply_updated_toast') : t('comment_updated_toast'));
      } else {
        saved.replies = saved.replies || [];
        notes.push(saved);
        notes.sort((a, b) => a.id - b.id);
        draft = null;
        resetEditing();
        highlightedAnchor?.removeAttribute('data-review-comment-target');
        highlightedAnchor = null;
        form.elements.body.value = '';
        sticky.hidden = true;
        active = null;
        renderNotes();
        launcher.focus({ preventScroll: true });
        reviewToast(t('comment_saved_toast'));
      }
    } catch (error) {
      status.textContent = error instanceof FeedbackError ? error.message : t('save_error_network');
    } finally {
      saving = false;
      reviewBusy(false);
      submit.disabled = false;
      form.elements.body.disabled = false;
      editCancel.disabled = false;
      submit.setAttribute('aria-label', t('save_comment_aria'));
      if (!sticky.hidden && active) positionSticky(pointFor(active));
    }
  });
  applyVisibility();
  loadNotes();
  });
}
