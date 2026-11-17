import { applyReviewerColor, dateLocale, initials, onReady, pageLabel, relativeTime, rememberReviewer, reviewerColor, reviewerName, reviewFetch, reviewToast, t } from './review-ui';
import { lerp, prefersReducedMotion, roundedRectPath, smoothstep, tonenEase } from './comment-morph';

const UNLOCK_OPEN_DURATION = 240;
const UNLOCK_CLOSE_DURATION = 190;

function createUnlockMorph(access, launcher, dialog) {
  const layer = document.createElement('div');
  layer.className = 'feedback-morph-layer review-unlock-morph-layer';
  layer.setAttribute('aria-hidden', 'true');
  access.append(layer);

  const launcherMark = launcher.querySelector('[data-review-launcher-mark]');
  const dialogMark = dialog.querySelector('[data-review-dialog-mark]');
  let activeCleanup = null;

  function cancel() {
    if (activeCleanup) activeCleanup();
  }

  function runMorph({ fromBox, toBox, fromMark, toMark, cardOrigin, opening, duration, onFinish }) {
    const steps = Math.max(20, Math.ceil((duration * 160) / 1000));
    const sampled = [];
    for (let i = 0; i <= steps; i++) {
      const p = tonenEase(i / steps);
      sampled.push({
        p,
        box: {
          x: lerp(fromBox.x, toBox.x, p),
          y: lerp(fromBox.y, toBox.y, p),
          w: lerp(fromBox.w, toBox.w, p),
          h: lerp(fromBox.h, toBox.h, p),
          radii: [0, 1, 2, 3].map(idx => lerp(fromBox.radii[idx], toBox.radii[idx], p)),
        },
        mark: fromMark && toMark ? {
          x: lerp(fromMark.x, toMark.x, p),
          y: lerp(fromMark.y, toMark.y, p),
          w: lerp(fromMark.w, toMark.w, p),
          h: lerp(fromMark.h, toMark.h, p),
          r: lerp(fromMark.r, toMark.r, p),
        } : null,
      });
    }

    const minX = Math.floor(Math.min(fromBox.x, toBox.x)) - 2;
    const minY = Math.floor(Math.min(fromBox.y, toBox.y)) - 2;
    const maxX = Math.ceil(Math.max(fromBox.x + fromBox.w, toBox.x + toBox.w)) + 2;
    const maxY = Math.ceil(Math.max(fromBox.y + fromBox.h, toBox.y + toBox.h)) + 2;
    const origin = { x: minX, y: minY };

    const elevation = document.createElement('div');
    elevation.className = 'feedback-morph-elevation';
    Object.assign(elevation.style, {
      left: `${minX}px`,
      top: `${minY}px`,
      width: `${Math.max(1, maxX - minX)}px`,
      height: `${Math.max(1, maxY - minY)}px`,
    });

    const skin = document.createElement('div');
    skin.className = 'feedback-morph-skin review-unlock-morph-skin';
    elevation.append(skin);
    layer.append(elevation);

    let traveller = null;
    if (dialogMark && sampled[0].mark) {
      traveller = dialogMark.cloneNode(true);
      traveller.removeAttribute('data-review-dialog-mark');
      traveller.className = 'review-unlock-mark review-unlock-traveller';
      layer.append(traveller);
    }

    dialog.dataset.morphing = 'true';
    if (dialogMark) dialogMark.style.visibility = 'hidden';
    if (!opening) {
      launcher.dataset.morphing = 'true';
      if (launcherMark) launcherMark.style.visibility = 'hidden';
    }

    const timing = { duration, easing: 'linear', fill: 'forwards' };
    const anims = [];

    anims.push(skin.animate(
      sampled.map(({ box }) => ({ clipPath: roundedRectPath(box, origin) })),
      timing,
    ));

    if (traveller) {
      anims.push(traveller.animate(
        sampled.map(({ mark }) => ({
          transform: `translate(${mark.x.toFixed(2)}px, ${mark.y.toFixed(2)}px)`,
          width: `${mark.w.toFixed(2)}px`,
          height: `${mark.h.toFixed(2)}px`,
          borderRadius: `${mark.r.toFixed(2)}px`,
        })),
        timing,
      ));
    }

    anims.push(dialog.animate(
      sampled.map(({ p, box }) => ({
        clipPath: roundedRectPath(box, cardOrigin),
        opacity: opening ? smoothstep(0.32, 0.94, p) : 1 - smoothstep(0, 0.45, p),
      })),
      timing,
    ));

    if (!opening) {
      anims.push(launcher.animate(
        sampled.map(({ p }) => ({ opacity: smoothstep(0.48, 0.96, p) })),
        timing,
      ));
    }

    let done = false;
    const cleanup = completed => {
      if (done) return;
      done = true;
      activeCleanup = null;
      for (const anim of anims) {
        anim.onfinish = null;
        anim.cancel();
      }
      elevation.remove();
      traveller?.remove();
      delete dialog.dataset.morphing;
      dialog.style.clipPath = '';
      dialog.style.opacity = '';
      if (dialogMark) dialogMark.style.visibility = '';
      delete launcher.dataset.morphing;
      launcher.style.opacity = '';
      launcher.style.visibility = '';
      if (launcherMark) launcherMark.style.visibility = '';
      if (completed) onFinish?.();
    };

    activeCleanup = () => cleanup(false);
    anims[0].onfinish = () => cleanup(true);
  }

  return {
    open() {
      cancel();
      if (prefersReducedMotion() || typeof launcher.animate !== 'function') {
        launcher.hidden = true;
        dialog.hidden = false;
        return;
      }
      const pillRect = launcher.getBoundingClientRect();
      const pillMarkRect = launcherMark?.getBoundingClientRect();
      launcher.hidden = true;
      dialog.hidden = false;
      const cardRect = dialog.getBoundingClientRect();
      const cardMarkRect = dialogMark?.getBoundingClientRect();
      if (pillRect.width <= 0 || cardRect.width <= 0) return;

      const pillR = pillRect.height / 2;
      runMorph({
        fromBox: { x: pillRect.left, y: pillRect.top, w: pillRect.width, h: pillRect.height, radii: [pillR, pillR, pillR, pillR] },
        toBox: { x: cardRect.left, y: cardRect.top, w: cardRect.width, h: cardRect.height, radii: [18, 18, 18, 18] },
        fromMark: pillMarkRect ? { x: pillMarkRect.left, y: pillMarkRect.top, w: pillMarkRect.width, h: pillMarkRect.height, r: pillMarkRect.height / 2 } : null,
        toMark: cardMarkRect ? { x: cardMarkRect.left, y: cardMarkRect.top, w: cardMarkRect.width, h: cardMarkRect.height, r: 9 } : null,
        cardOrigin: { x: cardRect.left, y: cardRect.top },
        opening: true,
        duration: UNLOCK_OPEN_DURATION,
      });
    },
    close() {
      cancel();
      if (prefersReducedMotion() || typeof dialog.animate !== 'function') {
        dialog.hidden = true;
        launcher.hidden = false;
        return;
      }
      const cardRect = dialog.getBoundingClientRect();
      const cardMarkRect = dialogMark?.getBoundingClientRect();
      launcher.hidden = false;
      launcher.style.visibility = 'hidden';
      const pillRect = launcher.getBoundingClientRect();
      const pillMarkRect = launcherMark?.getBoundingClientRect();
      launcher.style.visibility = '';
      if (pillRect.width <= 0 || cardRect.width <= 0) {
        dialog.hidden = true;
        return;
      }

      const pillR = pillRect.height / 2;
      runMorph({
        fromBox: { x: cardRect.left, y: cardRect.top, w: cardRect.width, h: cardRect.height, radii: [18, 18, 18, 18] },
        toBox: { x: pillRect.left, y: pillRect.top, w: pillRect.width, h: pillRect.height, radii: [pillR, pillR, pillR, pillR] },
        fromMark: cardMarkRect ? { x: cardMarkRect.left, y: cardMarkRect.top, w: cardMarkRect.width, h: cardMarkRect.height, r: 9 } : null,
        toMark: pillMarkRect ? { x: pillMarkRect.left, y: pillMarkRect.top, w: pillMarkRect.width, h: pillMarkRect.height, r: pillMarkRect.height / 2 } : null,
        cardOrigin: { x: cardRect.left, y: cardRect.top },
        opening: false,
        duration: UNLOCK_CLOSE_DURATION,
        onFinish: () => {
          dialog.hidden = true;
          launcher.hidden = false;
        },
      });
    },
  };
}

