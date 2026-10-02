// Checks that every external link OpenBerea uses actually resolves: curated resources, the link-out
// patterns (sampled across books, including the odd slugs), teacher pages, embedded media, LibriVox
// audio, and every source homepage and license URL in the data manifest.
//
//   npx tsx scripts/check-links.ts            (exits non-zero on failures)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { links } from '../src/features/resources/links';
import type { BookCode } from '../src/lib/bible/books';
import type { AudioIndex, DataManifest, ResourceItem } from '../src/lib/data/types';

const ROOT = join(__dirname, '..');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

type Kind = 'page' | 'media' | 'youtube';
interface Check {
  url: string;
  label: string;
  kind: Kind;
  /** Text expected in the page <title> (soft-404 detection). */
  expect?: RegExp;
}

const checks: Check[] = [];
const add = (url: string | null, label: string, kind: Kind = 'page', expect?: RegExp) => {
  if (url) checks.push({ url, label, kind, expect });
};

// Link-out patterns, sampled on books whose slugs differ most between sites.
const samples: [BookCode, number, number, 'OT' | 'NT'][] = [
  ['GEN', 1, 1, 'OT'], ['RUT', 1, 16, 'OT'], ['1SA', 17, 45, 'OT'], ['PSA', 23, 1, 'OT'], ['SNG', 2, 4, 'OT'], ['EZK', 37, 1, 'OT'],
  ['JOL', 2, 28, 'OT'], ['NAM', 1, 7, 'OT'], ['MAT', 5, 3, 'NT'], ['MRK', 1, 1, 'NT'], ['JHN', 3, 16, 'NT'], ['PHP', 4, 13, 'NT'],
  ['PHM', 1, 6, 'NT'], ['1JN', 4, 8, 'NT'], ['3JN', 1, 4, 'NT'], ['JUD', 1, 24, 'NT'], ['REV', 22, 21, 'NT'],
];
for (const [b, c, v, t] of samples) {
  add(links.blbVerse(b, c, v), `BLB verse ${b} ${c}:${v}`, 'page', new RegExp(`${c} \\(KJV\\)`));
  add(links.blbVerse(b, c, v, 'asv'), `BLB ASV ${b} ${c}:${v}`, 'page', new RegExp(`${c} \\(ASV\\)`));
  add(links.blbInterlinear(b, c, v, t), `BLB interlinear ${b} ${c}:${v}`, 'page', new RegExp(`Interlinear .*${c}:${v}`));
  add(links.bibleHubVerse(b, c, v), `Bible Hub ${b} ${c}:${v}`);
  add(links.bibleHubInterlinear(b, c, v), `Bible Hub interlinear ${b} ${c}:${v}`);
  add(links.stepVerse(b, c, v), `STEP ${b} ${c}:${v}`);
  add(links.bibleGateway(b, c, v), `Bible Gateway ${b} ${c}:${v}`, 'page', /Bible Gateway/i);
  add(links.heartcryChapter(b, c), `HeartCry SermonAudio ${b} ${c}`);
  add(links.dgChapter(b, c), `Desiring God ${b} ${c}`);
}
for (const s of ['G25', 'G26', 'G5624', 'H1', 'H430', 'H8674']) {
  add(links.blbLexicon(s), `BLB lexicon ${s}`, 'page', new RegExp(`^${s} - .*Strong's`));
  add(links.bibleHubStrongs(s), `Bible Hub Strong's ${s}`);
}
add(links.gtyScripture(), 'Grace to You scripture archive');
add(links.washerSpeaker(), 'SermonAudio Paul Washer');
for (const home of ['https://www.desiringgod.org/', 'https://www.gty.org/', 'https://www.heartcrymissionary.com/', 'https://heartcrymissionary.com/copyrights-and-permissions/', 'https://www.gty.org/about?tab=copyright'])
  add(home, `Teacher page ${home}`);

// Curated resources and their embedded media.
const resources = JSON.parse(readFileSync(join(ROOT, 'content', 'resources.json'), 'utf8')) as { items: ResourceItem[] };
for (const item of resources.items) {
  add(item.url, `Resource ${item.id}`);
  if (item.embed?.kind === 'audio') add(item.embed.src, `Audio ${item.id}`, 'media');
  if (item.embed?.kind === 'youtube') add(item.embed.id, `YouTube ${item.id}`, 'youtube');
}

