// Grammar helper: turns STEPBible morphology codes into plain-English parsing using the tables in
// stepbible/morph/hbo.json and stepbible/morph/grc.json (from TEHMC and TEGMC). Pure TypeScript, no
// React or platform APIs, so the pipeline and the app share it.
import type { MorphEntry } from './types';

export type MorphLang = 'hbo' | 'grc';

/** Data file holding the code table for a language. */
export function morphTablePath(lang: MorphLang): string {
  return `stepbible/morph/${lang}.json`;
}

/**
 * Splits a full morphology code into the single codes used as table keys.
 *
 * Hebrew/Aramaic (TAHOT): the first character is the language (H or A). The rest is split on "/"
 * and each part gets that language letter: "HR/Ncfsa" → ["HR", "HNcfsa"], "HC/Td/Ncfsa" →
 * ["HC", "HTd", "HNcfsa"]. Empty parts ("HVqp3ms//Ncmsa", two joined words) are skipped. A code that
 * is already a single key ("HNcfsa") comes back unchanged.
 *
 * Greek (TAGNT): crasis forms join parts with " + ": "P-1NS + CONJ" → ["P-1NS", "CONJ"]. A part may
 * still carry its Strong's number as in the source column ("G1473=P-1NS + G2532=CONJ"); only the
 * code after "=" is kept. "V-AAI-3S" → ["V-AAI-3S"].
 */
export function splitMorph(code: string, lang: MorphLang): string[] {
  const c = code.trim();
  if (!c) return [];
  if (lang === 'hbo') {
    const language = c[0];
    return c
      .slice(1)
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => language + s);
  }
  return c
    .split(/\s+\+\s+/)
    .map((part) => {
      const i = part.lastIndexOf('=');
      return (i >= 0 ? part.slice(i + 1) : part).trim();
    })
    .filter(Boolean);
}

export interface MorphPart {
  /** Single code looked up in the table, e.g. "HNcfsa". */
  key: string;
  /** Plain-English parsing, e.g. "Noun (Singular Feminine, Absolute)". The key itself when unknown. */
  parsing: string;
  /** What the form means in a sentence, when the table has it. */
  explanation?: string;
  /** Example translation from the source, when the table has it. */
  example?: string;
  /** False when the code is not in the table. */
  known: boolean;
}

/** Plain-English parsing for each part of a full code ("HR/Ncfsa" → preposition + noun). */
export function describeMorph(code: string, lang: MorphLang, table: Record<string, MorphEntry>): MorphPart[] {
  return splitMorph(code, lang).map((key) => {
    const entry = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
    if (!entry) return { key, parsing: key, known: false };
    const part: MorphPart = { key, parsing: entry.p, known: true };
    if (entry.e) part.explanation = entry.e;
    if (entry.x) part.example = entry.x;
    return part;
  });
}
