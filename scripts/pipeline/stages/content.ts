// Small stages: self-hosted fonts, the gospel harmony, LibriVox audio, owner-edited content, and
// the data manifest (last).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { type BookCode, bookInfo, isBookCode } from '../../../src/lib/bible/books';
import { fromCompact } from '../../../src/lib/bible/refs';
import { verseCount } from '../../../src/lib/bible/versification';
import type { AudioBook, AudioIndex, DataManifest, GospelCode, Harmony, ResourceItem, StarterSet } from '../../../src/lib/data/types';
import { CACHE, CONTENT, download, ensureDir, log, OUT, readJson, recordSource, ROOT, type SourceRecord, writeData, writeText } from '../lib/context';
import type { Stage } from '../run';

const FONTS_OUT = join(ROOT, 'public', 'fonts');

const FONT_PACKAGES = [
  {
    family: 'Literata',
    version: '3.103',
    url: 'https://github.com/googlefonts/literata/releases/download/3.103/3.103.zip',
    zip: 'literata-3.103.zip',
    sha256: 'f7fb973cafb26cf785cbebaeaf51c18f87c15a3bcf4d82a7d4857564db5b056d',
    files: ['Literata-Regular.woff2', 'Literata-Italic.woff2', 'Literata-Bold.woff2', 'Literata-BoldItalic.woff2'],
    license: 'OFL.txt',
    homepage: 'https://github.com/googlefonts/literata',
  },
  {
    family: 'Inter',
    version: '4.1',
    url: 'https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip',
    zip: 'Inter-4.1.zip',
    sha256: '9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e',
    files: ['Inter-Regular.woff2', 'Inter-Medium.woff2', 'Inter-SemiBold.woff2'],
    license: 'LICENSE.txt',
    homepage: 'https://rsms.me/inter/',
  },
  {
    family: 'Ezra SIL',
    version: '2.51',
    url: 'https://software.sil.org/downloads/r/ezra/EzraSIL-2.51-web.zip',
    zip: 'EzraSIL-2.51-web.zip',
    sha256: '7c19544c173c91e6ac47f605dae2cfa7e61e428abdafe27cf3f225fec4406357',
    files: ['SILEOT.woff'],
    license: 'Licenses.txt',
    homepage: 'https://software.sil.org/ezra/',
  },
  {
    family: 'Gentium Plus',
    version: '6.200',
    url: 'https://software.sil.org/downloads/r/gentium/GentiumPlus-6.200.zip',
    zip: 'GentiumPlus-6.200.zip',
    sha256: '9b21103b79961149b6508791572acb3b2fe7eb621474c57d5e4ee37e76d7b073',
    files: ['GentiumPlus-Regular.woff2', 'GentiumPlus-Italic.woff2'],
    license: 'OFL.txt',
    homepage: 'https://software.sil.org/gentium/',
  },
];

function findFile(dir: string, name: string): string | null {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(p, name);
      if (found) return found;
    } else if (entry.name === name) return p;
  }
  return null;
}