// LibriVox audio: the first and last recording of every book.
try {
  const audio = JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'librivox', 'kjv.json'), 'utf8')) as AudioIndex;
  for (const [book, entry] of Object.entries(audio)) {
    add(entry!.files[0].src, `LibriVox ${book} first`, 'media');
    if (entry!.files.length > 1) add(entry!.files[entry!.files.length - 1].src, `LibriVox ${book} last`, 'media');
    add(entry!.url, `LibriVox project ${book}`);
  }
} catch {
  console.warn('No public/data/librivox/kjv.json; run npm run data first to check audio.');
}

// Source homepages and license URLs.
try {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'manifest.json'), 'utf8')) as DataManifest;
  for (const s of manifest.sources) {
    for (const home of s.homepage.split(' ')) add(home, `Source ${s.id} homepage`);
    if (s.license.url) add(s.license.url, `Source ${s.id} license`);
  }
} catch {
  console.warn('No public/data/manifest.json; run npm run data first to check source pages.');
}

const unique = [...new Map(checks.map((c) => [c.url + c.kind, c])).values()];

interface Result {
  check: Check;
  ok: boolean;
  status: number | string;
  note?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries rate limits and transient origin errors (429, 5xx, network) with backoff. */
async function runWithRetry(c: Check): Promise<Result> {
  let last: Result | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    last = await run(c);
    const transient = last.status === 'error' || last.status === 429 || (typeof last.status === 'number' && last.status >= 500);
    if (last.ok || !transient) return last;
    await sleep(1500 * 2 ** attempt);
  }
  return last!;
}

async function run(c: Check): Promise<Result> {
  try {
    if (c.kind === 'youtube') {
      const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${c.url}`)}&format=json`);
      if (!res.ok) return { check: c, ok: false, status: res.status };
      const body = (await res.json()) as { author_name?: string };
      return { check: c, ok: body.author_name === 'Desiring God', status: res.status, note: `channel: ${body.author_name}` };
    }
    if (c.kind === 'media') {
      const res = await fetch(c.url, { method: 'GET', headers: { 'user-agent': UA, range: 'bytes=0-1023' }, redirect: 'follow' });
      const type = res.headers.get('content-type') ?? '';
      await res.body?.cancel();
      return { check: c, ok: (res.status === 200 || res.status === 206) && /audio|mpeg|octet/.test(type), status: res.status, note: type };
    }
    const res = await fetch(c.url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, redirect: 'follow' });
    const html = res.headers.get('content-type')?.includes('html') ? await res.text() : '';
    if (!html) await res.body?.cancel();
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
    if (res.status === 403 && /just a moment|attention required/i.test(title + html.slice(0, 2000))) {
      return { check: c, ok: true, status: 403, note: 'bot challenge (opens normally in a browser; verified earlier via Wayback snapshots)' };
    }
    if (!res.ok) return { check: c, ok: false, status: res.status, note: title };
    if (/\b(404|not found|page not found)\b/i.test(title)) return { check: c, ok: false, status: res.status, note: `soft 404: ${title}` };
    if (c.expect && !c.expect.test(title)) return { check: c, ok: false, status: res.status, note: `unexpected title: ${title}` };
    return { check: c, ok: true, status: res.status, note: title.slice(0, 70) };
  } catch (e) {
    return { check: c, ok: false, status: 'error', note: (e as Error).message };
  }
}

async function main() {
  const results: Result[] = [];
  // One request at a time per host (sites rate-limit bursts); hosts run in parallel.
  const byHost = new Map<string, Check[]>();
  for (const c of unique) {
    const host = c.kind === 'youtube' ? 'www.youtube.com' : new URL(c.url).host;
    byHost.set(host, [...(byHost.get(host) ?? []), c]);
  }
  await Promise.all(
    [...byHost.values()].map(async (list) => {
      for (const c of list) {
        results.push(await runWithRetry(c));
        await sleep(400);
      }
    }),
  );
  const failed = results.filter((r) => !r.ok);
  const challenged = results.filter((r) => r.ok && r.status === 403);
  for (const r of failed) console.log(`FAIL ${r.status} ${r.check.label}\n     ${r.check.url}${r.note ? `\n     ${r.note}` : ''}`);
  console.log(`\n${results.length} links checked: ${results.length - failed.length} ok (${challenged.length} behind a bot challenge), ${failed.length} failed.`);
  if (failed.length) process.exit(1);
}

main();
