let toastTimer;
let refreshingToken = null;
let cachedConfig = null;

export const REVIEWER_COLORS = [
  '#93c5fd',
  '#86efac',
  '#fde68a',
  '#fdba74',
  '#5eead4',
  '#c4b5fd',
  '#fda4af',
  '#bef264',
];

export function onReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}

export function reviewConfig() {
  if (cachedConfig) return cachedConfig;
  const el = document.querySelector('[data-review-config]');
  if (el?.textContent) {
    try {
      cachedConfig = JSON.parse(el.textContent);
      return cachedConfig;
    } catch { /* Fallback to defaults. */ }
  }
  cachedConfig = { locale: 'en', i18n: {}, pages: {}, sharedKeyPrefixes: [], captureTargets: [] };
  return cachedConfig;
}

export function t(key, replacements = {}) {
  const dict = reviewConfig().i18n || {};
  let value = dict[key] ?? key;
  for (const [param, replacement] of Object.entries(replacements)) {
    value = value.replaceAll(`:${param}`, String(replacement));
  }
  return value;
}

export function dateLocale() {
  return reviewConfig().i18n?.date_locale || 'en-GB';
}

export function relativeTime(value, now = Date.now()) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  if (Number.isNaN(timestamp)) return '';
  const diffSeconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (diffSeconds < 45) {
    const dict = reviewConfig().i18n || {};
    return dict.just_now || (dateLocale().startsWith('nl') ? 'zojuist' : 'just now');
  }
  const locale = dateLocale();
  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
    const minutes = Math.round(diffSeconds / 60);
    if (minutes < 60) return rtf.format(-minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (hours < 24) return rtf.format(-hours, 'hour');
    const days = Math.round(hours / 24);
    if (days < 30) return rtf.format(-days, 'day');
    const months = Math.round(days / 30);
    if (months < 12) return rtf.format(-months, 'month');
    return rtf.format(-Math.round(days / 365), 'year');
  } catch {
    return new Date(timestamp).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  }
}

export function pageLabel(page) {
  const pages = reviewConfig().pages || {};
  return pages[page] || page;
}

export function isSharedCopy(el) {
  if (el?.dataset?.copyShared === 'true') return true;
  const key = el?.dataset?.copyKey || '';
  const prefixes = reviewConfig().sharedKeyPrefixes || [];
  return prefixes.some(prefix => prefix && key.startsWith(prefix));
}

export function reviewerColor(name) {
  const key = (name || '').trim().toLowerCase();
  if (!key) return REVIEWER_COLORS[0];
  let hash = 17;
  for (const ch of key) hash = (Math.imul(hash, 37) + ch.codePointAt(0)) >>> 0;
  return REVIEWER_COLORS[hash % REVIEWER_COLORS.length];
}

export function applyReviewerColor(element, name) {
  element?.style.setProperty('--user-color', reviewerColor(name));
  return element;
}

export function initials(name) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => [...part][0]).join('').toUpperCase() || '?';
}

export function reviewerName() {
  const name = document.querySelector('[data-feedback]')?.dataset.reviewerName;
  if (name) return name;
  try {
    return localStorage.getItem('site-review-reviewer-name')
      || localStorage.getItem('state-reviewer-name')
      || '';
  } catch {
    return '';
  }
}

export function rememberReviewer(name) {
  const trimmed = (name || '').trim();
  try {
    if (trimmed) localStorage.setItem('site-review-reviewer-name', trimmed);
  } catch { /* Storage is optional. */ }
  const root = document.querySelector('[data-feedback]');
  if (root) {
    if (trimmed) root.dataset.reviewerName = trimmed;
    root.style.setProperty('--self-color', reviewerColor(trimmed));
  }
  document.querySelectorAll('[data-review-people-toggle]').forEach(el => applyReviewerColor(el, trimmed));
  document.querySelectorAll('[data-review-avatar]').forEach(el => {
    el.textContent = initials(trimmed);
    if (!el.closest('button')?.querySelector('.review-tooltip')) {
      el.title = trimmed ? t('your_name_prefix', { name: trimmed }) : t('your_name');
    } else {
      el.removeAttribute('title');
    }
    applyReviewerColor(el, trimmed);
  });
  document.querySelectorAll('[data-review-self-tooltip]').forEach(el => {
    el.textContent = trimmed ? `${trimmed}${t('you_suffix')}` : t('your_name');
  });
  document.querySelectorAll('[data-review-name-label]').forEach(el => {
    el.textContent = trimmed;
  });
  const signedIn = document.querySelector('[data-review-signed-in]');
  if (signedIn && trimmed) signedIn.textContent = t('signed_in_as', { name: trimmed });
}

export function csrfToken() {
  return document.querySelector('[data-feedback] [name="_token"]')?.value || '';
}

export function setCsrfToken(token) {
  if (!token) return;
  document.querySelectorAll('[name="_token"]').forEach(el => { el.value = token; });
}

async function refreshSessionToken() {
  const sessionUrl = document.querySelector('[data-feedback]')?.dataset.sessionUrl;
  if (!sessionUrl) return null;
  if (!refreshingToken) {
    refreshingToken = (async () => {
      try {
        const response = await fetch(sessionUrl, { headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok) return response;
        const data = await response.json();
        setCsrfToken(data.token);
        if (data.name) rememberReviewer(data.name);
        return null;
      } finally {
        refreshingToken = null;
      }
    })();
  }
  return refreshingToken;
}

export async function reviewFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const makeHeaders = () => ({
    Accept: 'application/json',
    ...(options.headers || {}),
    ...(method !== 'GET' && method !== 'HEAD' ? { 'X-CSRF-TOKEN': csrfToken() } : {}),
  });
  const response = await fetch(url, { ...options, method, headers: makeHeaders() });
  if (response.status !== 419 || method === 'GET' || method === 'HEAD') return response;

  const failedRefresh = await refreshSessionToken();
  if (failedRefresh) return failedRefresh;
  return fetch(url, { ...options, method, headers: makeHeaders() });
}

export function reviewToast(message, options = {}) {
  const el = document.querySelector('[data-feedback-toast]');
  if (!el) return;
  el.replaceChildren();
  const span = document.createElement('span');
  span.textContent = message;
  el.append(span);
  if (options.actionLabel && typeof options.onAction === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'feedback-toast-action';
    btn.textContent = options.actionLabel;
    btn.addEventListener('click', () => {
      clearTimeout(toastTimer);
      el.hidden = true;
      options.onAction();
    });
    el.append(btn);
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, options.duration ?? 4500);
}

export function reviewMode(mode) {
  const root = document.querySelector('[data-feedback]');
  root.dataset.mode = mode;
  root.querySelector('[data-review-cursor]').setAttribute('aria-pressed', String(mode === 'cursor'));
}

export function reviewBusy(busy) {
  document.querySelector('[data-feedback]').dataset.busy = String(busy);
  document.querySelectorAll('.feedback-toolbar button').forEach(el => {
    const isPeopleButton = el.hasAttribute('data-review-people-toggle') || el.hasAttribute('data-review-people-peer');
    el.disabled = busy || (document.querySelector('[data-feedback]').dataset.expired === 'true' && !isPeopleButton);
  });
}

export function typing(event) {
  return event.target.closest('input, textarea, select, [contenteditable="true"]') || event.metaKey || event.ctrlKey || event.altKey;
}
