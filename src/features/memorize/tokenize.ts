// Words versus punctuation in KJV and ASV verse text, and the normalized forms used to check answers.
//
// A word is a run of letters that may contain apostrophes ("name’s", "Lord's") and hyphens or the
// KJV's en dashes in names ("Beth–el", "God-ward"), and may end in a possessive apostrophe ("sons’").
// Everything else (commas, colons, em dashes, brackets, parentheses) is punctuation, attached to the
// word beside it for display and ignored when checking.

export interface Word {
  /** Position among the words being practiced (0-based). */
  i: number;
  /** The word as printed: "name’s", "Beth–el", "lovingkindness". */
  text: string;
  /** Punctuation printed right before the word: "(" or "[". */
  pre: string;
  /** Punctuation printed right after the word: ",", ";", "—". */
  post: string;
  /** Lower case with apostrophes, hyphens, and accents removed: "names", "bethel". */
  norm: string;
  /** First letter of the normalized word: "n". */
  first: string;
  /** No space before this word (it follows a dash, as in "ever—and"). */
  glue?: true;
  /** Character offset of the word in its verse text. */
  at: number;
}

const WORD = /[\p{L}\p{M}]+(?:['’‘\-‐‑–][\p{L}\p{M}]+)*['’]?/gu;

/** Lower case, no accents, no apostrophes, hyphens, spaces, or other punctuation. */
export function normalizeWord(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Splits verse text into words, keeping punctuation attached to the neighbouring word. */
export function tokenize(text: string, startIndex = 0): Word[] {
  const words: Word[] = [];
  let last = 0;
  let pending = '';
  for (const m of text.matchAll(WORD)) {
    const at = m.index ?? 0;
    const gap = text.slice(last, at);
    let pre = '';
    let glue = false;
    if (words.length) {
      const prev = words[words.length - 1];
      const ws = gap.search(/\s/);
      if (ws < 0) {
        prev.post += gap;
        glue = gap.length > 0;
      } else {
        prev.post += gap.slice(0, ws);
        pre = gap.slice(ws).replace(/\s+/g, '');
      }
    } else {
      pre = gap.replace(/\s+/g, '');
    }
    pre = pending + pre;
    pending = '';
    const norm = normalizeWord(m[0]);
    if (!norm) {
      pending = pre + m[0];
      last = at + m[0].length;
      continue;
    }
    const word: Word = { i: startIndex + words.length, text: m[0], pre, post: '', norm, first: norm[0], at };
    if (glue) word.glue = true;
    words.push(word);
    last = at + m[0].length;
  }
  if (words.length) words[words.length - 1].post += text.slice(last).replace(/\s+$/, '');
  return words;
}

/** The plain words of typed text, for comparing answers. */
export function wordsOf(text: string): string[] {
  return tokenize(text).map((w) => w.text);
}

/** True for a typed key that can be checked against a first letter (letters only). */
export function isLetter(key: string): boolean {
  return /\p{L}/u.test(key);
}
