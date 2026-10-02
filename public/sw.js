/* OpenBerea service worker.
 *
 * Caches app data only: the app shell, Bible texts, lexicons, and study data. Never user data.
 * - App shell (HTML, scripts, fonts, icons): cached at install.
 * - Core data (KJV, ASV, Hebrew/Greek texts, lexicons, concordance, search index): downloaded in the
 *   background after the first visit, so reading works offline.
 * - Other study data (commentaries, dictionaries, maps, …): cached the first time it's viewed.
 * - Other sites (Desiring God audio, archive.org, YouTube) are never intercepted or cached.
 *
 * __BUILD__ is replaced at build time by scripts/postbuild.mjs.
 */
const BUILD = __BUILD__;
const SHELL_CACHE = `shell-${BUILD.shell}`;
const DATA_CACHE = `data-${BUILD.data}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(BUILD.shellFiles.map((f) => new Request(f, { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name !== SHELL_CACHE && name !== DATA_CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

let precaching = null;

async function broadcast(message) {
  for (const client of await self.clients.matchAll({ includeUncontrolled: true })) client.postMessage(message);
}

/** Downloads every core data file not yet cached, a few at a time, reporting progress. */
async function precacheCore() {
  const res = await fetch('/precache.json', { cache: 'no-cache' });
  const { core } = await res.json();
  const cache = await caches.open(DATA_CACHE);
  const cached = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
  const todo = core.filter((p) => !cached.has(p));
  let done = core.length - todo.length;
  await broadcast({ type: 'precache', done, total: core.length });
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const path = todo[i++];
      try {
        const r = await fetch(path);
        if (r.ok) await cache.put(path, r);
      } catch {
        // Offline or interrupted: the next visit resumes where this left off.
        return;
      }
      done++;
      if (done % 50 === 0 || done === core.length) await broadcast({ type: 'precache', done, total: core.length });
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  await broadcast({ type: 'precache', done, total: core.length });
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'precache-core') {
    precaching = precaching ?? precacheCore().finally(() => (precaching = null));
    event.waitUntil(precaching);
  } else if (event.data?.type === 'status') {
    event.waitUntil(
      (async () => {
        const res = await fetch('/precache.json', { cache: 'no-cache' }).catch(() => null);
        const core = res ? (await res.json()).core : [];
        const cache = await caches.open(DATA_CACHE);
        const cached = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
        event.source?.postMessage({ type: 'precache', done: core.filter((p) => cached.has(p)).length, total: core.length });
      })(),
    );
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // other sites: not intercepted, never cached

  if (req.mode === 'navigate') {
    // The site is a single-page app: every route is served by index.html.
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          if (fresh.ok) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put('/index.html', fresh.clone());
          }
          return fresh;
        } catch {
          return (await caches.match('/index.html')) ?? (await caches.match('/')) ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith('/data/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(DATA_CACHE);
        const hit = await cache.match(url.pathname);
        if (hit) return hit;
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(url.pathname, fresh.clone());
        return fresh;
      })(),
    );
    return;
  }

  if (url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(req, { ignoreSearch: true });
        if (hit) return hit;
        const fresh = await fetch(req);
        if (fresh.ok) (await caches.open(SHELL_CACHE)).put(req, fresh.clone());
        return fresh;
      })(),
    );
  }
});
