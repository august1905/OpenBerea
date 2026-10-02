// Shared helpers for pipeline stages: paths, downloads with checksums, JSON output, and the manifest.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

export const ROOT = join(__dirname, '..', '..', '..');
export const CACHE = join(ROOT, '.cache', 'sources');
export const OUT = join(ROOT, 'public', 'data');
export const CONTENT = join(ROOT, 'content');

/** License block recorded in the manifest and written as LICENSE.txt in each data folder. */
export interface LicenseInfo {
  /** SPDX-style id: "CC-BY-4.0", "CC-BY-SA-4.0", "PD", "OFL-1.1", … */
  id: string;
  name: string;
  url?: string;
  /** Exact attribution text required by the license or requested by the source. */
  attribution: string;
  /** Where the license was confirmed (the source's own repository or site). */
  confirmedAt: string;
}

export interface SourceRecord {
  id: string;
  name: string;
  homepage: string;
  /** Pinned version: commit SHA, release tag, module version, or file checksum. */
  version: string;
  files: { url: string; sha256: string; bytes: number }[];
  license: LicenseInfo;
  /** Output folders under data/ that carry this source's license. */
  outputs: string[];
  notes?: string;
}

export function ensureDir(dir: string) {
  mkdirSync(dir, { recursive: true });
}

export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (d) => hash.update(d))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

/**
 * Downloads `url` to .cache/sources/<sub>/<name> unless it is already there. Returns the local
 * path and checksum. When `expectSha256` is given and differs, the run fails so a changed
 * upstream file is never converted silently.
 */
export async function download(
  url: string,
  sub: string,
  name: string,
  expectSha256?: string,
): Promise<{ path: string; sha256: string; bytes: number }> {
  const path = join(CACHE, sub, name);
  if (!existsSync(path)) {
    ensureDir(dirname(path));
    const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'OpenBerea data pipeline' } });
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  const sha256 = await sha256File(path);
  if (expectSha256 && sha256 !== expectSha256) {
    throw new Error(`Checksum mismatch for ${url}\n  expected ${expectSha256}\n  got      ${sha256}`);
  }
  return { path, sha256, bytes: statSync(path).size };
}

const written = { files: 0, bytes: 0 };

/** Writes compact JSON under public/data/. `rel` is relative to the data root, e.g. "kjv/JHN/3.json". */
export function writeData(rel: string, value: unknown) {
  const path = join(OUT, rel);
  ensureDir(dirname(path));
  const text = JSON.stringify(value);
  writeFileSync(path, text);
  written.files++;
  written.bytes += Buffer.byteLength(text);
}

export function writeText(rel: string, text: string) {
  const path = join(OUT, rel);
  ensureDir(dirname(path));
  writeFileSync(path, text);
}

export function writtenStats() {
  return { ...written };
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function readData<T>(rel: string): T {
  return readJson<T>(join(OUT, rel));
}

export function relToRoot(path: string) {
  return relative(ROOT, path);
}

/** Writes LICENSE.txt into each output folder of a source and records the source for the manifest. */
export function recordSource(source: SourceRecord) {
  for (const folder of source.outputs) {
    const lines = [
      `${source.name}`,
      ``,
      `Source: ${source.homepage}`,
      `Version: ${source.version}`,
      `License: ${source.license.name}${source.license.url ? ` (${source.license.url})` : ''}`,
      `Attribution: ${source.license.attribution}`,
      `License confirmed at: ${source.license.confirmedAt}`,
      ``,
      `The files in this folder were converted by the OpenBerea data pipeline (scripts/pipeline).`,
      `They keep the license above, which is separate from the MIT license of the OpenBerea code.`,
      source.license.id.includes('SA')
        ? `Share-alike: adaptations of these files must be shared under the same license.`
        : '',
    ];
    writeText(join(folder, 'LICENSE.txt'), lines.filter((l, i) => l !== '' || i < lines.length - 1).join('\n') + '\n');
  }
  const path = join(OUT, '.sources', `${source.id}.json`);
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(source, null, 2));
}

export function log(stage: string, message: string) {
  console.log(`[${stage}] ${message}`);
}