const fonts: Stage = {
  id: 'fonts',
  description: 'Self-hosted fonts (SIL Open Font License): Literata, Inter, Ezra SIL, Gentium Plus',
  run: async () => {
    ensureDir(join(FONTS_OUT, 'licenses'));
    for (const pkg of FONT_PACKAGES) {
      const { path, bytes } = await download(pkg.url, 'fonts/_zips', pkg.zip, pkg.sha256);
      const dir = join(CACHE, 'fonts', '_unzipped', pkg.zip.replace(/\.zip$/, ''));
      if (!existsSync(dir)) {
        ensureDir(dir);
        execFileSync('unzip', ['-q', '-o', path, '-d', dir]);
      }
      // Files are copied byte-for-byte: no subsetting or conversion (OFL FAQ 2.2.1, 2.6).
      for (const file of pkg.files) {
        const src = findFile(dir, file);
        if (!src) throw new Error(`${pkg.family}: ${file} not found in ${pkg.zip}`);
        copyFileSync(src, join(FONTS_OUT, file));
      }
      const lic = findFile(dir, pkg.license);
      if (!lic) throw new Error(`${pkg.family}: license ${pkg.license} not found`);
      copyFileSync(lic, join(FONTS_OUT, 'licenses', `${pkg.family.replace(/\s+/g, '')}-${pkg.license}`));
      log('fonts', `${pkg.family} ${pkg.version}: ${pkg.files.length} files (${(bytes / 1e6).toFixed(1)} MB package)`);
    }
    const record: SourceRecord = {
      id: 'fonts',
      name: 'Fonts: Literata, Inter, Ezra SIL, Gentium Plus',
      homepage: FONT_PACKAGES.map((p) => p.homepage).join(' '),
      version: FONT_PACKAGES.map((p) => `${p.family} ${p.version}`).join('; '),
      files: FONT_PACKAGES.map((p) => ({ url: p.url, sha256: p.sha256, bytes: statSync(join(CACHE, 'fonts/_zips', p.zip)).size })),
      license: {
        id: 'OFL-1.1',
        name: 'SIL Open Font License 1.1',
        url: 'https://openfontlicense.org',
        attribution:
          'Literata © The Literata Project Authors; Inter © The Inter Project Authors; Ezra SIL © SIL International (Hebrew layout code MIT-licensed); Gentium Plus © SIL International. All under the SIL Open Font License 1.1. Served unmodified.',
        confirmedAt: 'License files inside each official release package (copied to /fonts/licenses/).',
      },
      outputs: [],
      notes: 'Ezra SIL is served as the upstream WOFF file. Gentium Plus 6.200 is used as the spec names it; SIL has since renamed the family "Gentium" (7.000).',
    };
    recordSource(record);
  },
};

// ---------------------------------------------------------------------------------------------

interface RobertsonRow {
  part: string;
  section: number;
  label: string;
  order: number;
  title: string;
  ranges: Partial<Record<GospelCode, [number, number, number, number][]>>;
}

function rangeToCompact(book: BookCode, [c1, v1, c2, v2]: [number, number, number, number]): string {
  if (c1 === c2) return v1 === v2 ? `${book}.${c1}.${v1}` : `${book}.${c1}.${v1}-${v2}`;
  return `${book}.${c1}.${v1}-${c2}.${v2}`;
}

export function buildHarmony(rows: RobertsonRow[]): Harmony {
  const parts: Harmony['parts'] = [];
  for (const row of [...rows].sort((a, b) => a.order - b.order)) {
    let part = parts[parts.length - 1];
    if (!part || part.title !== row.part) {
      part = { title: row.part, sections: [] };
      parts.push(part);
    }
    const refs: Partial<Record<GospelCode, string>> = {};
    for (const g of ['MAT', 'MRK', 'LUK', 'JHN'] as GospelCode[]) {
      const ranges = row.ranges[g];
      if (ranges?.length) refs[g] = ranges.map((r) => rangeToCompact(g, r)).join(';');
    }
    part.sections.push({ n: row.order, title: `${row.label}. ${row.title}`, refs });
  }
  return { title: 'A Harmony of the Gospels (A. T. Robertson, 1922)', parts };
}

