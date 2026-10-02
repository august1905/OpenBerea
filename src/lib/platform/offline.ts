import { createStore, useStore } from '../state/store';

// Native builds bundle or download data differently; nothing to register here.

export interface OfflineStatus {
  supported: boolean;
  done: number;
  total: number;
}

export const offlineStore = createStore<OfflineStatus>({ supported: false, done: 0, total: 0 });

export function useOfflineStatus() {
  return useStore(offlineStore);
}

export function startOffline() {}
