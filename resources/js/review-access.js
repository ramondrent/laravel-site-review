import { applyReviewerColor, dateLocale, initials, onReady, pageLabel, rememberReviewer, reviewerName, reviewFetch, reviewToast, t } from './review-ui';

export function initReviewAccess() {
  onReady(() => {
  // A back/forward-cache restore must re-check access with the server.
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  const access = document.querySelector('[data-review-access]');
  if (access) {
    const dialog = access.querySelector('[data-review-unlock-dialog]');
    const form = access.querySelector('form');
    const status = access.querySelector('[data-review-unlock-status]');
    const submit = form.querySelector('[type="submit"]');
    const passwordInput = form.elements.password;
    const passwordToggle = access.querySelector('[data-review-password-toggle]');
    let sending = false;
    try {
      if (localStorage.getItem('state-reviewer-name') === 'Deployment check') localStorage.removeItem('state-reviewer-name');
      form.elements.name.value = localStorage.getItem('site-review-reviewer-name')
        || localStorage.getItem('state-reviewer-name')
        || '';
    } catch { /* Optional convenience. */ }

    function setPasswordVisible(visible) {
      if (!passwordToggle) return;
      passwordInput.type = visible ? 'text' : 'password';
      passwordToggle.setAttribute('aria-pressed', String(visible));
      const label = visible ? t('password_hide') : t('password_show');
      passwordToggle.setAttribute('aria-label', label);
      passwordToggle.title = label;
      passwordToggle.querySelector('[data-eye-open]').hidden = visible;
      passwordToggle.querySelector('[data-eye-closed]').hidden = !visible;
    }

    passwordToggle?.addEventListener('click', () => {
      setPasswordVisible(passwordInput.type === 'password');
      passwordInput.focus({ preventScroll: true });
      const end = passwordInput.value.length;
      try { passwordInput.setSelectionRange(end, end); } catch { /* Not needed on unsupported types. */ }
    });

    access.querySelector('[data-review-unlock]').addEventListener('click', () => {
      setPasswordVisible(false);
      dialog.showModal();
      const focusTarget = form.elements.name.value.trim() ? passwordInput : form.elements.name;
      focusTarget.focus({ preventScroll: true });
    });
    access.querySelector('[data-review-unlock-close]').addEventListener('click', () => {
      if (!sending) { setPasswordVisible(false); dialog.close(); }
    });
    dialog.addEventListener('cancel', event => { if (sending) event.preventDefault(); });
    dialog.addEventListener('close', () => setPasswordVisible(false));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (sending) return;
      sending = true;
      submit.disabled = true;
      status.textContent = t('signing_in');
      const name = form.elements.name.value.trim();
      const body = new FormData(form);
      body.set('name', name);
      body.set('page', location.pathname);
      setPasswordVisible(false);
      try {
        const response = await fetch(form.action, { method: 'POST', headers: { Accept: 'application/json' }, body });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const messages = {
            419: t('error_419_reload'),
            429: t('error_429_wait'),
            404: t('error_404_disabled'),
            503: t('error_503_unconfigured'),
          };
          throw new Error(messages[response.status] || (data.errors ? Object.values(data.errors).flat().join(' ') : data.message) || t('error_signin_failed'));
        }
        rememberReviewer(name);
        passwordInput.value = '';
        location.reload();
      } catch (error) {
        status.textContent = error instanceof TypeError ? t('error_offline') : error.message;
        sending = false;
        submit.disabled = false;
      }
    });
    return;
  }

  const root = document.querySelector('[data-feedback]');
  if (!root) return;
  const $ = selector => root.querySelector(selector);
  const panel = $('[data-review-people]');
  const toggle = $('[data-review-people-toggle]');
  const list = $('[data-review-people-list]');
  const status = $('[data-review-people-status]');
  const profileForm = $('[data-review-profile-form]');
  const renameToggle = $('[data-review-rename-toggle]');
  const renameCancel = $('[data-review-rename-cancel]');
  let pendingHeartbeat = false;
  let pendingPeople = false;
  let savingProfile = false;
  let expired = false;
  rememberReviewer(reviewerName());

  function expire() {
    expired = true;
    root.dataset.expired = 'true';
    $('[data-review-expired]').hidden = false;
    root.querySelectorAll('.feedback-toolbar button:not([data-review-people-toggle])').forEach(button => { button.disabled = true; });
    status.textContent = t('reauth_required');
  }
  document.addEventListener('review:expired', expire);
  $('[data-review-reauth]').addEventListener('click', () => location.reload());

  function closeRename() {
    if (!profileForm) return;
    profileForm.hidden = true;
    renameToggle.hidden = false;
  }

  function closePeople() {
    closeRename();
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }
  for (const event of ['review:cursor', 'review:editing', 'review:notes']) document.addEventListener(event, closePeople);
  toggle.addEventListener('click', () => {
    if (!panel.hidden) { closePeople(); return; }
    document.dispatchEvent(new Event('review:cursor'));
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    loadPeople();
  });
  $('[data-review-people-close]').addEventListener('click', () => { closePeople(); toggle.focus(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) { closePeople(); toggle.focus(); }
  });

  renameToggle?.addEventListener('click', () => {
    if (expired) return;
    profileForm.elements.name.value = reviewerName();
    profileForm.hidden = false;
    renameToggle.hidden = true;
    profileForm.elements.name.focus({ preventScroll: true });
    profileForm.elements.name.select();
  });
  renameCancel?.addEventListener('click', () => {
    closeRename();
    renameToggle.focus({ preventScroll: true });
  });
  profileForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (savingProfile || expired) return;
    const name = profileForm.elements.name.value.trim();
    if (!name) { status.textContent = t('name_required'); return; }
    savingProfile = true;
    profileForm.querySelectorAll('button, input').forEach(el => { el.disabled = true; });
    try {
      const response = await reviewFetch(root.dataset.profileUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if ([401, 404].includes(response.status)) { expire(); return; }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((data.errors ? Object.values(data.errors).flat().join(' ') : data.message) || t('save_failed'));
      rememberReviewer(data.name);
      document.dispatchEvent(new Event('review:renamed'));
      closeRename();
      loadPeople();
      reviewToast(t('renamed_toast', { name: data.name }));
    } catch (error) {
      status.textContent = error instanceof TypeError ? t('error_offline') : error.message;
    } finally {
      savingProfile = false;
      profileForm.querySelectorAll('button, input').forEach(el => { el.disabled = false; });
    }
  });

  const text = (tag, content, className) => {
    const el = document.createElement(tag);
    el.textContent = content;
    el.className = className;
    return el;
  };
  async function loadPeople() {
    if (pendingPeople || expired) return;
    pendingPeople = true;
    status.textContent = t('loading_short');
    try {
      const response = await fetch(root.dataset.peopleUrl, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (response.status === 401 || response.status === 404) { expire(); return; }
      if (!response.ok) throw new Error();
      const people = await response.json();
      list.replaceChildren();
      const locale = dateLocale();
      for (const person of people) {
        const row = document.createElement('div');
        row.className = 'review-person';
        const content = document.createElement('div');
        const date = new Date(person.last_seen_at);
        const stamp = date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
        const label = pageLabel(person.page);
        content.append(text('strong', `${person.name}${person.current ? t('you_suffix') : ''}`, 'review-person-name'));
        content.append(text('p', person.online ? t('online_now') : t('last_seen', { time: stamp }), person.online ? 'review-person-online' : 'review-person-seen'));
        const detail = text('p', `${label} · ${t('last_seen', { time: stamp })}`, 'review-person-page');
        detail.title = date.toLocaleString(locale);
        if (!person.online) detail.textContent = label;
        content.append(detail);
        row.append(applyReviewerColor(text('span', initials(person.name), 'review-avatar'), person.name), content);
        list.append(row);
      }
      status.textContent = people.length ? '' : t('nobody_signed_in');
    } catch {
      status.textContent = t('people_load_failed');
    } finally { pendingPeople = false; }
  }

  async function heartbeat() {
    if (document.hidden || pendingHeartbeat || expired) return;
    pendingHeartbeat = true;
    try {
      const response = await reviewFetch(root.dataset.heartbeatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: location.pathname }),
      });
      if ([401, 404].includes(response.status)) { expire(); return; }
      if (!panel.hidden && response.ok) loadPeople();
    } catch { /* A failed heartbeat must never pretend the reviewer is online. */ }
    finally { pendingHeartbeat = false; }
  }
  heartbeat();
  setInterval(heartbeat, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) heartbeat(); });

  $('[data-review-lock]').addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try {
      const response = await reviewFetch(root.dataset.lockUrl, { method: 'POST' });
      if (!response.ok) throw new Error();
      document.dispatchEvent(new Event('review:locking'));
      location.reload();
    } catch {
      status.textContent = t('signout_failed');
      $('[data-review-lock]').disabled = false;
    }
  });
  });
}
