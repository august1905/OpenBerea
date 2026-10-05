import { Platform } from 'react-native';

// Small web-only helpers. On native these are no-ops, so shared components stay mobile-compatible.

type Styled = { style: Record<string, string> };

/** The DOM node behind a react-native-web view ref, or null on native. */
export function domNode(ref: unknown): (HTMLElement & Styled) | null {
  if (Platform.OS !== 'web' || !ref || typeof (ref as HTMLElement).addEventListener !== 'function') return null;
  return ref as HTMLElement & Styled;
}

/**
 * Corner zones: block text selection, the long-press callout, the context menu, and browser
 * panning, so press-and-swipe gestures work (spec: Design → Navigation).
 */
export function guardCornerZone(ref: unknown): () => void {
  const el = domNode(ref);
  if (!el) return () => {};
  el.style.userSelect = 'none';
  el.style.webkitUserSelect = 'none';
  el.style.setProperty('-webkit-touch-callout', 'none');
  el.style.touchAction = 'none';
  const block = (e: Event) => e.preventDefault();
  el.addEventListener('contextmenu', block);
  el.addEventListener('selectstart', block);
  return () => {
    el.removeEventListener('contextmenu', block);
    el.removeEventListener('selectstart', block);
  };
}

/** Whether a CSS media query matches (web only; false on native). */
export function matchesMedia(query: string): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

/** Calls `handler` with the new result whenever a media query starts or stops matching. */
export function onMediaChange(query: string, handler: (matches: boolean) => void): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const list = window.matchMedia(query);
  const on = () => handler(list.matches);
  list.addEventListener?.('change', on);
  return () => list.removeEventListener?.('change', on);
}

/** A mouse entering and leaving an element (not touch or pen). */
export function onMouseHover(ref: unknown, enter: () => void, leave: () => void): () => void {
  const el = domNode(ref);
  if (!el) return () => {};
  const onEnter = (e: PointerEvent) => e.pointerType === 'mouse' && enter();
  const onLeave = (e: PointerEvent) => e.pointerType === 'mouse' && leave();
  el.addEventListener('pointerenter', onEnter);
  el.addEventListener('pointerleave', onLeave);
  return () => {
    el.removeEventListener('pointerenter', onEnter);
    el.removeEventListener('pointerleave', onLeave);
  };
}

/**
 * The mouse moving anywhere on the page with no button pressed (pressed moves belong to whatever
 * was pressed), and leaving the window.
 */
export function onMouseMove(move: (x: number, y: number) => void, leaveWindow: () => void): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => {};
  const opts = { capture: true, passive: true } as const;
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.buttons === 0) move(e.clientX, e.clientY);
  };
  const onOut = (e: MouseEvent) => {
    if (!e.relatedTarget) leaveWindow();
  };
  window.addEventListener('pointermove', onMove, opts);
  document.addEventListener('mouseout', onOut);
  return () => {
    window.removeEventListener('pointermove', onMove, opts);
    document.removeEventListener('mouseout', onOut);
  };
}

export interface TouchPoint {
  id: number;
  x: number;
  y: number;
  target: EventTarget | null;
  /** Event time (ms). */
  time: number;
}

/**
 * Single-finger touches anywhere on the page, observed without taking them over (passive), so taps
 * and scrolling carry on as usual. A second finger cancels.
 */
export function onPageTouch(handlers: { start: (t: TouchPoint) => void; move: (t: TouchPoint) => void; end: (t: TouchPoint | null) => void }): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => {};
  const opts = { capture: true, passive: true } as const;
  const point = (t: Touch, e: TouchEvent): TouchPoint => ({ id: t.identifier, x: t.clientX, y: t.clientY, target: t.target, time: e.timeStamp });
  const onStart = (e: TouchEvent) => {
    if (e.touches.length === 1) handlers.start(point(e.touches[0], e));
    else handlers.end(null);
  };
  const onMove = (e: TouchEvent) => {
    if (e.touches.length === 1) handlers.move(point(e.touches[0], e));
  };
  const onEnd = (e: TouchEvent) => {
    const t = e.changedTouches[0];
    handlers.end(e.type === 'touchend' && t ? point(t, e) : null);
  };
  window.addEventListener('touchstart', onStart, opts);
  window.addEventListener('touchmove', onMove, opts);
  window.addEventListener('touchend', onEnd, opts);
  window.addEventListener('touchcancel', onEnd, opts);
  return () => {
    window.removeEventListener('touchstart', onStart, opts);
    window.removeEventListener('touchmove', onMove, opts);
    window.removeEventListener('touchend', onEnd, opts);
    window.removeEventListener('touchcancel', onEnd, opts);
  };
}

/**
 * Whether a touch on `target` belongs to something with sideways gestures of its own: a map or
 * chart that pans (touch-action none or pan-y), or a row that scrolls sideways. An open corner menu
 * (marked data-corner-menu) doesn't count: a swipe across it may open the other menu.
 */
export function ownsSidewaysGestures(target: EventTarget | null): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    if (el.hasAttribute('data-corner-menu')) return false;
    const s = getComputedStyle(el);
    if (s.touchAction === 'none' || (s.touchAction.includes('pan-y') && !s.touchAction.includes('pan-x'))) return true;
    if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
  }
  return false;
}

/** While a gesture is in progress, stop the page from selecting text. */
export function setPageSelectable(selectable: boolean) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.body.style.userSelect = selectable ? '' : 'none';
  document.body.style.webkitUserSelect = selectable ? '' : 'none';
}

/** Listens for a key on the document (web only). Returns an unsubscribe function. */
export function onDocumentKey(handler: (e: KeyboardEvent) => void): () => void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return () => {};
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}

/** True when the key event comes from a text field, where single-letter shortcuts must not fire. */
export function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

/**
 * Points the page itself (background behind the app, scrollbars, form controls, the browser's bar
 * color) at the chosen theme. `null` hands it back to the device setting.
 */
export function applyDocumentTheme(scheme: 'light' | 'dark' | null, background: string) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const root = document.documentElement;
  if (scheme) root.dataset.theme = scheme;
  else delete root.dataset.theme;
  root.style.colorScheme = scheme ?? '';
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    if (!meta.dataset.device) meta.dataset.device = meta.content;
    meta.content = scheme ? background : meta.dataset.device;
  });
}

export function focusNode(ref: unknown) {
  const el = domNode(ref);
  if (el) el.focus();
}
