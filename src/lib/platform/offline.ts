import { createStore, useStore } from '../state/store';

// Native builds bundle or download data differently, and app stores handle updates; nothing to
// register here (see offline.web.ts).

export type UpdateState = 'idle' | 'checking' | 'latest' | 'downloading' | 'ready';

export interface OfflineStatus {
  supported: boolean;
  done: number;
  total: number;
  build: string | null;
  update: UpdateState;
  dismissed: boolean;
}

export const offlineStore = createStore<OfflineStatus>({ supported: false, done: 0, total: 0, build: null, update: 'idle', dismissed: false });

export function useOfflineStatus() {
  return useStore(offlineStore);
}

export function startOffline() {}
export function applyUpdate() {}
export function dismissUpdate() {}
export async function checkForUpdates() {}
