import { Platform } from 'react-native';

/**
 * Calls `fn` when the browser restores this page from its back/forward cache (web only), so
 * in-memory answers from before leaving the site don't come back. Returns an unsubscribe function.
 */
export function onPageRestored(fn: () => void): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => {};
  const handler = (e: PageTransitionEvent) => {
    if (e.persisted) fn();
  };
  window.addEventListener('pageshow', handler);
  return () => window.removeEventListener('pageshow', handler);
}
