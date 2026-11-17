import { applyReviewerColor, dateLocale, initials, onReady, pageLabel, relativeTime, rememberReviewer, reviewerName, reviewFetch, reviewToast, t } from './review-ui';

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
  let avatarGroup = $('[data-review-avatars]');
  if (!avatarGroup && toggle) {
    avatarGroup = document.createElement('div');
    avatarGroup.className = 'review-avatars';
    avatarGroup.dataset.reviewAvatars = '';
    avatarGroup.setAttribute('role', 'group');
    avatarGroup.setAttribute('aria-label', toggle.getAttribute('aria-label') || '');
    toggle.before(avatarGroup);
    avatarGroup.append(toggle);
  }
  const selfFace = toggle?.querySelector('[data-review-avatar]');
  if (selfFace && !selfFace.classList.contains('review-avatar-face')) {
    selfFace.classList.add('review-avatar-face');
  }
  if (toggle && !toggle.querySelector('[data-review-self-tooltip]')) {
    const tip = document.createElement('span');
    tip.className = 'review-tooltip';
    tip.dataset.reviewSelfTooltip = '';
    toggle.append(tip);
  }

  const list = $('[data-review-people-list]');
  const status = $('[data-review-people-status]');
  const profileForm = $('[data-review-profile-form]');
  const renameToggle = $('[data-review-rename-toggle]');
  const renameCancel = $('[data-review-rename-cancel]');
  let pendingHeartbeat = false;
  let pendingPeople = false;
  let savingProfile = false;
  let expired = false;
  let fetchedPeople = [];
  let livePeerNames = new Set();
  const commentAuthors = new Map();
  rememberReviewer(reviewerName());

  function syncExpandedAttr(expanded) {
    avatarGroup?.querySelectorAll('button').forEach(btn => {
      btn.setAttribute('aria-expanded', String(expanded));
    });
  }

  function expire() {
    expired = true;
    root.dataset.expired = 'true';
    $('[data-review-expired]').hidden = false;
    root.querySelectorAll('.feedback-toolbar button:not([data-review-people-toggle]):not([data-review-people-peer])').forEach(button => { button.disabled = true; });
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
    syncExpandedAttr(false);
  }
  for (const event of ['review:cursor', 'review:editing', 'review:notes']) document.addEventListener(event, closePeople);
  toggle.addEventListener('click', () => {
    if (!panel.hidden) { closePeople(); return; }
    document.dispatchEvent(new Event('review:cursor'));
    panel.hidden = false;
    syncExpandedAttr(true);
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

  function mergedPeople() {
    const selfName = reviewerName().trim();
    const selfKey = selfName.toLowerCase();
    const byKey = new Map();

    for (const person of fetchedPeople) {
      const name = (person.name || '').trim();
      const key = name.toLowerCase();
      if (!key) continue;
      const isSelf = Boolean(person.current) || (selfKey && key === selfKey);
      byKey.set(key, {
        name: isSelf && selfName ? selfName : name,
        page: person.page || location.pathname,
        current: isSelf,
        last_seen_at: person.last_seen_at || new Date().toISOString(),
        online: isSelf || Boolean(person.online) || livePeerNames.has(key),
      });
    }

    for (const liveKey of livePeerNames) {
      if (byKey.has(liveKey)) continue;
      const author = commentAuthors.get(liveKey);
      const displayName = author?.name || liveKey;
      byKey.set(liveKey, {
        name: displayName,
        page: location.pathname,
        current: selfKey === liveKey,
        last_seen_at: new Date().toISOString(),
        online: true,
      });
    }

    for (const [key, author] of commentAuthors) {
      if (byKey.has(key)) continue;
      const isSelf = Boolean(selfKey && key === selfKey);
      byKey.set(key, {
        name: isSelf && selfName ? selfName : author.name,
        page: author.page || location.pathname,
        current: isSelf,
        last_seen_at: author.last_seen_at || new Date().toISOString(),
        online: isSelf || livePeerNames.has(key),
      });
    }

    if (selfKey && !byKey.has(selfKey)) {
      byKey.set(selfKey, {
        name: selfName,
        page: location.pathname,
        current: true,
        last_seen_at: new Date().toISOString(),
        online: true,
      });
    }

    const entries = [...byKey.values()];
    const selfEntry = entries.find(p => p.current);
    const others = entries
      .filter(p => !p.current)
      .sort((a, b) => Number(b.online) - Number(a.online) || (Date.parse(b.last_seen_at) || 0) - (Date.parse(a.last_seen_at) || 0));

    return [...(selfEntry ? [selfEntry] : []), ...others];
  }

  function renderToolbarAvatars(people) {
    if (!avatarGroup || !toggle) return;
    avatarGroup.querySelectorAll('[data-review-people-peer]').forEach(el => el.remove());

    const others = people.filter(p => !p.current);
    const maxPeers = others.length > 3 ? 2 : 3;
    const shown = others.slice(0, maxPeers);
    const hiddenPeers = others.slice(maxPeers);
    const isOpen = !panel.hidden;

    for (const person of shown) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `review-avatar review-peer-avatar${person.online ? '' : ' review-peer-away'}`;
      btn.dataset.reviewPeoplePeer = '';
      btn.setAttribute('aria-controls', 'review-people');
      btn.setAttribute('aria-expanded', String(isOpen));
      const ago = relativeTime(person.last_seen_at);
      const statusText = person.online
        ? t('online_now')
        : (ago ? t('last_seen', { time: ago }) : pageLabel(person.page || location.pathname));
      btn.setAttribute('aria-label', `${person.name} · ${statusText}`);
      applyReviewerColor(btn, person.name);

      const face = text('span', initials(person.name), 'review-avatar-face');
      applyReviewerColor(face, person.name);

      const tip = document.createElement('span');
      tip.className = 'review-tooltip';
      tip.append(document.createTextNode(person.name));
      tip.append(text('span', ` · ${statusText}`, 'review-tooltip-sub'));

      btn.append(face, tip);
      btn.addEventListener('click', () => toggle.click());
      avatarGroup.append(btn);
    }

    if (hiddenPeers.length > 0) {
      const moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = 'review-avatar review-peer-avatar review-peer-more';
      moreBtn.dataset.reviewPeoplePeer = '';
      moreBtn.setAttribute('aria-controls', 'review-people');
      moreBtn.setAttribute('aria-expanded', String(isOpen));
      const namesList = hiddenPeers.map(p => p.name).join(', ');
      moreBtn.setAttribute('aria-label', `+${hiddenPeers.length}: ${namesList}`);

      const face = text('span', `+${hiddenPeers.length}`, 'review-avatar-face');
      const tip = text('span', namesList, 'review-tooltip');
      moreBtn.append(face, tip);
      moreBtn.addEventListener('click', () => toggle.click());
      avatarGroup.append(moreBtn);
    }
  }

  function renderPeopleList(people) {
    list.replaceChildren();
    const locale = dateLocale();
    for (const person of people) {
      const row = document.createElement('div');
      row.className = `review-person${person.online ? '' : ' review-person-away'}`;
      const content = document.createElement('div');
      const date = new Date(person.last_seen_at);
      const exactStamp = Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
      const ago = relativeTime(person.last_seen_at);
      const label = pageLabel(person.page);
      content.append(text('strong', `${person.name}${person.current ? t('you_suffix') : ''}`, 'review-person-name'));
      if (person.online) {
        content.append(text('p', t('online_now'), 'review-person-online'));
      } else if (ago) {
        const seenEl = text('p', t('last_seen', { time: ago }), 'review-person-seen');
        if (exactStamp) seenEl.title = exactStamp;
        content.append(seenEl);
      }
      const detail = text('p', label, 'review-person-page');
      if (exactStamp) detail.title = exactStamp;
      content.append(detail);
      row.append(applyReviewerColor(text('span', initials(person.name), 'review-avatar'), person.name), content);
      list.append(row);
    }
  }

  function refreshPeopleUI() {
    const people = mergedPeople();
    renderToolbarAvatars(people);
    if (!panel.hidden) {
      renderPeopleList(people);
      status.textContent = people.length ? '' : t('nobody_signed_in');
    }
  }

  document.addEventListener('review:presence', event => {
    const members = Array.isArray(event.detail) ? event.detail : [];
    livePeerNames = new Set(members.map(m => (m?.name || '').trim().toLowerCase()).filter(Boolean));
    for (const member of members) {
      const name = (member?.name || '').trim();
      const key = name.toLowerCase();
      if (key && !commentAuthors.has(key)) {
        commentAuthors.set(key, { name, last_seen_at: new Date().toISOString(), page: location.pathname });
      }
    }
    refreshPeopleUI();
  });

  document.addEventListener('review:comment-authors', event => {
    const authors = Array.isArray(event.detail) ? event.detail : [];
    for (const author of authors) {
      const name = (author?.name || '').trim();
      const key = name.toLowerCase();
      if (!key) continue;
      commentAuthors.set(key, {
        name,
        last_seen_at: author.last_seen_at || new Date().toISOString(),
        page: author.page || location.pathname,
      });
    }
    refreshPeopleUI();
  });

  document.addEventListener('review:renamed', () => refreshPeopleUI());

  async function loadPeople({ silent = false } = {}) {
    if (pendingPeople || expired) return;
    pendingPeople = true;
    if (!silent) status.textContent = t('loading_short');
    try {
      const response = await fetch(root.dataset.peopleUrl, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (response.status === 401 || response.status === 404) { expire(); return; }
      if (!response.ok) throw new Error();
      const data = await response.json();
      fetchedPeople = Array.isArray(data) ? data : (Array.isArray(data?.people) ? data.people : []);
      refreshPeopleUI();
      if (!silent) status.textContent = mergedPeople().length ? '' : t('nobody_signed_in');
    } catch {
      if (!silent) status.textContent = t('people_load_failed');
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
      if (response.ok) loadPeople({ silent: panel.hidden });
    } catch { /* A failed heartbeat must never pretend the reviewer is online. */ }
    finally { pendingHeartbeat = false; }
  }
  loadPeople({ silent: true });
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
