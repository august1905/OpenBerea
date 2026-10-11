/* OpenBerea service worker.
 *
 * Caches app data only: the app shell, Bible texts, lexicons, and study data. Never user data.
 * - App shell (HTML, scripts, fonts, icons): cached at install, one cache per build.
 * - Core data (KJV, ASV, Hebrew/Greek texts, lexicons, concordance, search index): downloaded in the
 *   background after the first visit, so reading works offline. One cache per data version (a hash
 *   of every data file), so new data replaces old data as a whole.
 * - Other study data (commentaries, dictionaries, maps, …): cached the first time it's viewed.
 * - Other sites (Desiring God audio, archive.org, YouTube) are never intercepted or cached.
 *
 * Updates: a new build installs in the background and waits. The page decides when to switch
 * (src/lib/platform/offline.web.ts): at once if it's already running the new build, otherwise at a
 * safe moment or when the reader taps Reload. Until then, pages keep running their own build, and
 * the previous build's files stay cached so a page still running it can load its next screen.
 *
 * Only real files are cached: an error, or a page of HTML where a script or data file belongs, is
 * passed through and never stored.
 *
 * __BUILD__ is replaced at build time by scripts/postbuild.mjs.
 */
const BUILD = __BUILD__;
const SHELL_CACHE = `shell-${BUILD.shell}`;
const DATA_CACHE = `data-${BUILD.data}`;
const SHELL_PATHS = new Set(BUILD.shellFiles);

/**
 * True when a response is the kind of file that was asked for, and worth keeping. Redirects are
 * fine for files (Cloudflare redirects "@" in a name to "%40") but not for the page, which browsers
 * refuse to show from a redirected response.
 */
function cacheable(res, kind) {
  if (!res || !res.ok || res.type === 'opaque') return false;
  const type = (res.headers.get('content-type') || '').toLowerCase();
  if (kind === 'page') return !res.redirected && type.includes('text/html');
  if (type.includes('text/html')) return false; // the app's page where a script or data file belongs
  if (kind === 'data') return type.includes('json');
  return true;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        BUILD.shellFiles.map(async (path) => {
          // The page is fetched as "/" (Cloudflare redirects /index.html there) and kept under both names.
          if (path === '/index.html') return;
          const res = await fetch(new Request(path, { cache: 'reload' }));
          const kind = path === '/' ? 'page' : 'asset';
          if (!cacheable(res, kind)) throw new Error(`install: ${path} returned ${res.status}`);
          if (path === '/') await cache.put('/index.html', res.clone());
          await cache.put(path, res);
        }),
      );
      // No skipWaiting here: the page activates this build when it's safe (see the header comment).
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Keep this build's shell and the one before it (for pages still running it); drop older
      // shells and any data cache from another data version.
      const names = await caches.keys();
      const shells = names.filter((n) => n.startsWith('shell-') && n !== SHELL_CACHE);
      const previous = shells[shells.length - 1];
      for (const name of names) {
        if (name === SHELL_CACHE || name === DATA_CACHE || name === previous) continue;
        await caches.delete(name);
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
        // Revalidate with the server, so a file the browser kept from an older version isn't reused.
        const r = await fetch(path, { cache: 'no-cache' });
        if (cacheable(r, 'data')) await cache.put(path, r);
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
  const type = event.data && event.data.type;
  if (type === 'precache-core') {
    precaching = precaching ?? precacheCore().finally(() => (precaching = null));
    event.waitUntil(precaching);
  } else if (type === 'version') {
    // Which build this worker serves, so a page can tell whether it's running the same one.
    if (event.ports[0]) event.ports[0].postMessage({ build: BUILD.shell });
  } else if (type === 'activate-now') {
    self.skipWaiting();
  } else if (type === 'status') {
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
    // The site is a single-page app: every route is served by index.html. Always ask the server
    // first (so a new build shows up on the next visit); fall back to the cached page offline.
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          if (cacheable(fresh, 'page')) {
            const cache = await caches.open(SHELL_CACHE);
            await cache.put('/index.html', fresh.clone());
          }
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (await cache.match('/index.html')) ?? (await caches.match('/index.html')) ?? Response.error();
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
        if (cacheable(fresh, 'data')) await cache.put(url.pathname, fresh.clone());
        return fresh;
      })(),
    );
    return;
  }

  // Build files with a content hash in their name never change, so any build's cache may answer
  // (a page still running the previous build needs its own scripts).
  if (url.pathname.startsWith('/_expo/static/')) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(url.pathname);
        if (hit) return hit;
        const fresh = await fetch(req);
        if (cacheable(fresh, 'asset')) await (await caches.open(SHELL_CACHE)).put(url.pathname, fresh.clone());
        return fresh;
      })(),
    );
    return;
  }

  // Other shell files (fonts, icons, boot script, manifest) keep their names across builds, so only
  // this build's cache answers for them.
  if (SHELL_PATHS.has(url.pathname) || url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/assets/')) {
    if (url.pathname === '/' || url.pathname === '/index.html') return;
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const hit = await cache.match(url.pathname);
        if (hit) return hit;
        const fresh = await fetch(req);
        if (cacheable(fresh, 'asset')) await cache.put(url.pathname, fresh.clone());
        return fresh;
      })(),
    );
  }
});
