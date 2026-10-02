import { Platform } from 'react-native';

// Web only: keep the current word visible inside the practice text box while typing. Only the box
// scrolls (never the page), so the input under it stays above a phone's on-screen keyboard. On
// native these are no-ops until the apps are built.

export function scrollWithin(containerId: string, elementId: string) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const box = document.getElementById(containerId);
  const el = document.getElementById(elementId);
  if (!box || !el) return;
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const pad = 12;
  if (r.top < b.top + pad) box.scrollTop -= b.top + pad - r.top;
  else if (r.bottom > b.bottom - pad) box.scrollTop += r.bottom - (b.bottom - pad);
}

/** The translation shown on the current reading page (web), so "Memorize" practices what you read. */
export function readerTranslation(): 'kjv' | 'asv' {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'kjv';
  return new URLSearchParams(window.location.search).get('tr') === 'asv' ? 'asv' : 'kjv';
}