export function initReviewAccess() {
  onReady(() => {
  // A back/forward-cache restore must re-check access with the server.
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  const access = document.querySelector('[data-review-access]');
  if (access) {
    const launcher = access.querySelector('[data-review-unlock]');
    const dialog = access.querySelector('[data-review-unlock-dialog]');
    const form = access.querySelector('form');
    const status = access.querySelector('[data-review-unlock-status]');
    const submit = form.querySelector('[type="submit"]');
    const submitLabel = submit.querySelector('[data-review-submit-label]');
    const defaultSubmitText = submitLabel ? submitLabel.textContent : '';
    const nameInput = form.elements.name;
    const passwordInput = form.elements.password;
    const nameBox = access.querySelector('[data-review-name-box]');
    const passwordBox = access.querySelector('[data-review-password-box]');
    const avatarEl = access.querySelector('[data-review-unlock-avatar]');
    const avatarInitials = access.querySelector('[data-review-unlock-initials]');
    const passwordToggle = access.querySelector('[data-review-password-toggle]');
    const morph = createUnlockMorph(access, launcher, dialog);
    let sending = false;
    let isOpen = false;

    try {
      if (sessionStorage.getItem('site-review-just-locked') === '1') {
        sessionStorage.removeItem('site-review-just-locked');
        if (!prefersReducedMotion()) {
          launcher.classList.add('review-unlock-launcher-entering');
          launcher.addEventListener('animationend', () => launcher.classList.remove('review-unlock-launcher-entering'), { once: true });
        }
      }
    } catch { /* Optional convenience. */ }

    try {
      if (localStorage.getItem('state-reviewer-name') === 'Deployment check') localStorage.removeItem('state-reviewer-name');
      nameInput.value = localStorage.getItem('site-review-reviewer-name')
        || localStorage.getItem('state-reviewer-name')
        || '';
    } catch { /* Optional convenience. */ }

    function syncNameIdentity() {
      const trimmed = nameInput.value.trim();
      if (!avatarEl || !avatarInitials) return;
      if (!trimmed) {
        avatarEl.classList.add('is-empty');
        avatarEl.style.removeProperty('--user-color');
        avatarInitials.textContent = '';
        nameBox?.style.removeProperty('--field-accent');
        return;
      }
      const color = reviewerColor(trimmed);
      avatarEl.classList.remove('is-empty');
      avatarEl.style.setProperty('--user-color', color);
      avatarInitials.textContent = initials(trimmed);
      nameBox?.style.setProperty('--field-accent', color);
    }
    syncNameIdentity();

    nameInput.addEventListener('input', () => {
      syncNameIdentity();
      if (nameBox?.dataset.invalid) {
        delete nameBox.dataset.invalid;
        status.textContent = '';
      }
    });
    passwordInput.addEventListener('input', () => {
      if (passwordBox?.dataset.invalid) {
        delete passwordBox.dataset.invalid;
        status.textContent = '';
      }
    });

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

    function openUnlock() {
      if (isOpen) return;
      isOpen = true;
      setPasswordVisible(false);
      status.textContent = '';
      if (nameBox) delete nameBox.dataset.invalid;
      if (passwordBox) delete passwordBox.dataset.invalid;
      syncNameIdentity();
      launcher.setAttribute('aria-expanded', 'true');
      morph.open();
      const focusTarget = nameInput.value.trim() ? passwordInput : nameInput;
      focusTarget.focus({ preventScroll: true });
    }

    function closeUnlock({ restoreFocus = false } = {}) {
      if (!isOpen || sending) return;
      isOpen = false;
      setPasswordVisible(false);
      launcher.setAttribute('aria-expanded', 'false');
      morph.close();
      if (restoreFocus) launcher.focus({ preventScroll: true });
    }

    launcher.addEventListener('click', openUnlock);
    access.querySelector('[data-review-unlock-close]').addEventListener('click', () => closeUnlock({ restoreFocus: true }));
    document.addEventListener('pointerdown', event => {
      if (!isOpen || sending || access.contains(event.target)) return;
      closeUnlock({ restoreFocus: false });
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && isOpen && !sending) {
        event.preventDefault();
        event.stopPropagation();
        closeUnlock({ restoreFocus: true });
      }
    });

    function setSubmitting(busy) {
      sending = busy;
      submit.disabled = busy;
      if (busy) {
        submit.dataset.loading = 'true';
        if (submitLabel) submitLabel.textContent = t('signing_in');
      } else {
        delete submit.dataset.loading;
        if (submitLabel) submitLabel.textContent = defaultSubmitText;
      }
    }

    function flagError(message, targetBox, targetInput, { select = false } = {}) {
      status.textContent = message;
      if (targetBox) {
        targetBox.dataset.invalid = 'true';
        if (!prefersReducedMotion() && typeof targetBox.animate === 'function') {
          targetBox.animate(
            [
              { transform: 'translateX(0)' },
              { transform: 'translateX(-5px)' },
              { transform: 'translateX(4px)' },
              { transform: 'translateX(-3px)' },
              { transform: 'translateX(2px)' },
              { transform: 'translateX(0)' },
            ],
            { duration: 280, easing: 'ease-out' },
          );
        }
      }
      if (targetInput) {
        targetInput.focus({ preventScroll: true });
        if (select) {
          try { targetInput.select(); } catch { /* Optional */ }
        }
      }
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (sending) return;
      const name = nameInput.value.trim();
      if (!name) {
        flagError(t('name_required'), nameBox, nameInput);
        return;
      }
      if (!passwordInput.value) {
        flagError(t('password_required'), passwordBox, passwordInput);
        return;
      }
      status.textContent = '';
      if (nameBox) delete nameBox.dataset.invalid;
      if (passwordBox) delete passwordBox.dataset.invalid;
      setSubmitting(true);
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
          const errorMessage = messages[response.status]
            || (data.errors ? Object.values(data.errors).flat().join(' ') : data.message)
            || t('error_signin_failed');
          const hasNameError = Boolean(data?.errors?.name);
          const hasPasswordError = response.status === 422 && !hasNameError;
          setSubmitting(false);
          flagError(
            errorMessage,
            hasNameError ? nameBox : (hasPasswordError ? passwordBox : null),
            hasNameError ? nameInput : (hasPasswordError ? passwordInput : null),
            { select: hasPasswordError },
          );
          return;
        }
        rememberReviewer(name);
        try { sessionStorage.setItem('site-review-just-unlocked', '1'); } catch { /* Optional */ }
        passwordInput.value = '';
        location.reload();
      } catch (error) {
        setSubmitting(false);
        flagError(error instanceof TypeError ? t('error_offline') : error.message, null, null);
      }
    });
    return;
  }

  const root = document.querySelector('[data-feedback]');
  if (!root) return;
  try {
    if (sessionStorage.getItem('site-review-just-unlocked') === '1') {
      sessionStorage.removeItem('site-review-just-unlocked');
      const toolbar = root.querySelector('.feedback-toolbar');
      if (toolbar && !prefersReducedMotion()) {
        toolbar.classList.add('feedback-toolbar-entering');
        toolbar.addEventListener('animationend', () => toolbar.classList.remove('feedback-toolbar-entering'), { once: true });
      }
    }
  } catch { /* Optional */ }
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
      try { sessionStorage.setItem('site-review-just-locked', '1'); } catch { /* Optional */ }
      location.reload();
    } catch {
      status.textContent = t('signout_failed');
      $('[data-review-lock]').disabled = false;
    }
  });
  });
}