const harmony: Stage = {
  id: 'harmony',
  description: "Gospel harmony: A. T. Robertson's Harmony of the Gospels (1922)",
  run: async () => {
    const src = await download('https://www.gutenberg.org/cache/epub/36264/pg36264.txt', 'harmony', 'pg36264.txt', 'e4fa605f9b0ecd90146f47a8b9427bb01b35a222d40aa39cd46cd222bdf2fc9d');
    const rows = readJson<RobertsonRow[]>(join(CONTENT, 'harmony-robertson.json'));
    const out = buildHarmony(rows);
    // Verify: every reference is a real KJV passage, and the section count matches the book.
    let sections = 0;
    for (const part of out.parts)
      for (const s of part.sections) {
        sections++;
        for (const ref of Object.values(s.refs))
          for (const piece of ref!.split(';')) {
            const r = fromCompact(piece);
            if (!r || !r.verse || r.verse > verseCount(r.book, r.chapter)) throw new Error(`harmony: bad ref ${piece} in §${s.title}`);
            const endCh = r.endChapter ?? r.chapter;
            if ((r.endVerse ?? r.verse) > verseCount(r.book, endCh)) throw new Error(`harmony: bad end ${piece}`);
          }
      }
    if (sections !== 185) throw new Error(`harmony: expected 185 sections (1–184 with 128a/b), got ${sections}`);
    const first = out.parts[0].sections[0];
    if (first.refs.LUK !== 'LUK.1.1-4') throw new Error('harmony: §1 should be Luke 1:1-4');
    writeData('harmony/robertson.json', out);
    log('harmony', `${out.parts.length} parts, ${sections} sections`);
    recordSource({
      id: 'harmony-robertson',
      name: 'A. T. Robertson, A Harmony of the Gospels for Students of the Life of Christ (1922)',
      homepage: 'https://www.gutenberg.org/ebooks/36264',
      version: 'Project Gutenberg eBook #36264; section table checked against two 1922 Doran scans (archive.org harmonyofgospels00robe, harmonyofgospels00robeuoft)',
      files: [{ url: 'https://www.gutenberg.org/cache/epub/36264/pg36264.txt', sha256: src.sha256, bytes: src.bytes }],
      license: {
        id: 'PD',
        name: 'Public domain in the United States (published 1922)',
        attribution: "Gospel harmony sections from A. T. Robertson, A Harmony of the Gospels (1922), public domain; text via Project Gutenberg.",
        confirmedAt: 'Title page of the 1922 George H. Doran printing; Project Gutenberg marks it public domain in the US.',
      },
      outputs: ['harmony'],
      notes: 'Section titles and references only (facts from a public-domain work). The curated table lives in content/harmony-robertson.json, with corrections of eight misprints noted per section.',
    });
  },
};

// ---------------------------------------------------------------------------------------------

interface LibrivoxBook {
  project: string;
  librivoxUrl: string;
  reader: string;
  files: { chapters: [number, number]; url: string; readers?: string[] }[];
}

export function buildAudio(books: Record<string, LibrivoxBook>): AudioIndex {
  const out: AudioIndex = {};
  for (const [code, book] of Object.entries(books)) {
    if (!isBookCode(code)) throw new Error(`audio: unknown book ${code}`);
    const entry: AudioBook = {
      reader: book.reader,
      project: book.project,
      url: book.librivoxUrl,
      files: book.files.map((f) => ({
        src: f.url,
        from: f.chapters[0],
        to: f.chapters[1],
        ...(f.readers?.length && f.readers.join(', ') !== book.reader ? { reader: f.readers.join(', ') } : {}),
      })),
    };
    out[code] = entry;
  }
  return out;
}

