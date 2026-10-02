import { createStore, useStore } from '../state/store';

// Registers the service worker (production web builds only) and asks it to download the core data
// for offline use. Progress is kept in memory for the About page.

export interface OfflineStatus {
  supported: boolean;
  done: number;
  total: number;
}

export const offlineStore = createStore<OfflineStatus>({ supported: false, done: 0, total: 0 });

export function useOfflineStatus() {
  return useStore(offlineStore);
}

let started = false;

export function startOffline() {
  if (started || typeof navigator === 'undefined' || !('serviceWorker' in navigator) || __DEV__) return;
  started = true;
  offlineStore.set((s) => ({ ...s, supported: true }));
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    if (e.data?.type === 'precache') offlineStore.set({ supported: true, done: e.data.done, total: e.data.total });
  });
  const register = async () => {
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const reg = await navigator.serviceWorker.ready;
      reg.active?.postMessage({ type: 'precache-core' });
    } catch {
      // Without a service worker the site still works online.
    }
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
