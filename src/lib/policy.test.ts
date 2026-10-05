import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// Guards the spec's hard rules in the source itself: nothing stored, no tracking, no text-to-speech,
// and all interface text in translation files.

const SRC = join(__dirname, '..');

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Source with comments removed, so documentation that names an API doesn't count. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

// Paths relative to src/, with forward slashes on every OS.
const all = files(SRC).map((p) => ({ p: p.slice(SRC.length + 1).replace(/\\/g, '/'), src: code(p) }));

describe('privacy and scope rules', () => {
  it('never uses storage for user state (no cookies, localStorage, sessionStorage, IndexedDB)', () => {
    const hits = all.filter(({ p, src }) => !p.startsWith('i18n/') && /\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/.test(src));
    expect(hits.map((h) => h.p)).toEqual([]);
  });

  it('has no tracking, analytics, or beacons', () => {
    const hits = all.filter(({ p, src }) => !p.startsWith('i18n/') && /\b(gtag|analytics|sendBeacon|googletagmanager|plausible|segment\.io)\b/i.test(src));
    expect(hits.map((h) => h.p)).toEqual([]);
  });

  it('has no text-to-speech (out of scope)', () => {
    expect(all.filter(({ src }) => /speechSynthesis|SpeechSynthesisUtterance/.test(src)).map((h) => h.p)).toEqual([]);
  });

  it('keeps interface text in translation files (no hard-coded English in JSX)', () => {
    const offenders: string[] = [];
    for (const { p, src } of all) {
      if (!p.endsWith('.tsx')) continue;
      // Text directly between JSX tags, e.g. <Text>Hello there</Text>.
      for (const m of src.matchAll(/>\s*([A-Za-z][A-Za-z ,.’'!?-]{3,})\s*<\//g)) offenders.push(`${p}: ${m[1].trim()}`);
      for (const m of src.matchAll(/\b(?:label|accessibilityLabel|aria-label|placeholder|title)="([A-Za-z][^"]{2,})"/g)) offenders.push(`${p}: ${m[1]}`);
    }
    expect(offenders).toEqual([]);
  });
});
