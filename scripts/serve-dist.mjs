// Minimal static server for the exported site (dist/, or DIST_DIR), used by end-to-end tests
// and Lighthouse. Mirrors Cloudflare's single-page-application fallback.
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { createGzip } from 'node:zlib';

const root = join(process.cwd(), process.env.DIST_DIR ?? 'dist');
const port = Number(process.env.PORT ?? 4173);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};
const compressible = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.webmanifest']);

function fileFor(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const candidates = [join(root, clean), join(root, clean, 'index.html')];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {}
  }
  return null;
}

// Cloudflare-style _headers: "pattern" lines (with optional trailing *) followed by indented headers.
function loadHeaders() {
  try {
    const rules = [];
    let current = null;
    for (const line of readFileSync(join(root, '_headers'), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      if (!/^\s/.test(line)) {
        current = { pattern: line.trim(), headers: {} };
        rules.push(current);
      } else if (current) {
        const i = line.indexOf(':');
        current.headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
      }
    }
    return rules;
  } catch {
    return [];
  }
}
const headerRules = loadHeaders();
const matches = (pattern, path) => (pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern);

createServer((req, res) => {
  const urlPath = req.url ?? '/';
  let file = fileFor(urlPath);
  let status = 200;
  if (!file) {
    // Missing data or asset files are real 404s; app routes fall back to the shell.
    if (/^\/(data|_expo|assets|fonts)\//.test(urlPath) || extname(urlPath.split('?')[0])) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    file = join(root, 'index.html');
  }
  const ext = extname(file);
  const headers = { 'content-type': types[ext] ?? 'application/octet-stream', 'cache-control': 'no-cache' };
  const pathOnly = urlPath.split('?')[0];
  for (const rule of headerRules) if (matches(rule.pattern, pathOnly)) Object.assign(headers, rule.headers);
  headers['cache-control'] = 'no-cache';
  const gzip = compressible.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
  if (gzip) headers['content-encoding'] = 'gzip';
  res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = createReadStream(file);
  (gzip ? stream.pipe(createGzip({ level: 6 })) : stream).pipe(res);
}).listen(port, () => {
  console.log(`Serving dist/ at http://localhost:${port}`);
});
