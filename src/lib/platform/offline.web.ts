import { createStore, useStore } from '../state/store';

// Registers the service worker (production web builds only), asks it to download the core data for
// offline use, and keeps the app up to date. Everything here is held in memory.
//
// Updates: a new build installs in the background and waits (public/sw.js). This page then
//   - switches to it silently when the page is already running that build (a fresh load after a
//     deploy, while the previous worker was still in charge);
//   - reloads into it at a safe moment: just after the page opens or the reader returns after 10+
//     minutes away, before they've touched anything, or while away for 10+ minutes; never while
//     audio is playing;
//   - otherwise offers a Reload button (UpdateNotice), and the About page can check on request.
// Checks happen when the page loads, whenever it comes back into view, and every 30 minutes.

export type UpdateState = 'idle' | 'checking' | 'latest' | 'downloading' | 'ready';

export interface OfflineStatus {
  supported: boolean;
  done: number;
  total: number;
  /** This page's build id (from index.html), or null in development. */
  build: string | null;
  update: UpdateState;
  /** The update notice was closed for this visit. */
  dismissed: boolean;
}

const PAGE_BUILD =
  typeof document === 'undefined' ? null : (document.querySelector<HTMLMetaElement>('meta[name="openberea-build"]')?.content ?? null);

export const offlineStore = createStore<OfflineStatus>({ supported: false, done: 0, total: 0, build: PAGE_BUILD, update: 'idle', dismissed: false });

export function useOfflineStatus() {
  return useStore(offlineStore);
}

const CHECK_EVERY_MS = 30 * 60 * 1000;
const LONG_AWAY_MS = 10 * 60 * 1000;
const FRESH_MS = 15 * 1000;

let started = false;
let registration: ServiceWorkerRegistration | null = null;
let reloading = false;
let freshAt = 0;
let touched = false;
let hiddenAt: number | null = null;

const set = (patch: Partial<OfflineStatus>) => offlineStore.set((s) => ({ ...s, ...patch }));

/** Asks a service worker which build it serves (null for a worker too old to say). */
function workerBuild(worker: ServiceWorker): Promise<string | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 3000);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      resolve(typeof e.data?.build === 'string' ? e.data.build : null);
    };
    worker.postMessage({ type: 'version' }, [channel.port2]);
  });
}

const mediaPlaying = () => Array.from(document.querySelectorAll('audio, video')).some((m) => !(m as HTMLMediaElement).paused);

/** Nobody would lose anything to a reload right now. */
function safeToReload(): boolean {
  if (mediaPlaying()) return false;
  if (document.visibilityState === 'hidden') return hiddenAt !== null && Date.now() - hiddenAt >= LONG_AWAY_MS;
  return !touched && performance.now() - freshAt < FRESH_MS;
}

/** Switches to the waiting build and reloads into it. */
export function applyUpdate() {
  if (reloading) return;
  reloading = true;
  const waiting = registration?.waiting;
  if (waiting) {
    waiting.postMessage({ type: 'activate-now' });
    // controllerchange reloads; this is a fallback if it never comes.
    setTimeout(() => location.reload(), 4000);
  } else {
    location.reload();
  }
}

export function dismissUpdate() {
  set({ dismissed: true });
}

async function onWaiting(worker: ServiceWorker) {
  const build = await workerBuild(worker);
  if (build && build === PAGE_BUILD) {
    // This page already runs the new build: let the new worker take over, no reload needed.
    worker.postMessage({ type: 'activate-now' });
    return;
  }
  set({ update: 'ready' });
  if (safeToReload()) applyUpdate();
}

function watchInstalling(worker: ServiceWorker | null) {
  if (!worker) return;
  set({ update: 'downloading' });
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed') {
      // With no worker in charge yet (the first visit), it activates by itself.
      if (navigator.serviceWorker.controller) onWaiting(worker);
      else set({ update: 'latest' });
    } else if (worker.state === 'redundant' && offlineStore.get().update === 'downloading') {
      set({ update: 'idle' });
    }
  });
}

/** Asks the server for a newer build. Resolves once the check has finished. */
export async function checkForUpdates(): Promise<void> {
  const reg = registration;
  if (!reg) return;
  if (offlineStore.get().update === 'ready') return;
  set({ update: 'checking' });
  try {
    await reg.update();
  } catch {
    // Offline: try again later.
  }
  if (reg.waiting) await onWaiting(reg.waiting);
  else if (reg.installing) set({ update: 'downloading' });
  else if (offlineStore.get().update === 'checking') set({ update: 'latest' });
}

function onVisibility() {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    return;
  }
  if (hiddenAt !== null && Date.now() - hiddenAt >= LONG_AWAY_MS) {
    // Back after a long time away: like a fresh start until the reader touches something.
    freshAt = performance.now();
    touched = false;
  }
  if (offlineStore.get().update === 'ready' && safeToReload()) applyUpdate();
  else checkForUpdates();
  hiddenAt = null;
}

export function startOffline() {
  if (started || typeof navigator === 'undefined' || !('serviceWorker' in navigator) || __DEV__) return;
  started = true;
  freshAt = performance.now();
  set({ supported: true });
  const sw = navigator.serviceWorker;
  sw.addEventListener('message', (e: MessageEvent) => {
    if (e.data?.type === 'precache') set({ done: e.data.done, total: e.data.total });
  });
  sw.addEventListener('controllerchange', async () => {
    if (reloading) {
      location.reload();
      return;
    }
    // Another tab switched to a new build. This page keeps working (the worker keeps the previous
    // build's files), but offer the update.
    const controller = sw.controller;
    const build = controller ? await workerBuild(controller) : null;
    if (build && PAGE_BUILD && build !== PAGE_BUILD) {
      set({ update: 'ready' });
      if (safeToReload()) location.reload();
    }
  });
  const markTouched = () => (touched = true);
  window.addEventListener('pointerdown', markTouched, { capture: true, passive: true });
  window.addEventListener('keydown', markTouched, { capture: true, passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  // Hidden pages check too, so one left in the background long enough is already up to date when
  // the reader comes back.
  setInterval(() => {
    if (offlineStore.get().update !== 'ready') checkForUpdates();
    else if (safeToReload()) applyUpdate();
  }, CHECK_EVERY_MS);

  const register = async () => {
    try {
      const reg = await sw.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      registration = reg;
      reg.addEventListener('updatefound', () => watchInstalling(reg.installing));
      if (reg.waiting && sw.controller) onWaiting(reg.waiting);
      else if (reg.installing) watchInstalling(reg.installing);
      const ready = await sw.ready;
      ready.active?.postMessage({ type: 'precache-core' });
    } catch {
      // Without a service worker the site still works online.
    }
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
