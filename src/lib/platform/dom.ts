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

export function focusNode(ref: unknown) {
  const el = domNode(ref);
  if (el) el.focus();
}
