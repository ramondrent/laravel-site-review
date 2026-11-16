import { applyReviewerColor, dateLocale, initials, isSharedCopy, onReady, pageLabel, rememberReviewer, reviewBusy, reviewerName, reviewFetch, reviewMode, reviewToast, t, typing } from './review-ui';

export function initTextReview() {
  onReady(() => {
  const root = document.querySelector('[data-feedback]');
  if (!root) return;
  const $ = selector => root.querySelector(selector);
  const editButton = $('[data-review-edit]');
  const historyButton = $('[data-review-history]');
  const editor = $('[data-review-editor]');
  const form = $('[data-review-form]');
  const status = $('[data-review-status]');
  const log = $('[data-review-log]');
  const logStatus = $('[data-review-log-status]');
  const historyList = $('[data-review-changes]');
  const more = $('[data-review-more]');
  let editing = false;
  let target = null;
  let version = 0;
  let conflict = null;
  let saving = false;
  let historyPage = 1;
  let historyRequest = 0;
  let positionFrame;
  const tabStops = new Map();

  form.elements.body.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  function setEditing(enabled) {
    editing = enabled;
    document.documentElement.classList.toggle('review-editing', enabled);
    editButton.setAttribute('aria-pressed', String(enabled));
    $('[data-review-hint]').hidden = !enabled;
    if (enabled) {
      closeHistory();
      document.dispatchEvent(new Event('review:editing'));
      document.querySelectorAll('[data-copy-key]').forEach(el => {
        tabStops.set(el, el.getAttribute('tabindex'));
        el.tabIndex = 0;
      });
    } else {
      tabStops.forEach((value, el) => value === null ? el.removeAttribute('tabindex') : el.setAttribute('tabindex', value));
      tabStops.clear();
    }
    reviewMode(enabled ? 'text' : 'cursor');
  }

  function positionEditor() {
    positionFrame = null;
    if (!editor.open || !target) return;
    const rect = target.getBoundingClientRect();
    const width = editor.offsetWidth;
    const height = editor.offsetHeight;
    const left = rect.right + width + 24 < innerWidth ? rect.right + 14 : rect.left - width - 14;
    editor.style.left = `${Math.max(12, Math.min(innerWidth - width - 12, left))}px`;
    editor.style.top = `${Math.max(12, Math.min(innerHeight - height - 64, rect.top))}px`;
  }

  function schedulePosition() {
    if (!positionFrame) positionFrame = requestAnimationFrame(positionEditor);
  }

  function openEditor(el) {
    if (editor.open) {
      if (el === target) { form.elements.body.focus(); return; }
      if (saving || conflict || form.elements.body.value.trim() !== target.textContent.trim()) {
        status.textContent = t('unsaved_switch_warning');
        form.elements.body.focus();
        return;
      }
      target?.removeAttribute('data-review-selected');
    }
    target = el;
    target.setAttribute('data-review-selected', '');
    version = Number(el.dataset.copyVersion);
    conflict = null;
    $('[data-review-conflict]').hidden = true;
    $('[data-review-context]').textContent = isSharedCopy(el)
      ? t('shared_copy_context')
      : `“${el.textContent.trim().slice(0, 90)}”`;
    form.elements.body.value = el.textContent.trim();
    rememberReviewer(reviewerName());
    status.textContent = '';
    $('[data-review-hint]').hidden = true;
    if (!editor.open) editor.show();
    positionEditor();
    form.elements.body.focus({ preventScroll: true });
  }

  function closeEditor() {
    if (saving) return;
    editor.close();
    target?.removeAttribute('data-review-selected');
    $('[data-review-hint]').hidden = !editing;
    target?.focus({ preventScroll: true });
  }

  function closeHistory() {
    log.close();
    historyButton.setAttribute('aria-expanded', 'false');
  }

  function browse() {
    if (saving) return;
    if (editor.open) closeEditor();
    closeHistory();
    setEditing(false);
  }

  editButton.addEventListener('click', () => {
    if (saving) return;
    if (editor.open) closeEditor();
    setEditing(!editing);
  });
  $('[data-review-stop]').addEventListener('click', () => { browse(); editButton.focus(); });
  document.addEventListener('review:notes', browse);
  document.addEventListener('review:cursor', browse);
  window.addEventListener('scroll', schedulePosition, { passive: true });
  window.addEventListener('resize', schedulePosition);
  new ResizeObserver(schedulePosition).observe(editor);
  document.addEventListener('click', event => {
    if (!editing || root.contains(event.target)) return;
    const el = event.target.closest('[data-copy-key]');
    if (!el) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openEditor(el);
  }, true);
  document.addEventListener('keydown', event => {
    if (!typing(event) && !saving && !event.repeat && event.key.toLowerCase() === 't') {
      event.preventDefault(); editButton.click(); return;
    }
    if (editor.open || log.open) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (editor.open) closeEditor(); else { closeHistory(); historyButton.focus(); }
      }
      return;
    }
    if (!editing) return;
    if (event.key === 'Escape') { setEditing(false); editButton.focus(); }
    if (event.key === 'Enter' && event.target.matches('[data-copy-key]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openEditor(event.target);
    }
  }, true);
  editor.addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
  root.querySelectorAll('[data-review-close]').forEach(button => button.addEventListener('click', closeEditor));
  $('[data-review-reload]').addEventListener('click', () => {
    if (!conflict || saving) return;
    form.elements.body.value = conflict.body;
    version = conflict.version;
    target.textContent = conflict.body;
    target.dataset.copyVersion = conflict.version;
    conflict = null;
    $('[data-review-conflict]').hidden = true;
    status.textContent = t('latest_loaded');
    form.elements.body.focus();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || !target) return;
    if (conflict) { status.textContent = t('conflict_copy_first'); return; }
    const body = form.elements.body.value.trim();
    const name = reviewerName();
    if (!body || !name) { status.textContent = !name ? t('reauth_for_edit') : t('text_required'); return; }
    saving = true;
    reviewBusy(true);
    form.querySelectorAll('button, textarea').forEach(el => { el.disabled = true; });
    status.textContent = t('saving');
    try {
      const payload = { page: location.pathname, name, body, version };
      if (target.dataset.copyToken) payload.token = target.dataset.copyToken;
      const response = await reviewFetch(`${editor.dataset.saveUrl}/${encodeURIComponent(target.dataset.copyKey)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409) {
        conflict = data;
        $('[data-review-latest]').textContent = data.body;
        $('[data-review-conflict]').hidden = false;
        throw new Error(t('conflict_error'));
      }
      if (!response.ok) {
        if (response.status === 401) document.dispatchEvent(new Event('review:expired'));
        const messages = {
          401: t('text_error_401'),
          404: t('text_error_404'),
          419: t('text_error_419'),
          429: t('text_error_429'),
        };
        throw new Error(messages[response.status] || (data.errors ? Object.values(data.errors).flat().join(' ') : t('text_error_generic')));
      }
      document.querySelectorAll('[data-copy-key]').forEach(el => {
        if (el.dataset.copyKey === target.dataset.copyKey) {
          el.textContent = data.body;
          el.dataset.copyVersion = data.version;
        }
      });
      rememberReviewer(name);
      document.dispatchEvent(new Event('review:saved'));
      saving = false;
      closeEditor();
      $('[data-review-hint-text]').textContent = t('edit_next_hint');
      reviewToast(t('text_saved_toast'));
    } catch (error) {
      status.textContent = error instanceof TypeError ? t('text_error_network') : error.message;
    } finally {
      saving = false;
      reviewBusy(false);
      form.querySelectorAll('button, textarea').forEach(el => { el.disabled = false; });
      schedulePosition();
    }
  });

  const textElement = (tag, text, className) => {
    const el = document.createElement(tag);
    el.textContent = text;
    if (className) el.className = className;
    return el;
  };

  async function loadHistory(reset = true) {
    const request = ++historyRequest;
    if (reset) { historyPage = 1; historyList.replaceChildren(); }
    const requestedPage = historyPage;
    more.hidden = true;
    logStatus.textContent = t('history_loading');
    const url = new URL(log.dataset.url, location.origin);
    if ($('[data-review-scope]').value === 'page') url.searchParams.set('page', location.pathname);
    url.searchParams.set('changes_page', requestedPage);
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 404 ? t('error_404_disabled') : t('history_load_failed'));
      const data = await response.json();
      if (request !== historyRequest) return;
      const labels = {
        text_updated: t('kind_text_updated'),
        comment_created: t('kind_comment_created'),
        comment_replied: t('kind_comment_replied'),
        comment_updated: t('kind_comment_updated'),
        comment_deleted: t('kind_comment_deleted'),
      };
      const locale = dateLocale();
      data.data.forEach(change => {
        const item = textElement('li', '', 'review-change');
        const date = new Date(change.created_at.endsWith('Z') ? change.created_at : change.created_at.replace(' ', 'T') + 'Z');
        const heading = textElement('div', '', 'review-change-heading');
        const meta = textElement('div', '');
        meta.append(textElement('h3', labels[change.kind] || change.kind), textElement('p', `${change.name} · ${date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}`, 'review-change-meta'));
        heading.append(applyReviewerColor(textElement('span', initials(change.name), 'review-avatar'), change.name), meta);
        const pageText = change.page === '*' ? t('shared_pages_label') : pageLabel(change.page);
        item.append(heading, textElement('p', pageText, 'review-change-meta'));
        for (const [field, label] of [['before', t('diff_before')], ['after', t('diff_after')]]) {
          if (change[field] === null) continue;
          const block = textElement('div', '', `review-diff review-diff-${field}`);
          block.append(textElement('strong', label), textElement('p', change[field]));
          item.append(block);
        }
        historyList.append(item);
      });
      historyPage = requestedPage + 1;
      more.hidden = data.current_page >= data.last_page;
      logStatus.textContent = data.total
        ? t(data.total === 1 ? 'change_singular' : 'change_plural', { count: data.total })
        : t('history_empty');
    } catch (error) {
      if (request !== historyRequest) return;
      logStatus.textContent = error instanceof TypeError ? t('history_offline') : error.message;
      more.hidden = requestedPage === 1;
    }
  }
  historyButton.addEventListener('click', () => {
    if (saving) return;
    if (log.open) { closeHistory(); return; }
    if (editor.open) closeEditor();
    setEditing(false);
    document.dispatchEvent(new Event('review:editing'));
    log.show();
    historyButton.setAttribute('aria-expanded', 'true');
    loadHistory();
  });
  $('[data-review-log-close]').addEventListener('click', () => { closeHistory(); historyButton.focus(); });
  $('[data-review-scope]').addEventListener('change', () => loadHistory());
  $('[data-review-log-refresh]').addEventListener('click', () => loadHistory());
  more.addEventListener('click', () => loadHistory(false));
  });
}
