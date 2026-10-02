// STEPBible morphology code expansions: TEHMC (Hebrew/Aramaic) and TEGMC (Greek).
// Two sections per file: brief lexical codes ("H:N-M", used by the lexicons) and full codes
// (records separated by "$" lines: CODE<TAB>key=value parsing, then label, explanation, example).
import type { MorphEntry } from '../../../src/lib/data/types';

export interface MorphTables {
  /** Full codes keyed exactly as splitMorph() produces them ("HNcmpa", "V-AAI-3S"). */
  full: Record<string, MorphEntry>;
  /** Brief lexical codes ("H:N-M", "N:N-M-P", "Ps3m") → English meaning. */
  brief: Record<string, string>;
}

/** Removes one pair of wrapping quotes when the text has no other quotes. */
function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"') && !t.slice(1, -1).includes('"')) return t.slice(1, -1).trim();
  return t;
}

/** Collapses runs of spaces and stray control characters (TEGMC has a form feed). */
function clean(s: string): string {
  return s.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseMorphFile(lines: string[]): MorphTables {
  const full: Record<string, MorphEntry> = {};
  const brief: Record<string, string> = {};
  const fullStart = lines.findIndex((l) => l.startsWith('FULL MORPHOLOGY CODES'));
  if (fullStart < 0) throw new Error('Morphology file: no FULL MORPHOLOGY CODES section');

  // Brief codes: from the "Code<TAB>Example in English<TAB>Meaning" header to the full section.
  const briefHeader = lines.findIndex((l) => /^Code\tExample in English\tMeaning/.test(l));
  if (briefHeader < 0 || briefHeader > fullStart) throw new Error('Morphology file: no brief code table');
  for (const line of lines.slice(briefHeader + 1, fullStart)) {
    if (!line.trim() || line.startsWith('=')) continue;
    const f = line.split('\t');
    if (f.length < 3 || !f[0].trim() || !f[2].trim()) continue;
    brief[f[0].trim()] = clean(f[2]);
  }

  // Full records: blocks between "$" lines. Only the first four lines of a block are the record.
  let block: string[] = [];
  const flush = () => {
    if (block.length >= 4) {
      const head = block[0].split('\t');
      const code = head[0].trim();
      const label = unquote(clean(block[1]));
      if (code && /^[A-Za-z]/.test(code) && head[1]?.includes('=') && label) {
        const entry: MorphEntry = { p: label };
        const e = unquote(clean(block[2]));
        if (e) entry.e = e;
        const x = clean(block[3]);
        if (x) entry.x = x;
        if (!full[code]) full[code] = entry;
      }
    }
    block = [];
  };
  for (const line of lines.slice(fullStart)) {
    if (line.trim() === '$') {
      flush();
      continue;
    }
    if (!block.length && !line.trim()) continue;
    block.push(line);
  }
  flush();
  return { full, brief };
}

/**
 * Decodes a lexicon brief code ("H:N-M" → "Hebrew Noun (Masculine)"), including "A / B"
 * alternatives and "A + B" combinations. Tables are tried in order. Aramaic codes without their own
 * row use the Hebrew description ("A:N-M" → "Aramaic Noun (Masculine)").
 */
export function decodeBrief(code: string, ...tables: Record<string, string>[]): string | undefined {
  const c = code.trim().replace(/\s+/g, ' ');
  if (!c) return undefined;
  for (const candidate of [c, c.replace(/\s*\/\s*/g, ' / ')]) for (const t of tables) if (t[candidate]) return t[candidate];
  if (/^A:[^/+]*$/.test(c)) {
    const h = decodeBrief(`H:${c.slice(2)}`, ...tables);
    if (h) return h.replace(/\bHebrew\b/g, 'Aramaic');
  }
  for (const [sep, join] of [
    [/\s+\/\s+|\/\s+|\s+\//, ' OR '],
    [/\s*\+\s*/, ' + '],
  ] as const) {
    const parts = c.split(sep);
    if (parts.length > 1) {
      const decoded = parts.map((p) => decodeBrief(p, ...tables));
      if (decoded.every(Boolean)) return decoded.join(join);
    }
  }
  return undefined;
}
