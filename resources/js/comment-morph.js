import { initials, reviewerColor } from './review-ui';

export const TONEN_EASE_CSS = 'cubic-bezier(0.32, 0.72, 0, 1)';
export const TONEN_POP_CSS = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

const OPEN_DURATION = 300;
const CLOSE_DURATION = 240;
const DOCKED_OPEN_DURATION = 210;
const DOCKED_CLOSE_DURATION = 150;
const DRAFT_OPEN_DURATION = 175;
const GLIDE_DURATION = 240;
const GLIDE_ANIM_ID = 'site-review-glide';
const BEZIER_KAPPA = 0.5522847498307936;
const RESOLVED_PIN_OPACITY = 0.48;
const RESOLVED_PIN_SATURATE = 0.75;

function createCubicBezier(x1, y1, x2, y2) {
  const sample = (a, b, t) => (((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t + 3 * a) * t;
  const slope = (a, b, t) => 3 * (1 - 3 * b + 3 * a) * t * t + 2 * (3 * b - 6 * a) * t + 3 * a;
  return x => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sample(x1, x2, t) - x;
      if (Math.abs(err) < 1e-7) return sample(y1, y2, t);
      const d = slope(x1, x2, t);
      if (Math.abs(d) < 1e-6) break;
      t = Math.min(1, Math.max(0, t - err / d));
    }
    let lo = 0;
    let hi = 1;
    t = x;
    while (hi - lo > 1e-7) {
      if (sample(x1, x2, t) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sample(y1, y2, t);
  };
}

export const tonenEase = createCubicBezier(0.32, 0.72, 0, 1);

export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (edge0, edge1, x) => {
  const r = clamp((x - edge0) / (edge1 - edge0));
  return r * r * (3 - 2 * r);
};

export function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

export function tailRadii(tail) {
  switch (tail) {
    case 'bottom-left': return [18, 18, 18, 5];
    case 'bottom-right': return [18, 18, 5, 18];
    case 'top-left': return [5, 18, 18, 18];
    case 'top-right': return [18, 5, 18, 18];
    default: return [18, 18, 18, 18];
  }
}

export function roundedRectPath(box, origin = { x: 0, y: 0 }) {
  const maxR = Math.max(0, Math.min(box.w, box.h) / 2);
  const tl = clamp(box.radii[0], 0, maxR);
  const tr = clamp(box.radii[1], 0, maxR);
  const br = clamp(box.radii[2], 0, maxR);
  const bl = clamp(box.radii[3], 0, maxR);
  const x0 = box.x - origin.x;
  const y0 = box.y - origin.y;
  const x1 = x0 + box.w;
  const y1 = y0 + box.h;
  const k = BEZIER_KAPPA;
  const f = n => n.toFixed(3);

  return `path("M${f(x0 + tl)} ${f(y0)}`
    + ` L${f(x1 - tr)} ${f(y0)}`
    + ` C${f(x1 - tr + k * tr)} ${f(y0)} ${f(x1)} ${f(y0 + tr - k * tr)} ${f(x1)} ${f(y0 + tr)}`
    + ` L${f(x1)} ${f(y1 - br)}`
    + ` C${f(x1)} ${f(y1 - br + k * br)} ${f(x1 - br + k * br)} ${f(y1)} ${f(x1 - br)} ${f(y1)}`
    + ` L${f(x0 + bl)} ${f(y1)}`
    + ` C${f(x0 + bl - k * bl)} ${f(y1)} ${f(x0)} ${f(y1 - bl + k * bl)} ${f(x0)} ${f(y1 - bl)}`
    + ` L${f(x0)} ${f(y0 + tl)}`
    + ` C${f(x0)} ${f(y0 + tl - k * tl)} ${f(x0 + tl - k * tl)} ${f(y0)} ${f(x0 + tl)} ${f(y0)} Z")`;
}

export function pinDirection(point, toolbarInset = 48, prevDir = null) {
  const dx = point.x - innerWidth / 2;
  const dy = point.y - (innerHeight - toolbarInset) / 2;
  const isLeft = prevDir && Math.abs(dx) < 24 ? prevDir.endsWith('left') : dx < 0;
  const isTop = prevDir && Math.abs(dy) < 24 ? prevDir.startsWith('top') : dy < 0;
  return isTop
    ? (isLeft ? 'top-left' : 'top-right')
    : (isLeft ? 'bottom-left' : 'bottom-right');
}

function measurePinState(pin, note, { resting = false, initialRect = null, initialOpacity = null } = {}) {
  const offsetW = pin.offsetWidth || 33;
  const offsetH = pin.offsetHeight || 33;
  const dir = pin.dataset.point || 'bottom-left';
  const isLeft = dir.endsWith('left');
  const isTop = dir.startsWith('top');
  let outer;
  let scale = 1;

  if (initialRect && initialRect.width > 0 && initialRect.height > 0) {
    scale = offsetH > 0 ? initialRect.height / offsetH : 1;
    outer = {
      x: initialRect.left,
      y: initialRect.top,
      w: initialRect.width,
      h: initialRect.height,
    };
  } else if (resting) {
    const styleLeft = parseFloat(pin.style.left);
    const styleTop = parseFloat(pin.style.top);
    scale = pin.matches?.(':focus-visible') ? 1.12 : 1;
    if (Number.isFinite(styleLeft) && Number.isFinite(styleTop)) {
      outer = {
        x: isLeft ? styleLeft - 2 * scale : styleLeft - (offsetW - 2) * scale,
        y: isTop ? styleTop - 2 * scale : styleTop - (offsetH - 2) * scale,
        w: offsetW * scale,
        h: offsetH * scale,
      };
    }
  }

  if (!outer) {
    const rect = pin.getBoundingClientRect();
    scale = offsetH > 0 && rect.height > 0 ? rect.height / offsetH : 1;
    outer = {
      x: rect.left,
      y: rect.top,
      w: rect.width || offsetW,
      h: rect.height || offsetH,
    };
  }

  const border = 3 * scale;
  const innerW = Math.max(10, outer.w - 2 * border);
  const innerH = Math.max(10, outer.h - 2 * border);
  const outerR = outer.h / 2;
  const innerR = innerH / 2;
  const tipIndex = isTop ? (isLeft ? 0 : 1) : (isLeft ? 3 : 2);
  const outerRadii = [outerR, outerR, outerR, outerR];
  outerRadii[tipIndex] = 5 * scale;
  const innerRadii = [innerR, innerR, innerR, innerR];
  innerRadii[tipIndex] = Math.max(2, 5 * scale - border);
  const isResolvedPin = pin.classList.contains('feedback-pin-resolved');
  const isThread = pin.classList.contains('feedback-pin-thread') || isResolvedPin;
  const pinBgImage = pin.style.background?.includes('gradient') ? pin.style.background : '';
  const focusedOrActive = pin.matches?.(':focus-visible');
  let surfaceAlpha = 1;
  let surfaceSat = 1;
  if (resting) {
    surfaceAlpha = isResolvedPin && !focusedOrActive ? RESOLVED_PIN_OPACITY : 1;
    surfaceSat = isResolvedPin && !focusedOrActive ? RESOLVED_PIN_SATURATE : 1;
  } else {
    const rawOpacity = initialOpacity ?? Number.parseFloat(getComputedStyle(pin).opacity);
    surfaceAlpha = Number.isFinite(rawOpacity) ? clamp(rawOpacity, 0.1, 1) : (isResolvedPin ? RESOLVED_PIN_OPACITY : 1);
    surfaceSat = isResolvedPin && surfaceAlpha < 0.95 ? RESOLVED_PIN_SATURATE : 1;
  }

  return {
    state: {
      x: outer.x,
      y: outer.y,
      w: outer.w,
      h: outer.h,
      radii: outerRadii,
      bgMix: 0,
      content: 0,
      surfaceAlpha,
      surfaceSat,
      avatar: {
        x: outer.x + border,
        y: outer.y + border,
        w: innerW,
        h: innerH,
        radii: innerRadii,
        alpha: 1,
        pinMix: 1,
        textScale: scale,
      },
    },
    visual: {
      isThread,
      pinBgImage,
      authorColor: reviewerColor(note?.name),
      authorInitials: initials(note?.name || ''),
      nodes: [...pin.childNodes].map(node => node.cloneNode(true)),
    },
  };
}

function measureCardState(sticky, cardBox, fallbackAvatar) {
  const rect = sticky.getBoundingClientRect();
  const x = cardBox?.left ?? rect.left;
  const y = cardBox?.top ?? rect.top;
  const w = cardBox?.width ?? rect.width;
  const h = cardBox?.height ?? rect.height;
  const radii = tailRadii(sticky.dataset.tail);
  const rootAvatar = sticky.querySelector('.feedback-thread > .feedback-entry:first-child > .feedback-author-row > .review-avatar');
  const threadEl = sticky.querySelector('.feedback-thread');

  let avatar = null;
  let visibleRootAvatar = null;
  if (rootAvatar && threadEl) {
    const ar = rootAvatar.getBoundingClientRect();
    const tr = threadEl.getBoundingClientRect();
    if (ar.width > 0 && ar.top >= tr.top - 1 && ar.bottom <= tr.bottom + 1) {
      const r = ar.height / 2;
      avatar = {
        x: x + (ar.left - rect.left),
        y: y + (ar.top - rect.top),
        w: ar.width,
        h: ar.height,
        radii: [r, r, r, r],
        alpha: 1,
        pinMix: 0,
        textScale: 1,
      };
      visibleRootAvatar = rootAvatar;
    }
  }

  if (!avatar) {
    avatar = {
      ...(fallbackAvatar || { x: x + 12, y: y + 52, w: 28, h: 28, radii: [14, 14, 14, 14] }),
      alpha: 0,
      pinMix: 0,
      textScale: 1,
    };
  }

  return {
    state: {
      x,
      y,
      w,
      h,
      radii,
      bgMix: 1,
      content: 1,
      surfaceAlpha: 1,
      surfaceSat: 1,
      avatar,
    },
    rootAvatar: visibleRootAvatar,
  };
}

function interpolatePair(a, b, t) {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    w: lerp(a.w, b.w, t),
    h: lerp(a.h, b.h, t),
    radii: [0, 1, 2, 3].map(i => lerp(a.radii[i], b.radii[i], t)),
    bgMix: lerp(a.bgMix, b.bgMix, t),
    content: lerp(a.content, b.content, t),
    surfaceAlpha: lerp(a.surfaceAlpha ?? 1, b.surfaceAlpha ?? 1, t),
    surfaceSat: lerp(a.surfaceSat ?? 1, b.surfaceSat ?? 1, t),
    avatar: {
      x: lerp(a.avatar.x, b.avatar.x, t),
      y: lerp(a.avatar.y, b.avatar.y, t),
      w: lerp(a.avatar.w, b.avatar.w, t),
      h: lerp(a.avatar.h, b.avatar.h, t),
      radii: [0, 1, 2, 3].map(i => lerp(a.avatar.radii[i], b.avatar.radii[i], t)),
      alpha: lerp(a.avatar.alpha, b.avatar.alpha, t),
      pinMix: lerp(a.avatar.pinMix, b.avatar.pinMix, t),
      textScale: lerp(a.avatar.textScale, b.avatar.textScale, t),
    },
  };
}

function buildMorphStates(from, to, isOpening, duration, refCard) {
  const steps = Math.max(16, Math.ceil((duration * 180) / 1000));
  const vpLeft = 8;
  const vpTop = 8;
  const vpRight = Math.max(vpLeft + 60, innerWidth - 8);
  const vpBottom = Math.max(vpTop + 60, innerHeight - 56);
  const clampToViewport = from.x >= -4 && from.y >= -4 && to.x >= -4 && to.y >= -4;
  const minW = Math.min(from.w, to.w);
  const minH = Math.min(from.h, to.h);
  const spanW = Math.max(1, refCard.w - minW);
  const spanH = Math.max(1, refCard.h - minH);
  const states = [];

  for (let i = 0; i <= steps; i++) {
    const t = tonenEase(i / steps);
    let w = Math.max(24, lerp(from.w, to.w, t));
    let h = Math.max(24, lerp(from.h, to.h, t));
    let x = lerp(from.x, to.x, t);
    let y = lerp(from.y, to.y, t);

    if (clampToViewport) {
      w = Math.min(w, vpRight - vpLeft);
      h = Math.min(h, vpBottom - vpTop);
      x = clamp(x, vpLeft, vpRight - w);
      y = clamp(y, vpTop, vpBottom - h);
    }

    const avAlpha = to.avatar.alpha === 0
      ? from.avatar.alpha * (1 - smoothstep(0, 0.25, t))
      : (from.avatar.alpha === 0
        ? to.avatar.alpha * smoothstep(0.75, 1, t)
        : lerp(from.avatar.alpha, to.avatar.alpha, t));

    const sizeProgress = clamp(Math.min((w - minW) / spanW, (h - minH) / spanH));
    const content = isOpening
      ? smoothstep(0.95, 1, sizeProgress) * smoothstep(0.95, 1, t)
      : from.content * smoothstep(0.84, 1, sizeProgress);

    states.push({
      x,
      y,
      w,
      h,
      radii: [0, 1, 2, 3].map(idx => lerp(from.radii[idx], to.radii[idx], t)),
      bgMix: lerp(from.bgMix, to.bgMix, t),
      content,
      surfaceAlpha: lerp(from.surfaceAlpha ?? 1, to.surfaceAlpha ?? 1, t),
      surfaceSat: lerp(from.surfaceSat ?? 1, to.surfaceSat ?? 1, t),
      avatar: {
        x: lerp(from.avatar.x, to.avatar.x, t),
        y: lerp(from.avatar.y, to.avatar.y, t),
        w: lerp(from.avatar.w, to.avatar.w, t),
        h: lerp(from.avatar.h, to.avatar.h, t),
        radii: [0, 1, 2, 3].map(idx => lerp(from.avatar.radii[idx], to.avatar.radii[idx], t)),
        alpha: avAlpha,
        pinMix: lerp(from.avatar.pinMix, to.avatar.pinMix, t),
        textScale: lerp(from.avatar.textScale, to.avatar.textScale, t),
      },
    });
  }

  states[steps] = {
    ...to,
    radii: [...to.radii],
    avatar: { ...to.avatar, radii: [...to.avatar.radii] },
  };
  return states;
}

function runMorphSurface(layer, { states, duration, visual, refCard, stickyEl, rootAvatar, onDone }) {
  const minX = Math.floor(Math.min(...states.map(s => Math.min(s.x, s.avatar.x)))) - 2;
  const minY = Math.floor(Math.min(...states.map(s => Math.min(s.y, s.avatar.y)))) - 2;
  const maxX = Math.ceil(Math.max(...states.map(s => Math.max(s.x + s.w, s.avatar.x + s.avatar.w)))) + 2;
  const maxY = Math.ceil(Math.max(...states.map(s => Math.max(s.y + s.h, s.avatar.y + s.avatar.h)))) + 2;
  const origin = { x: minX, y: minY };

  const elevation = document.createElement('div');
  elevation.className = 'feedback-morph-elevation';
  elevation.setAttribute('aria-hidden', 'true');
  Object.assign(elevation.style, {
    left: `${minX}px`,
    top: `${minY}px`,
    width: `${Math.max(1, maxX - minX)}px`,
    height: `${Math.max(1, maxY - minY)}px`,
  });

  const skin = document.createElement('div');
  skin.className = 'feedback-morph-skin';
  elevation.append(skin);

  const traveller = document.createElement('div');
  traveller.className = 'feedback-morph-traveller';

  const avatarBg = document.createElement('div');
  avatarBg.className = 'feedback-morph-traveller-bg';
  avatarBg.style.background = visual.authorColor;
  traveller.append(avatarBg);

  let pinBg = null;
  if (visual.pinBgImage) {
    pinBg = document.createElement('div');
    pinBg.className = 'feedback-morph-traveller-bg';
    pinBg.style.background = visual.pinBgImage;
    traveller.append(pinBg);
  }

  const avatarLabel = document.createElement('span');
  avatarLabel.className = 'feedback-morph-traveller-label';
  avatarLabel.textContent = visual.authorInitials;

  let pinLabel = null;
  if (visual.isThread) {
    pinLabel = document.createElement('span');
    pinLabel.className = 'feedback-morph-traveller-label feedback-morph-traveller-thread';
    pinLabel.append(...visual.nodes.map(node => node.cloneNode(true)));
  }

  traveller.append(avatarLabel);
  if (pinLabel) traveller.append(pinLabel);
  const group = document.createElement('div');
  group.className = 'feedback-morph-group';
  group.append(elevation, traveller);
  layer.append(group);

  if (stickyEl) {
    stickyEl.dataset.morphing = 'true';
  }
  if (rootAvatar) {
    rootAvatar.style.visibility = 'hidden';
  }

  const timing = { duration, easing: 'linear', fill: 'forwards' };
  const anims = [];

  if (states.some(s => (s.surfaceAlpha ?? 1) < 0.999 || (s.surfaceSat ?? 1) < 0.999)) {
    anims.push(group.animate(
      states.map(s => ({
        opacity: s.surfaceAlpha ?? 1,
        filter: (s.surfaceSat ?? 1) < 0.999 ? `saturate(${(s.surfaceSat ?? 1).toFixed(3)})` : 'none',
      })),
      timing,
    ));
  }

  anims.push(skin.animate(
    states.map(s => {
      const shade = Math.round(lerp(32, 21, s.bgMix));
      return {
        clipPath: roundedRectPath(s, origin),
        backgroundColor: `rgb(${shade}, ${shade}, ${shade})`,
      };
    }),
    timing,
  ));

  anims.push(traveller.animate(
    states.map(s => ({
      transform: `translate(${s.avatar.x.toFixed(2)}px, ${s.avatar.y.toFixed(2)}px)`,
      width: `${s.avatar.w.toFixed(2)}px`,
      height: `${s.avatar.h.toFixed(2)}px`,
      borderRadius: s.avatar.radii.map(r => `${r.toFixed(2)}px`).join(' '),
      opacity: s.avatar.alpha,
    })),
    timing,
  ));

  if (pinBg) {
    anims.push(pinBg.animate(
      states.map(s => ({ opacity: clamp(s.avatar.pinMix * 1.2) })),
      timing,
    ));
  }

  if (pinLabel) {
    anims.push(pinLabel.animate(
      states.map(s => ({
        opacity: smoothstep(0.4, 0.9, s.avatar.pinMix),
        transform: `scale(${s.avatar.textScale.toFixed(3)})`,
      })),
      timing,
    ));
    anims.push(avatarLabel.animate(
      states.map(s => ({
        opacity: 1 - smoothstep(0.15, 0.65, s.avatar.pinMix),
      })),
      timing,
    ));
  } else if (Math.abs(states[0].avatar.textScale - states[states.length - 1].avatar.textScale) > 0.005) {
    anims.push(avatarLabel.animate(
      states.map(s => ({ transform: `scale(${s.avatar.textScale.toFixed(3)})` })),
      timing,
    ));
  }

  if (stickyEl) {
    anims.push(stickyEl.animate(
      states.map(s => ({ opacity: s.content })),
      timing,
    ));
  }

  const startTime = performance.now();
  let cleaned = false;

  const cleanup = invokeCallback => {
    if (cleaned) return;
    cleaned = true;
    for (const anim of anims) {
      anim.onfinish = null;
      anim.cancel();
    }
    group.remove();
    if (rootAvatar) rootAvatar.style.visibility = '';
    if (stickyEl) {
      delete stickyEl.dataset.morphing;
      stickyEl.style.opacity = '';
    }
    if (invokeCallback) onDone?.();
  };

  anims[0].onfinish = () => cleanup(true);

  return {
    sample() {
      const elapsed = clamp(
        Number(anims[0]?.currentTime ?? (performance.now() - startTime)),
        0,
        duration,
      );
      const pos = (elapsed / Math.max(1, duration)) * (states.length - 1);
      const idx = Math.floor(pos);
      const nextIdx = Math.min(states.length - 1, idx + 1);
      return interpolatePair(states[idx], states[nextIdx], pos - idx);
    },
    progress() {
      const elapsed = clamp(
        Number(anims[0]?.currentTime ?? (performance.now() - startTime)),
        0,
        duration,
      );
      return elapsed / Math.max(1, duration);
    },
    cancel() {
      cleanup(false);
    },
    finish() {
      cleanup(true);
    },
  };
}

export function createCommentMorph({ root, sticky, onSyncPins }) {
  const layer = document.createElement('div');
  layer.className = 'feedback-morph-layer';
  layer.setAttribute('aria-hidden', 'true');
  sticky.before(layer);

  let primary = null; // { note, visual, refCard, spot, mode: 'open'|'close'|'simple', run }
  let settledOpen = null; // { note, visual, spot }
  const ghosts = new Map(); // noteId -> { run, visual, refCard }

  function cancelSimpleStickyAnims() {
    for (const anim of sticky.getAnimations()) {
      if (anim.id !== GLIDE_ANIM_ID) anim.cancel();
    }
    delete sticky.dataset.morphing;
    sticky.style.opacity = '';
    sticky.style.transform = '';
    sticky.style.transformOrigin = '';
  }

  function finishGlide() {
    for (const anim of sticky.getAnimations()) {
      if (anim.id === GLIDE_ANIM_ID) anim.finish();
    }
  }

  function stopPrimary() {
    if (primary) {
      primary.run.cancel();
      primary = null;
    }
    cancelSimpleStickyAnims();
  }

  function isPinHiddenByMorph(noteId) {
    return (primary?.note?.id === noteId && (primary.mode === 'open' || primary.mode === 'close'))
      || ghosts.has(noteId);
  }

  function detachToCollapseGhost(resolvePin) {
    let note = null;
    let fromState = null;
    let visual = null;
    let refCard = null;

    if (primary?.note && (primary.mode === 'open' || primary.mode === 'close')) {
      note = primary.note;
      fromState = primary.run.sample();
      visual = primary.visual;
      refCard = primary.refCard;
      stopPrimary();
    } else if (settledOpen?.note && !sticky.hidden) {
      note = settledOpen.note;
      visual = settledOpen.visual;
      const measured = measureCardState(sticky, null, null);
      fromState = measured.state;
      refCard = { x: fromState.x, y: fromState.y, w: fromState.w, h: fromState.h };
      stopPrimary();
    } else {
      stopPrimary();
      settledOpen = null;
      return;
    }

    settledOpen = null;
    const pin = resolvePin?.(note.id);
    if (!pin || pin.hidden || prefersReducedMotion()) {
      onSyncPins?.();
      return;
    }

    const existingGhost = ghosts.get(note.id);
    if (existingGhost) {
      existingGhost.run.cancel();
      ghosts.delete(note.id);
    }

    const target = measurePinState(pin, note, { resting: true });
    const useVisual = target.visual || visual;
    const states = buildMorphStates(fromState, target.state, false, CLOSE_DURATION, refCard);
    const ghostRun = runMorphSurface(layer, {
      states,
      duration: CLOSE_DURATION,
      visual: useVisual,
      refCard,
      stickyEl: null,
      rootAvatar: null,
      onDone: () => {
        ghosts.delete(note.id);
        onSyncPins?.();
      },
    });
    ghosts.set(note.id, { run: ghostRun, visual: useVisual, refCard });
    onSyncPins?.();
  }

  function openFromPin({ note, pin, initialPinRect = null, initialPinOpacity = null, cardBox, spot }) {
    finishGlide();
    let fromState = null;
    let visual = null;

    if (primary?.note?.id === note.id && (primary.mode === 'open' || primary.mode === 'close')) {
      fromState = primary.run.sample();
      visual = primary.visual;
      stopPrimary();
    } else if (ghosts.has(note.id)) {
      const ghost = ghosts.get(note.id);
      fromState = ghost.run.sample();
      visual = ghost.visual;
      ghost.run.cancel();
      ghosts.delete(note.id);
      stopPrimary();
    } else {
      stopPrimary();
    }

    settledOpen = null;

    if (!pin || pin.hidden || prefersReducedMotion()) {
      if (pin && !pin.hidden) {
        const pinMeasured = measurePinState(pin, note, { initialRect: initialPinRect, initialOpacity: initialPinOpacity });
        settledOpen = { note, visual: pinMeasured.visual, spot };
      }
      if (prefersReducedMotion() && !sticky.hidden) {
        const fade = sticky.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'linear' });
        primary = {
          note,
          visual: settledOpen?.visual,
          refCard: cardBox,
          spot,
          mode: 'simple',
          run: {
            sample: () => null,
            progress: () => 1,
            cancel: () => fade.cancel(),
            finish: () => fade.finish(),
          },
        };
        fade.onfinish = () => {
          if (primary?.run) primary = null;
        };
      }
      onSyncPins?.();
      return;
    }

    const pinMeasured = measurePinState(pin, note, { initialRect: initialPinRect, initialOpacity: initialPinOpacity });
    if (!fromState) fromState = pinMeasured.state;
    visual = pinMeasured.visual || visual;

    const cardMeasured = measureCardState(sticky, cardBox, fromState.avatar);
    const refCard = {
      x: cardMeasured.state.x,
      y: cardMeasured.state.y,
      w: cardMeasured.state.w,
      h: cardMeasured.state.h,
    };

    const states = buildMorphStates(fromState, cardMeasured.state, true, OPEN_DURATION, refCard);
    const run = runMorphSurface(layer, {
      states,
      duration: OPEN_DURATION,
      visual,
      refCard,
      stickyEl: sticky,
      rootAvatar: cardMeasured.rootAvatar,
      onDone: () => {
        primary = null;
        settledOpen = { note, visual, spot };
        onSyncPins?.();
      },
    });

    primary = { note, visual, refCard, spot, mode: 'open', run };
    settledOpen = { note, visual, spot };
    onSyncPins?.();
  }

  function closeToPin({ note, pin, spot = null, onFinish }) {
    finishGlide();
    let fromState = null;
    let visual = null;
    let refCard = null;
    let openProgress = 1;

    if (primary?.note?.id === note.id && (primary.mode === 'open' || primary.mode === 'close')) {
      fromState = primary.run.sample();
      openProgress = primary.mode === 'open' ? clamp(0.35 + primary.run.progress() * 0.65) : 1;
      visual = primary.visual;
      refCard = primary.refCard;
      stopPrimary();
    } else {
      const measured = measureCardState(sticky, null, null);
      fromState = measured.state;
      refCard = { x: fromState.x, y: fromState.y, w: fromState.w, h: fromState.h };
      visual = settledOpen?.visual;
      stopPrimary();
    }

    settledOpen = null;

    if (!pin || pin.hidden || prefersReducedMotion()) {
      closeDocked({ onFinish });
      return;
    }

    const target = measurePinState(pin, note, { resting: true });
    visual = target.visual || visual;
    const duration = Math.round(lerp(140, CLOSE_DURATION, openProgress));
    const states = buildMorphStates(fromState, target.state, false, duration, refCard);

    const cardMeasured = measureCardState(sticky, null, target.state.avatar);
    const run = runMorphSurface(layer, {
      states,
      duration,
      visual,
      refCard,
      stickyEl: sticky,
      rootAvatar: cardMeasured.rootAvatar,
      onDone: () => {
        primary = null;
        onFinish?.();
        onSyncPins?.();
      },
    });

    primary = { note, visual, refCard, spot, mode: 'close', run };
    onSyncPins?.();
  }

  function openDocked({ note = null } = {}) {
    finishGlide();
    stopPrimary();
    settledOpen = note ? { note, visual: { isThread: false, pinBgImage: '', authorColor: reviewerColor(note.name), authorInitials: initials(note.name || ''), nodes: [] }, spot: null } : null;

    if (prefersReducedMotion()) {
      onSyncPins?.();
      return;
    }

    const anim = sticky.animate(
      [
        { opacity: 0, transform: 'translateY(8px) scale(0.97)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' },
      ],
      { duration: DOCKED_OPEN_DURATION, easing: TONEN_EASE_CSS },
    );
    primary = {
      note,
      visual: settledOpen?.visual ?? null,
      refCard: null,
      spot: null,
      mode: 'simple',
      run: {
        sample: () => null,
        progress: () => 1,
        cancel: () => anim.cancel(),
        finish: () => anim.finish(),
      },
    };
    anim.onfinish = () => {
      if (primary?.mode === 'simple') primary = null;
    };
    onSyncPins?.();
  }

  function openDraft({ point, cardBox }) {
    finishGlide();
    stopPrimary();
    settledOpen = null;

    if (prefersReducedMotion()) {
      onSyncPins?.();
      return;
    }

    const originX = point && cardBox ? clamp(point.x - cardBox.left, 0, cardBox.width) : (cardBox?.width ?? 166) / 2;
    const originY = point && cardBox ? clamp(point.y - cardBox.top, 0, cardBox.height) : 24;
    sticky.style.transformOrigin = `${originX}px ${originY}px`;
    const anim = sticky.animate(
      [
        { opacity: 0, transform: 'scale(0.95)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      { duration: DRAFT_OPEN_DURATION, easing: TONEN_EASE_CSS },
    );
    primary = {
      note: null,
      visual: null,
      refCard: cardBox,
      spot: point ? { x: point.x, y: point.y } : null,
      mode: 'simple',
      run: {
        sample: () => null,
        progress: () => 1,
        cancel: () => {
          anim.cancel();
          sticky.style.transformOrigin = '';
        },
        finish: () => {
          anim.finish();
          sticky.style.transformOrigin = '';
        },
      },
    };
    anim.onfinish = () => {
      sticky.style.transformOrigin = '';
      if (primary?.mode === 'simple') primary = null;
    };
    onSyncPins?.();
  }

  function closeDocked({ onFinish } = {}) {
    finishGlide();
    stopPrimary();
    settledOpen = null;

    if (prefersReducedMotion()) {
      onFinish?.();
      onSyncPins?.();
      return;
    }

    const anim = sticky.animate(
      [
        { opacity: 1, transform: 'translateY(0) scale(1)' },
        { opacity: 0, transform: 'translateY(4px) scale(0.97)' },
      ],
      { duration: DOCKED_CLOSE_DURATION, easing: TONEN_EASE_CSS, fill: 'forwards' },
    );
    let done = false;
    const finish = invoke => {
      if (done) return;
      done = true;
      anim.onfinish = null;
      anim.cancel();
      sticky.style.opacity = '';
      sticky.style.transform = '';
      if (primary?.mode === 'simple') primary = null;
      if (invoke) onFinish?.();
      onSyncPins?.();
    };
    anim.onfinish = () => finish(true);
    primary = {
      note: null,
      visual: null,
      refCard: null,
      spot: null,
      mode: 'simple',
      run: {
        sample: () => null,
        progress: () => 1,
        cancel: () => finish(false),
        finish: () => finish(true),
      },
    };
    onSyncPins?.();
  }

  function glideCard(prevPlacement, nextPlacement) {
    if (!prevPlacement || !nextPlacement || prefersReducedMotion() || primary) return;
    if (prevPlacement.noteId !== nextPlacement.noteId) return;
    if (prevPlacement.spot && nextPlacement.spot) {
      const spotMoved = Math.abs(prevPlacement.spot.x - nextPlacement.spot.x) > 0.75
        || Math.abs(prevPlacement.spot.y - nextPlacement.spot.y) > 0.75;
      if (spotMoved) return;
    }
    const dx = prevPlacement.left - nextPlacement.left;
    const dy = prevPlacement.top - nextPlacement.top;
    if (Math.abs(dx) < 0.75 && Math.abs(dy) < 0.75) return;

    sticky.animate(
      [
        { translate: `${dx}px ${dy}px` },
        { translate: '0 0' },
      ],
      {
        id: GLIDE_ANIM_ID,
        duration: GLIDE_DURATION,
        easing: TONEN_EASE_CSS,
        composite: 'add',
      },
    );
  }

  function handleViewportSpotMove(liveSpot) {
    if (!primary || (primary.mode !== 'open' && primary.mode !== 'close')) return;
    if (primary.spot && liveSpot) {
      const moved = Math.abs(primary.spot.x - liveSpot.x) > 1.5 || Math.abs(primary.spot.y - liveSpot.y) > 1.5;
      if (moved) {
        primary.run.finish();
      }
    }
  }

  function morphNoteId() {
    return (primary?.mode === 'open' || primary?.mode === 'close') ? (primary.note?.id ?? null) : null;
  }

  function finishIfActive() {
    if (primary) {
      primary.run.finish();
    }
  }

  function reset() {
    stopPrimary();
    finishGlide();
    settledOpen = null;
    onSyncPins?.();
  }

  void root;

  return {
    openFromPin,
    closeToPin,
    openDocked,
    openDraft,
    closeDocked,
    detachToCollapseGhost,
    glideCard,
    handleViewportSpotMove,
    finishIfActive,
    isPinHiddenByMorph,
    morphNoteId,
    reset,
  };
}

export function animateNewPin(pin) {
  if (!pin || prefersReducedMotion()) return;
  pin.animate(
    [
      { opacity: 0, scale: 0.78, translate: '0 -8px' },
      { opacity: 1, scale: 1, translate: '0 0' },
    ],
    { duration: 280, easing: TONEN_POP_CSS },
  );
}

export function animateNewThreadEntry(entry) {
  if (!entry || prefersReducedMotion()) return;
  entry.animate(
    [
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { duration: 260, easing: TONEN_EASE_CSS },
  );
}
