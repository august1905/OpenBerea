// Runs after `expo export`: stamps the service worker with build versions, writes the offline
// precache list, and writes Cloudflare static-asset headers.
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
  const build = { shell: shellHash.digest('hex').slice(0, 12), data: dataVersion, shellFiles };
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
    '/_expo/static/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/fonts/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/data/*',
    '  Cache-Control: public, max-age=3600',
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
