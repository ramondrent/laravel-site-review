import { applyReviewerColor, dateLocale, initials, onReady, rememberReviewer, reviewBusy, reviewConfig, reviewerColor, reviewerName, reviewFetch, reviewMode, reviewToast, t, typing } from './review-ui';

export function initFeedback() {
  onReady(() => {
    const root = document.querySelector('[data-feedback]');
    if (!root) return;
    const $ = selector => root.querySelector(selector);
    const launcher = $('.feedback-launcher');
    const sticky = $('[data-feedback-sticky]');
    const resolveButton = $('[data-feedback-resolve]');
    const resolveLabel = $('[data-feedback-resolve-label]');
    const anchorNotice = $('[data-feedback-anchor-notice]');
    const anchorNoticeText = $('[data-feedback-anchor-notice-text]');
    const moveButton = $('[data-feedback-move]');
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
    const hintText = $('[data-feedback-hint-text]');
    const loadStatus = $('[data-feedback-load-status]');
    const filterButtons = [...root.querySelectorAll('[data-feedback-filter]')];
    const sections = [...document.querySelectorAll('main section, body > section')];
    sections.forEach((section, index) => { section.id ||= `review-section-${index + 1}`; });

    let placing = false;
    let movingNote = null;
    let dragging = null;
    let suppressPinClick = false;
    let saving = false;
    let loading = false;
    let boardFilter = 'open';
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

    function isResolved(note) {
      return Boolean(note?.resolved_at);
    }

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

    function setPlacing(enabled, targetMoveNote = null) {
      movingNote = enabled ? targetMoveNote : null;
      if (enabled) {
        resetEditing();
        highlightedAnchor?.removeAttribute('data-review-comment-target');
        highlightedAnchor = null;
        const colorName = movingNote ? movingNote.name : reviewerName();
        document.documentElement.style.setProperty('--comment-target-color', reviewerColor(colorName));
        document.dispatchEvent(new Event('review:notes'));
        notesVisible = true;
        applyVisibility();
      }
      if (hintText) {
        hintText.textContent = movingNote ? t('move_hint') : t('place_hint_default');
      }
      reviewMode(enabled ? 'comment' : 'cursor');
      placing = enabled;
      document.documentElement.classList.toggle('feedback-placing', enabled);
      launcher.setAttribute('aria-pressed', String(enabled && !movingNote));
      hint.hidden = !enabled;
      temporaryTargets.forEach(el => el.removeAttribute('tabindex'));
      temporaryTargets = [];
      if (enabled) {
        document.querySelectorAll('main h1, main h2, main h3, main h4, main p, main li, main dt, main dd, main img, main [data-copy-key]').forEach(el => {
          if (!el.hasAttribute('tabindex')) { el.tabIndex = 0; temporaryTargets.push(el); }
        });
        setBoard(false);
        sticky.hidden = true;
        if (!movingNote) active = null;
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

    const STABLE_DATA_ATTRS = [
      'data-review-target',
      'data-copy-key',
      'data-testid',
      'data-sector',
      'data-fragrance',
    ];

    function querySelectorSafe(selector) {
      if (!selector || selector === 'body') return null;
      try { return document.querySelector(selector); } catch { return null; }
    }

    function uniqueInDocument(selector) {
      try { return document.querySelectorAll(selector).length === 1; } catch { return false; }
    }

    function uniqueRootSelector(el) {
      for (const attr of STABLE_DATA_ATTRS) {
        const val = el.getAttribute?.(attr);
        if (val && val.length <= 200 && !/["<>\\\p{Cc}\u2028\u2029]/u.test(val)) {
          const candidate = `[${attr}="${val}"]`;
          if (uniqueInDocument(candidate)) return candidate;
        }
      }
      if (el.id && !/^review-section-\d+$/.test(el.id) && /^[a-zA-Z0-9_:\-.]+$/.test(el.id) && el.id.length <= 140) {
        const candidate = `#${CSS.escape(el.id)}`;
        if (uniqueInDocument(candidate)) return candidate;
      }
      return null;
    }

    function selectorFor(element) {
      if (!element || element === document.body) return 'body';
      const path = [];
      for (let el = element; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
        const unique = uniqueRootSelector(el);
        if (unique) return [unique, ...path].join(' > ');
        const tag = el.localName;
        const parent = el.parentElement;
        if (!parent) { path.unshift(tag); break; }
        const siblings = [...parent.children].filter(sibling => sibling.localName === tag);
        path.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(el) + 1})` : tag);
      }
      return `body > ${path.join(' > ')}`;
    }

    function cleanText(node) {
      if (!node) return '';
      const clone = node.cloneNode(true);
      clone.querySelectorAll('script, style, svg, [aria-hidden="true"]').forEach(el => el.remove());
      return (clone.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function snapshotText(element) {
      if (!element || element === document.body || element.closest?.('input, textarea, select, [contenteditable="true"], [data-feedback]')) {
        return '';
      }
      if (element.matches?.('img, video')) {
        return (element.getAttribute('alt') || element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      }
      return cleanText(element).slice(0, 200);
    }

    function imageAssetKey(element) {
      if (!element?.matches?.('img')) return '';
      const raw = element.getAttribute('src') || '';
      if (!raw) return '';
      try {
        const pathname = new URL(raw, location.origin).pathname;
        const base = pathname.split('/').pop() || '';
        return base
          .replace(/-\d+-[0-9a-f]{8,16}\.[a-z0-9]+$/i, '')
          .replace(/\.[a-z0-9]+$/i, '')
          .slice(0, 200);
      } catch {
        return '';
      }
    }

    function snapshotMeta(element) {
      if (!element || element === document.body) return null;
      const meta = { tag: element.localName };
      const text = snapshotText(element);
      if (text) meta.text = text;
      const src = imageAssetKey(element);
      if (src) meta.src = src;
      return meta;
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

    function normalizeComparable(value) {
      return (value || '')
        .replace(/\s*·\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    }

    function inferredTagFromSelector(anchor) {
      if (!anchor || anchor === 'body') return '';
      const last = anchor.split(' > ').pop() || '';
      const match = /^([a-zA-Z][a-zA-Z0-9-]*)/.exec(last);
      return match ? match[1].toLowerCase() : '';
    }

    function isVisibleBox(el) {
      if (!el || !(el instanceof Element) || root.contains(el)) return false;
      if (el.checkVisibility?.({ visibilityProperty: true }) === false) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }

    function canBeRevealed(el) {
      if (!el || !(el instanceof Element) || root.contains(el)) return false;
      for (let ancestor = el; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
        if (ancestor.tagName === 'DETAILS' && !ancestor.open) return true;
        if (ancestor.hidden && ancestor.id) return true;
      }
      return false;
    }

    function matchesExpectedText(el, expectedText, hasExplicitMeta) {
      if (!expectedText) return true;
      const snap = snapshotText(el);
      if (snap === expectedText) return true;
      if (!hasExplicitMeta) {
        const lbl = labelFor(el);
        if (lbl === expectedText) return true;
        const normExpected = normalizeComparable(expectedText);
        if (normExpected && (normalizeComparable(snap) === normExpected || normalizeComparable(lbl) === normExpected)) {
          return true;
        }
      }
      return false;
    }

    function findRelocatedElement(expectedTag, expectedText, expectedSrc, hasExplicitMeta) {
      if (expectedSrc) {
        const imgs = [...document.querySelectorAll('img')].filter(img => isVisibleBox(img) && imageAssetKey(img) === expectedSrc);
        if (imgs.length === 1) return imgs[0];
      }

      if (!expectedText) return null;

      if (expectedTag) {
        const sameTagMatches = [...document.getElementsByTagName(expectedTag)].filter(el => (
          isVisibleBox(el) && matchesExpectedText(el, expectedText, hasExplicitMeta)
        ));
        if (sameTagMatches.length === 1) return sameTagMatches[0];

        if (!hasExplicitMeta) {
          const normExpected = normalizeComparable(expectedText);
          const prefixMatches = [...document.getElementsByTagName(expectedTag)].filter(el => {
            if (!isVisibleBox(el)) return false;
            const normSnap = normalizeComparable(snapshotText(el));
            return normSnap.startsWith(`${normExpected} `);
          });
          if (prefixMatches.length === 1) return prefixMatches[0];
        }
      }

      // Handle tag changes (e.g. <span> -> <h2>) when the text uniquely matches a capture target.
      const anyTagMatches = [...document.querySelectorAll(CAPTURE_TARGETS)].filter(el => (
        isVisibleBox(el) && snapshotText(el) === expectedText
      ));
      if (anyTagMatches.length === 1) return anyTagMatches[0];

      return null;
    }

    // Tonen-style multi-step anchor resolution:
    // 1. Direct selector + unchanged text -> placed, unchanged
    // 2. Direct unique ID/data-* selector whose copy changed -> placed, changed
    // 3. Unique text/asset relocation when sibling indices or tags shifted -> placed, unchanged
    // 4. Positional selector still hits visible same-tag element -> placed, changed
    // 5. Missing element -> honestly unplaced (never dumped in a random section corner)
    function resolveNote(note) {
      if (!note?.anchor) {
        return { element: null, placed: false, changed: false, previousText: '' };
      }
      if (note.anchor === 'body') {
        return { element: document.body, placed: true, changed: false, previousText: '' };
      }

      const hasExplicitMeta = Boolean(note.anchor_meta && typeof note.anchor_meta === 'object');
      const expectedTag = (note.anchor_meta?.tag || inferredTagFromSelector(note.anchor) || '').toLowerCase();
      const defaultPageDetail = t('page_detail');
      const expectedText = hasExplicitMeta
        ? (note.anchor_meta.text || '')
        : (note.section_label && note.section_label !== defaultPageDetail ? note.section_label : '');
      const expectedSrc = note.anchor_meta?.src || '';
      const isDirectUnique = !note.anchor.includes(' > ') && /^[#[]/.test(note.anchor);

      const raw = querySelectorSafe(note.anchor);
      const tagMatches = raw && (!expectedTag || isDirectUnique || raw.localName === expectedTag);
      const candidate = tagMatches && (isVisibleBox(raw) || canBeRevealed(raw)) ? raw : null;

      if (candidate) {
        if (!expectedText || matchesExpectedText(candidate, expectedText, hasExplicitMeta)) {
          return { element: candidate, placed: true, changed: false, previousText: '' };
        }
        // Container with no text of its own on legacy notes (e.g. logo marquee whose label came from section)
        if (!hasExplicitMeta && snapshotText(candidate) === '') {
          return { element: candidate, placed: true, changed: false, previousText: '' };
        }
        if (isDirectUnique) {
          return { element: candidate, placed: true, changed: true, previousText: expectedText };
        }
      }

      const relocated = findRelocatedElement(expectedTag, expectedText, expectedSrc, hasExplicitMeta);
      if (relocated) {
        const textChanged = Boolean(expectedText && !matchesExpectedText(relocated, expectedText, hasExplicitMeta));
        return { element: relocated, placed: true, changed: textChanged, previousText: textChanged ? expectedText : '' };
      }

      if (candidate) {
        return { element: candidate, placed: true, changed: Boolean(expectedText), previousText: expectedText };
      }

      return { element: null, placed: false, changed: false, previousText: expectedText };
    }

    function contextLabel(note, resolution = resolveNote(note)) {
      if (resolution.placed && resolution.element && resolution.element !== document.body) {
        return labelFor(resolution.element);
      }
      return note?.section_label || t('page_detail');
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
      const sectionId = section?.id && !/^review-section-\d+$/.test(section.id) ? section.id : (section?.id || null);
      return {
        page: location.pathname,
        section: sectionId,
        section_label: labelFor(element, section),
        position: Math.round(Math.min(1, Math.max(0, (scrollY + y) / Math.max(1, document.documentElement.scrollHeight))) * 10000),
        anchor: element === document.body ? 'body' : selectorFor(element),
        anchor_meta: snapshotMeta(element),
        pin_x: Math.min(100, Math.max(0, (x - rect.left) / Math.max(1, rect.width) * 100)),
        pin_y: Math.min(100, Math.max(0, (y - rect.top) / Math.max(1, rect.height) * 100)),
      };
    }

    function pointFor(note, resolution = resolveNote(note)) {
      if (!resolution.placed || !resolution.element) {
        return null;
      }
      const element = resolution.element;
      const r = element.getBoundingClientRect();
      if (r.width && r.height) {
        return {
          x: r.left + r.width * Number(note.pin_x) / 100,
          y: r.top + r.height * Number(note.pin_y) / 100,
          element,
          changed: resolution.changed,
        };
      }
      for (let ancestor = element.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
        const ar = ancestor.getBoundingClientRect();
        if (ar.width && ar.height) {
          return {
            x: ar.right - Math.min(28, ar.width * 0.15),
            y: ar.top + Math.min(28, ar.height * 0.15),
            element: ancestor,
            changed: resolution.changed,
          };
        }
      }
      return null;
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
      const initial = resolveNote(note);
      const element = initial.element;
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
        if (point) {
          window.scrollBy({ top: point.y - innerHeight * 0.35, behavior: 'instant' });
        }
      }
      return element;
    }

    function positionSticky(point) {
      const width = sticky.offsetWidth;
      const height = sticky.offsetHeight;
      if (!point) {
        // Docked placement when viewing an unplaced or resolved comment without an active pin on screen
        sticky.style.left = `${Math.max(16, innerWidth - width - 16)}px`;
        sticky.style.top = `${Math.max(24, Math.min(innerHeight - height - 72, 88))}px`;
        return;
      }
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
        if (dragging && Number(pin.dataset.id) === dragging.note.id) {
          const pinWidth = pin.offsetWidth || 33;
          pin.hidden = false;
          pin.style.left = `${Math.max(6, Math.min(innerWidth - pinWidth - 2, dragging.x))}px`;
          pin.style.top = `${Math.max(6, Math.min(innerHeight - 50, dragging.y))}px`;
          return;
        }
        const note = pin.dataset.draft ? draft : notes.find(item => item.id === Number(pin.dataset.id));
        if (!note) return;
        const resolution = resolveNote(note);
        const point = pointFor(note, resolution);
        if (!point) {
          pin.hidden = true;
          return;
        }
        const pinWidth = pin.offsetWidth || 33;
        pin.classList.toggle('feedback-pin-changed', Boolean(resolution.changed));
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

    async function setNoteResolved(note, resolved, showUndo = true) {
      if (saving || !note?.id) return;
      saving = true;
      reviewBusy(true);
      if (resolveButton) resolveButton.disabled = true;
      status.textContent = '';
      try {
        const response = await reviewFetch(`${root.dataset.endpoint}/${note.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resolved }),
        });
        if (!response.ok) throw await parseSaveError(response);
        const saved = await response.json();
        saved.replies = [...(saved.replies || note.replies || [])].sort((a, b) => a.id - b.id);
        notesRevision++;
        notes = notes.map(item => (item.id === saved.id ? saved : item));
        saving = false;
        reviewBusy(false);
        if (resolved) {
          if (active?.id === saved.id) {
            sticky.hidden = true;
            active = null;
            highlightedAnchor?.removeAttribute('data-review-comment-target');
            highlightedAnchor = null;
          }
          renderNotes();
          if (showUndo) {
            reviewToast(t('resolved_toast'), {
              actionLabel: t('undo_action'),
              duration: 6000,
              onAction: () => setNoteResolved(saved, false, false),
            });
          } else {
            reviewToast(t('resolved_toast'));
          }
        } else {
          renderNotes();
          openNote(saved, returnFocus, true);
          reviewToast(t('reopened_toast'));
        }
      } catch (error) {
        status.textContent = error instanceof FeedbackError ? error.message : t('save_error_network');
      } finally {
        saving = false;
        reviewBusy(false);
        if (resolveButton) resolveButton.disabled = false;
      }
    }

    async function moveNoteTo(note, context) {
      if (saving || !note?.id || !context) return;
      saving = true;
      reviewBusy(true);
      status.textContent = '';
      try {
        const response = await reviewFetch(`${root.dataset.endpoint}/${note.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            section: context.section,
            section_label: context.section_label,
            position: context.position,
            anchor: context.anchor,
            anchor_meta: context.anchor_meta,
            pin_x: context.pin_x,
            pin_y: context.pin_y,
          }),
        });
        if (!response.ok) throw await parseSaveError(response);
        const saved = await response.json();
        saved.replies = [...(saved.replies || note.replies || [])].sort((a, b) => a.id - b.id);
        notesRevision++;
        notes = notes.map(item => (item.id === saved.id ? saved : item));
        saving = false;
        reviewBusy(false);
        setPlacing(false);
        renderNotes();
        openNote(saved, returnFocus);
        reviewToast(t('comment_moved_toast'));
      } catch (error) {
        saving = false;
        reviewBusy(false);
        renderNotes();
        reviewToast(error instanceof FeedbackError ? error.message : t('save_error_network'));
      }
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

    function updateStickyNotice(rootNote, resolution) {
      if (!anchorNotice || !anchorNoticeText || !moveButton) return;
      const resolved = isResolved(rootNote);
      if (resolved) {
        anchorNoticeText.textContent = t('resolved_detail');
        moveButton.hidden = true;
        anchorNotice.hidden = false;
        return;
      }
      if (!resolution.placed) {
        anchorNoticeText.textContent = t('not_placed_detail');
        moveButton.hidden = false;
        anchorNotice.hidden = false;
        return;
      }
      if (resolution.changed) {
        const quote = resolution.previousText ? ` ${t('changed_previous', { text: resolution.previousText.slice(0, 120) })}` : '';
        anchorNoticeText.textContent = `${t('changed_detail')}${quote}`;
        moveButton.hidden = false;
        anchorNotice.hidden = false;
        return;
      }
      anchorNotice.hidden = true;
      moveButton.hidden = true;
    }

    function openNote(note, source, jump = false, focusReply = false) {
      if (saving || root.dataset.busy === 'true') return;
      const rootNote = notes.find(item => item.id === note.id) || note;
      document.dispatchEvent(new Event('review:notes'));
      resetEditing();
      setPlacing(false);
      setBoard(false);
      highlightedAnchor?.removeAttribute('data-review-comment-target');
      const revealed = revealTarget(rootNote, jump);
      const resolution = resolveNote(rootNote);
      highlightedAnchor = resolution.placed && resolution.element !== document.body ? (revealed || resolution.element) : null;
      document.documentElement.style.setProperty('--comment-target-color', reviewerColor(rootNote.name));
      highlightedAnchor?.setAttribute('data-review-comment-target', '');
      active = rootNote;
      returnFocus = source || toggle;
      applyReviewerColor(sticky, rootNote.name);
      applyReviewerColor(replyForm, reviewerName());
      form.hidden = true;
      detail.hidden = false;
      status.textContent = '';

      if (resolveButton && resolveLabel) {
        const resolved = isResolved(rootNote);
        resolveButton.hidden = false;
        resolveButton.classList.toggle('is-resolved', resolved);
        resolveLabel.textContent = resolved ? t('reopen_action') : t('resolve_action');
        resolveButton.title = resolved ? t('reopen_action') : t('resolve_action');
      }

      const replyCount = rootNote.replies?.length || 0;
      $('#feedback-sticky-title').textContent = replyCount
        ? `${t('comment_title')} · ${replyCount} ${replyCount === 1 ? t('reply_singular') : t('reply_plural')}`
        : t('comment_title');
      $('[data-feedback-context]').textContent = contextLabel(rootNote, resolution);
      updateStickyNotice(rootNote, resolution);

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
      positionSticky(pointFor(rootNote, resolution));
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
      if (resolveButton) resolveButton.hidden = true;
      if (anchorNotice) anchorNotice.hidden = true;
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
      const resolution = resolveNote(context);
      highlightedAnchor = resolution.element && resolution.element !== document.body ? resolution.element : null;
      document.documentElement.style.setProperty('--comment-target-color', reviewerColor(reviewerName()));
      highlightedAnchor?.setAttribute('data-review-comment-target', '');
      returnFocus = launcher;
      if (resolveButton) resolveButton.hidden = true;
      if (anchorNotice) anchorNotice.hidden = true;
      form.hidden = false;
      editCancel.hidden = true;
      detail.hidden = true;
      status.textContent = '';
      $('#feedback-sticky-title').textContent = t('new_comment_title');
      $('[data-feedback-context]').textContent = contextLabel(context, resolution);
      sticky.hidden = false;
      renderPins();
      positionSticky(pointFor(draft, resolution));
      form.elements.body.focus({ preventScroll: true });
    }

    function bindPinDrag(pin, note) {
      pin.addEventListener('pointerdown', event => {
        if (saving || placing || event.button !== 0 || !event.isPrimary) return;
        const startX = event.clientX;
        const startY = event.clientY;
        const pointerId = event.pointerId;
        let dragHoverTarget = null;

        const cleanup = () => {
          window.removeEventListener('pointermove', onMove, true);
          window.removeEventListener('pointerup', onUp, true);
          window.removeEventListener('pointercancel', onCancel, true);
          dragHoverTarget?.removeAttribute('data-review-comment-target');
          dragHoverTarget = null;
        };

        const onMove = moveEvent => {
          if (moveEvent.pointerId !== pointerId) return;
          if (!dragging && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 5) {
            return;
          }
          if (!dragging) {
            dragging = { note, x: moveEvent.clientX, y: moveEvent.clientY };
            pin.classList.add('feedback-pin-dragging');
            if (!sticky.hidden && active?.id === note.id) sticky.hidden = true;
            document.documentElement.style.setProperty('--comment-target-color', reviewerColor(note.name));
          }
          dragging.x = moveEvent.clientX;
          dragging.y = moveEvent.clientY;

          pin.style.pointerEvents = 'none';
          const under = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
          pin.style.pointerEvents = '';
          const candidate = under && !root.contains(under)
            ? (under.closest('[data-review-target]') || under.closest(CAPTURE_TARGETS))
            : null;
          if (candidate !== dragHoverTarget) {
            dragHoverTarget?.removeAttribute('data-review-comment-target');
            dragHoverTarget = candidate && candidate !== document.body ? candidate : null;
            dragHoverTarget?.setAttribute('data-review-comment-target', '');
          }
          schedulePositions();
        };

        const onUp = upEvent => {
          if (upEvent.pointerId !== pointerId) return;
          const wasDragging = Boolean(dragging);
          cleanup();
          pin.classList.remove('feedback-pin-dragging');
          dragging = null;
          if (!wasDragging) return;
          suppressPinClick = true;
          setTimeout(() => { suppressPinClick = false; }, 50);

          pin.style.pointerEvents = 'none';
          const dropTarget = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
          pin.style.pointerEvents = '';
          if (!dropTarget || root.contains(dropTarget)) {
            schedulePositions();
            return;
          }
          moveNoteTo(note, capture(dropTarget, upEvent.clientX, upEvent.clientY));
        };

        const onCancel = cancelEvent => {
          if (cancelEvent.pointerId !== pointerId) return;
          cleanup();
          pin.classList.remove('feedback-pin-dragging');
          dragging = null;
          schedulePositions();
        };

        window.addEventListener('pointermove', onMove, true);
        window.addEventListener('pointerup', onUp, true);
        window.addEventListener('pointercancel', onCancel, true);
      });
    }

    function renderPins() {
      pins.replaceChildren();
      const openNotes = notes.filter(note => !isResolved(note));
      openNotes.forEach((note, index) => {
        const resolution = resolveNote(note);
        if (!resolution.placed) return;

        const pin = document.createElement('button');
        pin.type = 'button';
        pin.className = 'feedback-pin';
        if (resolution.changed) pin.classList.add('feedback-pin-changed');
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
        const changedSuffix = resolution.changed ? t('pin_changed_suffix') : '';
        const aria = (replyCount
          ? t('pin_open_thread', { index: index + 1, names: namesLabel, count: 1 + replyCount, preview: note.body.slice(0, 80) })
          : t('pin_open_single', { index: index + 1, name: note.name, preview: note.body.slice(0, 80) })) + changedSuffix;
        pin.setAttribute('aria-label', aria);
        pin.title = replyCount
          ? `${namesLabel}: ${note.body.slice(0, 100)}`
          : `${note.name}: ${note.body.slice(0, 100)}`;
        bindPinDrag(pin, note);
        pin.addEventListener('click', () => {
          if (suppressPinClick) return;
          openNote(note, pin, false, placing && !movingNote);
        });
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
      const openRoots = notes.filter(note => !isResolved(note));
      const resolvedRoots = notes.filter(note => isResolved(note));
      const openThreadCount = openRoots.reduce((sum, note) => sum + 1 + (note.replies?.length || 0), 0);

      $('[data-feedback-count]').textContent = openRoots.length;
      const noun = openRoots.length === 1 ? t('comment_singular') : t('comment_plural');
      toggle.setAttribute('aria-label', `${openRoots.length} ${noun}`);
      $('.review-count-label').textContent = noun;
      $('[data-feedback-board-count]').textContent = openRoots.length;
      const resolvedCountEl = $('[data-feedback-resolved-count]');
      if (resolvedCountEl) resolvedCountEl.textContent = resolvedRoots.length;

      filterButtons.forEach(btn => {
        btn.setAttribute('aria-selected', String(btn.dataset.feedbackFilter === boardFilter));
      });

      const shownNotes = boardFilter === 'resolved' ? resolvedRoots : openRoots;
      list.replaceChildren();
      if (!shownNotes.length) {
        const empty = document.createElement('p');
        empty.className = 'feedback-empty';
        empty.textContent = boardFilter === 'resolved' ? t('comments_resolved_empty') : t('comments_empty');
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
      [...shownNotes].sort((a, b) => latestActivityId(b) - latestActivityId(a)).forEach(note => {
        const resolution = resolveNote(note);
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
        if (isResolved(note)) {
          meta.append(element('feedback-mini-badge feedback-mini-badge-resolved', t('resolved_badge')));
        } else if (!resolution.placed) {
          meta.append(element('feedback-mini-badge feedback-mini-badge-unplaced', t('not_placed_badge')));
        } else if (resolution.changed) {
          meta.append(element('feedback-mini-badge feedback-mini-badge-changed', t('changed_badge')));
        }
        content.append(meta, element('feedback-mini-body', note.body));
        if (replyCount > 0) {
          const lastReply = note.replies[replyCount - 1];
          content.append(element('feedback-mini-latest-reply', `${lastReply.name}: ${lastReply.body}`));
        }
        content.append(element('feedback-mini-context', t('context_at', { label: contextLabel(note, resolution) })));
        card.append(applyReviewerColor(element('review-avatar', initials(note.name)), note.name), content);
        card.addEventListener('click', () => openNote(note, toggle, resolution.placed));
        list.append(card);
      });
      void openThreadCount;
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

    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        boardFilter = btn.dataset.feedbackFilter === 'resolved' ? 'resolved' : 'open';
        renderNotes();
      });
    });

    resolveButton?.addEventListener('click', () => {
      if (!active?.id || saving) return;
      const rootNote = notes.find(item => item.id === active.id) || active;
      setNoteResolved(rootNote, !isResolved(rootNote));
    });

    moveButton?.addEventListener('click', () => {
      if (!active?.id || saving) return;
      const rootNote = notes.find(item => item.id === active.id) || active;
      setPlacing(true, rootNote);
    });

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
      if (active && !sticky.hidden) {
        const res = resolveNote(active);
        $('[data-feedback-context]').textContent = contextLabel(active, res);
        updateStickyNotice(active, res);
      }
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
      if (placing && !movingNote) return setPlacing(false);
      resetEditing();
      if (draft && form.elements.body.value.trim()) return openDraft(draft);
      draft = null;
      renderPins();
      setPlacing(true, null);
    });
    editCancel.addEventListener('click', () => {
      if (saving) return;
      const backTo = editingRootNote;
      resetEditing();
      if (backTo) openNote(backTo, returnFocus);
      else closeSticky();
    });
    $('[data-feedback-cancel]').addEventListener('click', () => {
      const restoreMove = movingNote;
      setPlacing(false);
      if (restoreMove) openNote(restoreMove, returnFocus);
      else launcher.focus();
    });
    document.addEventListener('click', event => {
      if (!placing || root.contains(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const r = event.target.getBoundingClientRect();
      const context = capture(
        event.target,
        event.detail === 0 ? r.left + r.width / 2 : event.clientX,
        event.detail === 0 ? r.top + r.height / 2 : event.clientY,
      );
      if (movingNote) {
        moveNoteTo(movingNote, context);
      } else {
        openDraft(context);
      }
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
        const context = capture(event.target, r.left + r.width / 2, r.top + r.height / 2);
        if (movingNote) moveNoteTo(movingNote, context);
        else openDraft(context);
      }
      if (event.key === 'Escape' && (placing || !sticky.hidden || !board.hidden)) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (movingNote && !saving) {
          const restore = movingNote;
          setPlacing(false);
          openNote(restore, returnFocus);
          return;
        }
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
