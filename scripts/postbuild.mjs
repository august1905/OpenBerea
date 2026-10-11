// Runs after `expo export`: stamps the page and the service worker with the build id, writes the
// offline precache list, and writes Cloudflare static-asset headers.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const dist = join(process.cwd(), process.env.DIST_DIR ?? 'dist');

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const url = (p) => '/' + relative(dist, p).split(sep).join('/');

// App shell: the page, scripts, fonts, icons, and bundled assets.
const shellFiles = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/boot.js',
  ...walk(join(dist, '_expo')).map(url),
  ...walk(join(dist, 'fonts')).filter((p) => /\.(woff2?|ttf)$/.test(p)).map(url),
  ...walk(join(dist, 'icons')).map(url),
  ...walk(join(dist, 'assets')).map(url),
].filter((f, i, all) => all.indexOf(f) === i && (f === '/' || existsSync(join(dist, f))));

const shellHash = createHash('sha256');
for (const f of shellFiles) if (f !== '/') shellHash.update(f).update(readFileSync(join(dist, f)));
const shellBuild = shellHash.digest('hex').slice(0, 12);

// The page carries its build id, so the running app can tell whether the service worker it talks
// to serves the same build (src/lib/platform/offline.web.ts).
const indexPath = join(dist, 'index.html');
const page = readFileSync(indexPath, 'utf8');
if (!page.includes('</head>')) throw new Error('postbuild: index.html has no </head>');
writeFileSync(indexPath, page.replace('</head>', `<meta name="openberea-build" content="${shellBuild}" />\n</head>`));

// Core data, available offline after the first visit (spec: KJV, ASV, original-language texts,
// and lexicons; plus the concordance, grammar tables, and search index those features rely on).
const CORE = [
  /^\/data\/kjv\//,
  /^\/data\/asv\//,
  /^\/data\/stepbible\/orig\//,
  /^\/data\/stepbible\/lex\//,
  /^\/data\/stepbible\/conc\//,
  /^\/data\/stepbible\/morph\//,
  /^\/data\/stepbible\/names\.json$/,
  /^\/data\/strongs\//,
  /^\/data\/thayer\//,
  /^\/data\/bdb\//,
  /^\/data\/gesenius\//,
  /^\/data\/search\//,
  /^\/data\/content\//,
  /^\/data\/manifest\.json$/,
];
const dataFiles = walk(join(dist, 'data'))
  .map(url)
  .filter((f) => !f.endsWith('LICENSE.txt') && !f.includes('/.sources/') && f.endsWith('.json'));
const core = dataFiles.filter((f) => CORE.some((re) => re.test(f)));
const coreBytes = core.reduce((n, f) => n + statSync(join(dist, f)).size, 0);

let dataVersion = 'none';
try {
  dataVersion = JSON.parse(readFileSync(join(dist, 'data', 'manifest.json'), 'utf8')).version;
} catch {}

writeFileSync(join(dist, 'precache.json'), JSON.stringify({ version: dataVersion, core }));

const swPath = join(dist, 'sw.js');
if (existsSync(swPath)) {
  const build = { shell: shellBuild, data: dataVersion, shellFiles };
  const source = readFileSync(swPath, 'utf8');
  if (!source.includes('const BUILD = __BUILD__;')) throw new Error('postbuild: sw.js build placeholder not found');
  writeFileSync(swPath, source.replace('const BUILD = __BUILD__;', `const BUILD = ${JSON.stringify(build)};`));
}

// Cloudflare static-asset headers. No cookies are ever set; no third-party scripts are loaded.
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' https://audio.desiringgod.org https://archive.org https://*.archive.org https://*.us.archive.org",
  "frame-src https://www.youtube-nocookie.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join('; ');
writeFileSync(
  join(dist, '_headers'),
  [
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()',
    `  Content-Security-Policy: ${csp}`,
    // Only file names with a content hash may be cached as never changing. Everything else is
    // checked with the server on use (a quick "not modified" when unchanged), so a deploy shows
    // up at once. Pages, icons, the manifest, and boot.js get Cloudflare's default, which does the
    // same. (Cloudflare answers a missing file with the app's page; the app and the service worker
    // treat that as missing and never keep it.)
    '/_expo/static/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/fonts/*',
    '  Cache-Control: public, max-age=86400',
    '/data/*',
    '  Cache-Control: public, max-age=0, must-revalidate',
    '/sw.js',
    '  Cache-Control: no-cache',
    '/precache.json',
    '  Cache-Control: no-cache',
    '',
  ].join('\n'),
);

const files = walk(dist).length;
console.log(`postbuild: ${shellFiles.length} shell files, ${core.length} core data files (${(coreBytes / 1e6).toFixed(1)} MB), ${files} files in total`);
if (files > 19500) console.warn(`postbuild: WARNING ${files} files is close to Cloudflare's 20,000-file limit`);