const audio: Stage = {
  id: 'audio',
  description: 'Audio Bible: LibriVox KJV recordings (chapter map)',
  run: async () => {
    const books = readJson<Record<string, LibrivoxBook>>(join(CONTENT, 'librivox-kjv.json'));
    const out = buildAudio(books);
    // Verify every chapter of every book is covered by a recording.
    let covered = 0;
    for (const code of Object.keys(out) as BookCode[]) {
      const files = out[code]!.files;
      for (let c = 1; c <= bookInfo(code).chapters; c++) {
        if (!files.some((f) => f.from <= c && c <= f.to)) throw new Error(`audio: ${code} ${c} has no recording`);
        covered++;
      }
      for (const f of files) if (!/^https:\/\/archive\.org\/download\//.test(f.src)) throw new Error(`audio: unexpected URL ${f.src}`);
    }
    if (covered !== 1189) throw new Error(`audio: expected 1189 chapters, got ${covered}`);
    writeData('librivox/kjv.json', out);
    log('audio', `${Object.keys(out).length} books, ${covered} chapters`);
    recordSource({
      id: 'librivox',
      name: 'LibriVox King James Version recordings',
      homepage: 'https://librivox.org',
      version: 'Chapter map built from the LibriVox and archive.org APIs on 2026-10-02 (content/librivox-kjv.json)',
      files: [],
      license: {
        id: 'PD',
        name: 'Public domain (LibriVox recordings)',
        url: 'https://librivox.org/pages/public-domain/',
        attribution: 'Audio: King James Version recordings by LibriVox volunteers (librivox.org), public domain. Readers are named for each book.',
        confirmedAt: 'https://librivox.org/pages/public-domain/',
      },
      outputs: ['librivox'],
      notes: 'Audio streams from archive.org (where LibriVox hosts its files); only the chapter map is hosted here. No verse timings exist, so playback is by chapter.',
    });
  },
};

// ---------------------------------------------------------------------------------------------

function checkRef(s: string, where: string) {
  const r = fromCompact(s);
  if (!r) throw new Error(`${where}: bad ref "${s}"`);
  if (r.verse && r.verse > verseCount(r.book, r.chapter)) throw new Error(`${where}: verse out of range "${s}"`);
}

const content: Stage = {
  id: 'content',
  description: 'Owner-edited content: resource library, verse of the day, memorization starter sets',
  run: async () => {
    const votd = readJson<{ verses: string[] }>(join(CONTENT, 'votd.json'));
    votd.verses.forEach((r) => checkRef(r, 'votd.json'));
    if (existsSync(join(CONTENT, 'resources.json'))) {
      const resources = readJson<{ items: ResourceItem[] }>(join(CONTENT, 'resources.json'));
      const ids = new Set<string>();
      for (const item of resources.items) {
        if (ids.has(item.id)) throw new Error(`resources.json: duplicate id ${item.id}`);
        ids.add(item.id);
        item.refs.forEach((r) => checkRef(r, `resources.json ${item.id}`));
        item.books.forEach((b) => {
          if (!isBookCode(b)) throw new Error(`resources.json ${item.id}: bad book ${b}`);
        });
        if (!/^https:\/\//.test(item.url)) throw new Error(`resources.json ${item.id}: URL must be https`);
      }
      writeData('content/resources.json', resources);
      log('content', `${resources.items.length} resources`);
    }
    if (existsSync(join(CONTENT, 'memorize-starters.json'))) {
      const starters = readJson<{ sets: StarterSet[] }>(join(CONTENT, 'memorize-starters.json'));
      starters.sets.forEach((s) => checkRef(s.ref, `memorize-starters.json ${s.id}`));
      writeData('content/memorize-starters.json', starters);
      log('content', `${starters.sets.length} starter sets`);
    }
    writeText(
      'content/LICENSE.txt',
      'OpenBerea curated content (resource list, verse-of-the-day list, starter sets): MIT, like the code.\nLinked resources belong to their owners and are linked, not copied.\n',
    );
  },
};

// ---------------------------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const manifest: Stage = {
  id: 'manifest',
  last: true,
  description: 'Data manifest: every source, its license, and a content hash of all data files',
  run: async () => {
    const files = walk(OUT)
      .filter((p) => !p.includes(`${join(OUT, '.sources')}`) && !p.endsWith('manifest.json'))
      .sort();
    const hash = createHash('sha256');
    for (const f of files) {
      hash.update(relative(OUT, f));
      hash.update(readFileSync(f));
    }
    const sourcesDir = join(OUT, '.sources');
    const sources = readdirSync(sourcesDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJson<SourceRecord>(join(sourcesDir, f)))
      .sort((a, b) => a.id.localeCompare(b.id));
    const doc: DataManifest & { files: number; bytes: number } = {
      version: hash.digest('hex').slice(0, 16),
      generated: new Date().toISOString(),
      files: files.length,
      bytes: files.reduce((n, f) => n + statSync(f).size, 0),
      sources: sources.map((s) => ({
        id: s.id,
        name: s.name,
        homepage: s.homepage,
        version: s.version,
        license: { id: s.license.id, name: s.license.name, url: s.license.url, attribution: s.license.attribution },
        outputs: s.outputs,
      })),
    };
    writeData('manifest.json', doc);
    log('manifest', `${sources.length} sources, ${files.length} files, ${(doc.bytes / 1e6).toFixed(1)} MB, version ${doc.version}`);
  },
};

export const stages: Stage[] = [fonts, harmony, audio, content, manifest];
