import { onReady, reviewerColor, reviewFetch, t } from './review-ui';

onReady(async () => {
  const layer = document.querySelector('[data-review-live-cursors]');
  if (!layer) return;
  const root = document.querySelector('[data-feedback]');
  const toggle = root.querySelector('[data-review-cursors-toggle]');
  const status = root.querySelector('[data-review-cursors-status]');
  const mouse = matchMedia('(any-pointer: fine)');
  let enabled = true;
  try {
    const stored = localStorage.getItem('site-review-live-cursors') ?? localStorage.getItem('state-live-cursors');
    enabled = stored !== 'hidden';
  } catch { /* Optional preference. */ }
  let expired = false;
  let echo;
  let channel;
  let subscribed = false;
  let members = new Map();
  const cursors = new Map();
  let pointer = null;
  let lastSent = 0;
  let wasVisible = false;
  const anchors = new Map();
  document.querySelectorAll('[data-copy-key]').forEach(el => anchors.set(`copy:${el.dataset.copyKey}`, el));

  const { default: Echo } = await import('laravel-echo');
  const { default: Pusher } = await import('pusher-js');
  function updateStatus(message) {
    toggle.setAttribute('aria-checked', String(enabled && mouse.matches));
    toggle.disabled = !mouse.matches || expired;
    status.textContent = expired
      ? t('cursors_signed_out')
      : !mouse.matches
        ? t('cursors_mouse_only')
        : !enabled
          ? t('cursors_off')
          : message;
  }
  function remove(id) { cursors.get(id)?.element.remove(); cursors.delete(id); }
  function clear() { for (const id of cursors.keys()) remove(id); }
  function draw(cursor) {
    const el = cursor.anchor.startsWith('copy:') ? anchors.get(cursor.anchor) : document.getElementById(cursor.anchor.slice(3));
    if (!el || !el.getClientRects().length) { cursor.element.hidden = true; return; }
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width * cursor.x;
    const y = rect.top + rect.height * cursor.y;
    cursor.element.hidden = x < 0 || x > innerWidth || y < 0 || y > innerHeight - 52;
    cursor.element.style.transform = `translate(${x}px, ${y}px)`;
    cursor.element.classList.toggle('review-live-cursor-left', x > innerWidth - 160);
  }
  function receive(data) {
    if (!subscribed || !enabled || document.hidden || !members.has(data?.id)) return;
    if (!data.visible) { remove(data.id); return; }
    if (typeof data.anchor !== 'string' || !/^(copy|id):[a-zA-Z0-9_\-:.]+$/.test(data.anchor) || ![data.x, data.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) return;
    const member = members.get(data.id);
    let cursor = cursors.get(data.id);
    if (!cursor) {
      const element = document.createElement('div');
      element.className = 'review-live-cursor';
      element.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 2 21 12l-8 2-3 8Z"/></svg><span></span>';
      layer.append(element);
      cursor = { element };
      cursors.set(data.id, cursor);
    }
    cursor.element.style.setProperty('--cursor-color', reviewerColor(member.name));
    cursor.element.querySelector('span').textContent = member.name;
    Object.assign(cursor, { anchor: data.anchor, x: data.x, y: data.y, seen: Date.now() });
    draw(cursor);
  }
  function position() {
    if (!pointer) return null;
    const target = document.elementFromPoint(pointer.x, pointer.y);
    if (!target || target.closest('.feedback, dialog, form, input, textarea, select, [contenteditable="true"]')) return null;
    const el = target.closest('[data-copy-key], [id]');
    if (!el || el === document.body || el === document.documentElement) return null;
    const rect = el.getBoundingClientRect();
    const anchor = el.dataset.copyKey ? `copy:${el.dataset.copyKey}` : `id:${el.id}`;
    if (!rect.width || !rect.height || !/^(copy|id):[a-zA-Z0-9_\-:.]+$/.test(anchor)) return null;
    return { visible: true, anchor, x: Math.max(0, Math.min(1, (pointer.x - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (pointer.y - rect.top) / rect.height)) };
  }
  function send(force = false) {
    if (!subscribed || !channel || document.hidden) return;
    if (!force && performance.now() - lastSent < 125) return;
    const data = position();
    if (!data && !wasVisible) return;
    channel.whisper('cursor', data || { visible: false });
    wasVisible = Boolean(data);
    lastSent = performance.now();
  }
  function stop() {
    subscribed = false;
    wasVisible = false;
    echo?.disconnect();
    echo = null;
    channel = null;
    members.clear();
    clear();
  }
  function start() {
    if (expired || !enabled || !mouse.matches || document.hidden || echo) return;
    updateStatus(t('cursors_connecting'));
    echo = new Echo({
      broadcaster: 'reverb', Pusher,
      key: layer.dataset.key, wsHost: layer.dataset.host,
      wsPort: Number(layer.dataset.port), wssPort: Number(layer.dataset.port),
      forceTLS: layer.dataset.scheme === 'https', enabledTransports: ['ws', 'wss'],
      authorizer: target => ({ authorize: async (socketId, callback) => {
        try {
          const response = await reviewFetch(layer.dataset.authUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ socket_id: socketId, channel_name: target.name, page: location.pathname }),
          });
          if (response.status === 401) document.dispatchEvent(new Event('review:expired'));
          if (!response.ok) throw new Error('Cursor access unavailable');
          callback(null, await response.json());
        } catch (error) { callback(error, null); updateStatus(t('cursors_reconnecting')); }
      } }),
    });
    echo.connector.pusher.connection.bind('state_change', ({ current }) => {
      if (current !== 'connected') { subscribed = false; clear(); updateStatus(t('cursors_reconnecting')); }
    });
    join();
  }
  function join() {
    if (!echo) return;
    subscribed = false;
    clear();
    members.clear();
    echo.leave(layer.dataset.channel);
    channel = echo.join(layer.dataset.channel)
      .here(people => {
        members = new Map(people.map(person => [person.id, person]));
        subscribed = true;
        updateStatus(t('cursors_active'));
        send(true);
      })
      .joining(person => { members.set(person.id, person); send(true); })
      .leaving(person => { members.delete(person.id); remove(person.id); })
      .listenForWhisper('cursor', receive)
      .error(() => { subscribed = false; clear(); updateStatus(t('cursors_reconnecting')); });
  }
  toggle.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem('site-review-live-cursors', enabled ? 'visible' : 'hidden'); } catch { /* Optional preference. */ }
    stop(); start(); updateStatus(t('cursors_connecting'));
  });
  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || !enabled) return;
    pointer = { x: event.clientX, y: event.clientY };
    send();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { pointer = null; send(true); });
  window.addEventListener('blur', () => { pointer = null; send(true); });
  document.addEventListener('visibilitychange', () => { stop(); start(); });
  mouse.addEventListener('change', () => { stop(); start(); updateStatus(t('cursors_connecting')); });
  document.addEventListener('review:expired', () => { expired = true; stop(); updateStatus(''); });
  document.addEventListener('review:renamed', join);
  document.addEventListener('review:locking', stop);
  window.addEventListener('pagehide', stop);
  let frame;
  function redraw() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = null; for (const cursor of cursors.values()) draw(cursor); send(); });
  }
  document.addEventListener('scroll', redraw, { capture: true, passive: true });
  window.addEventListener('resize', redraw);
  setInterval(() => {
    for (const [id, cursor] of cursors) if (Date.now() - cursor.seen > 5000) remove(id);
    send();
  }, 1000);
  // Renew the server-signed lease, including Laravel session and password checks.
  setInterval(join, 60000);
  updateStatus(t('cursors_connecting'));
  start();
});
