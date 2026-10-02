// Shared constants and small helpers for the STEPBible converters (stages/stepbible.ts).
import { createReadStream } from 'node:fs';
import { basename } from 'node:path';
import { createInterface } from 'node:readline';

import { type BookCode, isBookCode } from '../../../src/lib/bible/books';
import { download } from './context';

export const STEP_SHA = 'b99716b0cddb648ddb95cc786a197180f2f97d48';
export const STEP_REPO = 'https://github.com/STEPBible/STEPBible-Data';
const RAW = `https://raw.githubusercontent.com/STEPBible/STEPBible-Data/${STEP_SHA}/`;

/** Repository paths at the pinned commit, with the sha256 of the cached copy. */
export const STEP_FILES = {
  readme: {
    path: 'README.md',
    sha256: '261d5157c0ffeadeedad3f734db945a4c3642e3e4ce5fa28002985b6c52437b1',
  },
  tahotGenDeu: {
    path: 'Translators Amalgamated OT+NT/TAHOT Gen-Deu - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt',
    sha256: 'e9b8546ee48fe0bfc57c3b70f5f40e98d96580e803526d19026224e31753368b',
  },
  tahotJosEst: {
    path: 'Translators Amalgamated OT+NT/TAHOT Jos-Est - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt',
    sha256: '195fee1dc3653bab33701f170734eb894ed647c10cd08cc61749375fe8b73775',
  },
  tahotJobSng: {
    path: 'Translators Amalgamated OT+NT/TAHOT Job-Sng - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt',
    sha256: '84e118a97e5725e3847cdfdd593873513021c790c63cc91a0d41fca2b5db2ed5',
  },
  tahotIsaMal: {
    path: 'Translators Amalgamated OT+NT/TAHOT Isa-Mal - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt',
    sha256: 'f3ded203d2a74d6368932c97ae550d1d0754b271af491dc0dedf36fe3ba0bcc5',
  },
  tagntMatJhn: {
    path: 'Translators Amalgamated OT+NT/TAGNT Mat-Jhn - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt',
    sha256: 'ab8eaaeb68e17a1dcfa34e1e9350358f22f03bc2a97244d848750ad81044bc8e',
  },
  tagntActRev: {
    path: 'Translators Amalgamated OT+NT/TAGNT Act-Rev - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt',
    sha256: '524e32375361e6d3fa2f7ef00b87605fdc4317a762f395651a05fdc31ad031b7',
  },
  tbesh: {
    path: 'Lexicons/TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt',
    sha256: '464dccadd95fd8620dd05fa0d7a4caba58ec3c4d5db3ebf38e43d046ca25b591',
  },
  tbesg: {
    path: 'Lexicons/TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt',
    sha256: '312f723d7b8ef263bbdfb0451c9b8057125804dfff390b6f8544cff2a84b57f4',
  },
  tehmc: {
    path: 'Morphology codes/TEHMC - Translators Expansion of Hebrew Morphology Codes - STEPBible.org CC BY.txt',
    sha256: '78779bea824b31d4467dec0161d547481c86f266bc39def12cd11dc7dcbe6da7',
  },
  tegmc: {
    // "Morphhology" is the upstream spelling.
    path: 'Morphology codes/TEGMC - Translators Expansion of Greek Morphhology Codes - STEPBible.org CC BY.txt',
    sha256: '5f0416f7617019a6082285214903bde569a980d5fd3b88b8d7020d944e94de82',
  },
  tipnr: {
    path: 'Proper Nouns/TIPNR - Translators Individualised Proper Names with all References - STEPBible.org CC BY.txt',
    sha256: '63a129dac8c341772bdc5b6604b97542ad36a8821d61334d824f8efc2cd88fa8',
  },
} as const;

export type StepFileKey = keyof typeof STEP_FILES;

export const TAHOT_KEYS: StepFileKey[] = ['tahotGenDeu', 'tahotJosEst', 'tahotJobSng', 'tahotIsaMal'];
export const TAGNT_KEYS: StepFileKey[] = ['tagntMatJhn', 'tagntActRev'];

/** Raw URL at the pinned commit. Each path segment is URL-encoded ("OT+NT" → "OT%2BNT"). */
export function stepUrl(path: string): string {
  return RAW + path.split('/').map(encodeURIComponent).join('/');
}

export interface FetchedFile {
  key: StepFileKey;
  url: string;
  path: string;
  sha256: string;
  bytes: number;
}

/** Ensures the pinned file is in .cache/sources/stepbible/ with the expected checksum. */
export async function fetchStep(key: StepFileKey): Promise<FetchedFile> {
  const file = STEP_FILES[key];
  const url = stepUrl(file.path);
  const got = await download(url, 'stepbible', basename(file.path), file.sha256);
  return { key, url, ...got };
}

/** Streams a text file line by line, without the BOM and without "\r". */
export async function* readLines(path: string): AsyncGenerator<string> {
  const rl = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  let first = true;
  for await (const raw of rl) {
    let line = raw;
    if (first) {
      line = line.replace(/^﻿/, '');
      first = false;
    }
    yield line.endsWith('\r') ? line.slice(0, -1) : line;
  }
}

/** STEPBible book abbreviations ("Gen", "1Sa", "Jhn", "Ezk") are our codes in upper case. */
export function stepBook(abbr: string): BookCode | null {
  const up = abbr.toUpperCase();
  return isBookCode(up) ? up : null;
}

/** "H0430G" → "H430", "G0025" → "G25", "{H7225G}" → "H7225". Returns null when not a Strong's tag. */
export function baseStrong(tag: string): string | null {
  const m = /([HG])0*(\d+)/.exec(tag);
  return m ? `${m[1]}${m[2]}` : null;
}

/** Number of a Strong's id ("H0430G" → 430). */
export function strongNumber(tag: string): number {
  const m = /[HG](\d+)/.exec(tag);
  return m ? Number(m[1]) : NaN;
}

/** Bucket file for a Strong's id: floor(n / 100). */
export function strongBucket(tag: string): number {
  return Math.floor(strongNumber(tag) / 100);
}

/** True for Hebrew affix and punctuation tags (H9001–H9049), which are not lexical words. */
export function isAffixTag(tag: string): boolean {
  return /^H9\d{3}$/.test(baseStrong(tag) ?? '');
}

/**
 * Formats the source verse(s) behind one KJV verse: "3:19", "51:1-2", "20:42-21:1".
 * `refs` are [chapter, verse] pairs in text order.
 */
export function formatSourceRefs(refs: [number, number][]): string {
  const first = refs[0];
  const last = refs[refs.length - 1];
  if (refs.length === 1 || (first[0] === last[0] && first[1] === last[1])) return `${first[0]}:${first[1]}`;
  if (first[0] === last[0]) return `${first[0]}:${first[1]}-${last[1]}`;
  return `${first[0]}:${first[1]}-${last[0]}:${last[1]}`;
}

export const ALL_EDITIONS = ['NA28', 'NA27', 'Tyn', 'SBL', 'WH', 'Treg', 'TR', 'Byz'] as const;

/** Edition tokens without word-order displacement suffixes ("TR»1" → "TR", "Byz«14.24" → "Byz"). */
export function editionTokens(editions: string): string[] {
  return editions
    .split('+')
    .map((e) => e.replace(/[»«].*$/, '').trim())
    .filter(Boolean);
}
