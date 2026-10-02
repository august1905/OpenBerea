// Data contracts between the pipeline (scripts/pipeline) and the app. Every file under /data/ has one
// of these shapes. Paths are relative to /data/. Keep field names short: these files are cached offline.

import type { BookCode } from '../bible/books';

// ---------------------------------------------------------------------------------------------
// Rich text used by lexicons, commentaries, dictionaries, and profiles.

/** Inline run. A plain string is ordinary text. */
export type Inline =
  | string
  | {
      t: string;
      /** italic */
      i?: 1;
      /** bold */
      b?: 1;
      /** superscript */
      sup?: 1;
      /** Scripture link, compact ref ("JHN.3.16", "ROM.8.28-30"). Source-first: every ref is a link. */
      ref?: string;
      /** Strong's link ("G25", "H430"). */
      s?: string;
      /** Original-language text, for font choice and direction. */
      l?: 'hbo' | 'grc';
      /** External link (only for sources that themselves link out). */
      href?: string;
    };

export interface Block {
  /** p: paragraph, h: heading, li: list item, q: block quote */
  k: 'p' | 'h' | 'li' | 'q';
  c: Inline[];
  /** List nesting depth for li (0 = top). */
  d?: number;
}

// ---------------------------------------------------------------------------------------------
// Bible texts: kjv/{BOOK}/{ch}.json and asv/{BOOK}/{ch}.json

export type TranslationId = 'kjv' | 'asv';

export type Seg =
  | string
  | {
      t: string;
      /** Strong's numbers, base form without leading zeros: ["G25"], ["H430"] (KJV only). */
      s?: string[];
      /** Morphology codes as given by the source (KJV NT uses Robinson codes). */
      m?: string[];
      /** Words of Christ (red letter). */
      w?: 1;
      /** Words added by the translators (italic in the KJV). */
      a?: 1;
      /** Divine name printed in small capitals (LORD). */
      dn?: 1;
    };

export interface Verse {
  n: number;
  s: Seg[];
  /** This verse begins a paragraph. */
  p?: 1;
}

export interface ChapterText {
  b: BookCode;
  c: number;
  tr: TranslationId;
  /** Heading before verse 1, e.g. a Psalm superscription. */
  title?: Seg[];
  v: Verse[];
}

/** search/{kjv|asv}.json: plain verse text in canonical KJV-versification order (31,102 entries). */
export type SearchCorpus = string[];

// ---------------------------------------------------------------------------------------------
// Original languages (STEPBible TAHOT/TAGNT): stepbible/orig/{BOOK}/{ch}.json, KJV verse numbers.

export interface OrigMorpheme {
  /** Text of this part (prefix, stem, or suffix), pointed. */
  t: string;
  /** Strong's number (base form, e.g. "H9003" for the prefix "in"). */
  s: string;
  /** Morphology code for this part. */
  m?: string;
  /** Gloss for this part. */
  g?: string;
}

export interface OrigWord {
  /** Surface text (pointed Hebrew/Aramaic or accented Greek), morpheme separators removed. */
  t: string;
  /** Transliteration. */
  x: string;
  /** English gloss. */
  g: string;
  /** Main Strong's number (the root/stem), base form: "H430", "G25". */
  s: string;
  /** STEPBible extended (disambiguated) Strong's id for the brief lexicon: "H0430G", "G0025". */
  e?: string;
  /** Full morphology code as given by STEPBible ("HR/Ncfsa", "V-AAI-3S"). */
  m: string;
  /** Morphemes, when the word has prefixes or suffixes (Hebrew). */
  p?: OrigMorpheme[];
  /** Editions that contain this word, when not all do (NT only), e.g. "Treg+TR+Byz". */
  ed?: string;
  /** Proper-name id from TIPNR when the word names a person or place, e.g. "Abraham@Gen.11.26". */
  pn?: string;
}

export interface OrigVerse {
  /** KJV verse number; 0 is a Psalm title. */
  n: number;
  w: OrigWord[];
  /** Verse number in the Hebrew/Greek edition when it differs, e.g. "3:19". */
  src?: string;
}

export interface OrigChapter {
  b: BookCode;
  c: number;
  lang: 'hbo' | 'grc';
  v: OrigVerse[];
}

/** stepbible/variants/{BOOK}/{ch}.json: Greek edition differences per KJV verse. */
export interface VariantUnit {
  /** Index of the word within the verse's OrigWord list. */
  w: number;
  /** Greek text of the reading. */
  t: string;
  /** English gloss of the reading. */
  g: string;
  /** Editions that have this reading, e.g. "TR+Byz". */
  ed: string;
  /** presence: the word appears only in some editions; alt: an alternative reading of the word. */
  k: 'presence' | 'alt';
  /** Strong's and morphology of an alternative reading. */
  s?: string;
  m?: string;
}

export interface VariantChapter {
  b: BookCode;
  c: number;
  v: Record<string, VariantUnit[]>;
}

// ---------------------------------------------------------------------------------------------
// Lexicons. Buckets: bucket = floor(n / 100) where n is the Strong's number, so G25 → G/0.json.

/** strongs/{H|G}/{bucket}.json keyed by "G25". Public domain. */
export interface StrongsEntry {
  id: string;
  lemma: string;
  /** Transliteration. */
  x: string;
  /** Phonetic pronunciation, e.g. "ag-ap-ah'-o". */
  pron?: string;
  /** Derivation, with links to root words. */
  deriv?: Inline[];
  /** Root Strong's numbers mentioned in the derivation. */
  roots?: string[];
  def: Block[];
  /** Strong's summary of KJV renderings, e.g. "(be-)love(-ed)". */
  kjv?: string;
}

/** strongs/index.json: [id, lemma, transliteration, short gloss] for search and labels. */
export type LexIndex = [string, string, string, string][];

/** stepbible/lex/{H|G}/{bucket}.json keyed by extended id ("G0025", "H0430G"). */
export interface StepLexEntry {
  id: string;
  /** Base Strong's: "G25". */
  base: string;
  lemma: string;
  x: string;
  /** Part of speech / morphology summary. */
  pos?: string;
  /** Brief gloss. */
  g: string;
  /** Definition (TBESG only; TBESH definitions are not licensed for reuse). */
  d?: Block[];
  /** Definition source: Abbott-Smith, Middle Liddell, or STEPBible. */
  src?: 'AS' | 'ML' | 'STEP';
}

/** thayer/G/{bucket}.json, bdb/H/{bucket}.json, gesenius/H/{bucket}.json keyed by "G25"/"H430". */
export interface LexiconEntry {
  id: string;
  /** Headword as printed in the source, when it has one. */
  head?: string;
  blocks: Block[];
}

// ---------------------------------------------------------------------------------------------
// Concordance and usage: stepbible/conc/{H|G}/{bucket}.json keyed by base Strong's "G25".

export interface ConcEntry {
  /** Total occurrences in the Hebrew/Greek text. */
  n: number;
  /** Verse ids (book index × 1e6 + chapter × 1e3 + verse, KJV numbering), ascending, no repeats. */
  v: number[];
  /** KJV renderings and their counts, most frequent first. */
  kjv: [string, number][];
}

/** stepbible/morph/{hbo|grc}.json keyed by a single morphology code ("HNcmpa", "V-AAI-3S"). */
export interface MorphEntry {
  /** Short parsing, e.g. "Noun - common masculine plural absolute". */
  p: string;
  /** Plain-English explanation. */
  e?: string;
  /** Example from the source. */
  x?: string;
}

/** stepbible/names.json: TIPNR proper names keyed by unique name id. */
export interface ProperName {
  id: string;
  name: string;
  kind: 'person' | 'place' | 'other';
  /** Short description of who or what (from TIPNR's significance field). */
  sig?: string;
  /** Theographic person id, when matched. */
  person?: string;
}

// ---------------------------------------------------------------------------------------------
// Cross-references

/** tsk/{BOOK}/{ch}.json: verse number → compact refs. */
export type TskChapter = Record<string, string[]>;

/** openbible-xref/{BOOK}/{ch}.json: verse number → [compact ref, votes], most votes first. */
export type OpenBibleXrefChapter = Record<string, [string, number][]>;

// ---------------------------------------------------------------------------------------------
// Commentaries: comm/{mhc|gill|barnes|jfb}/{BOOK}/{ch}.json

export type CommentaryId = 'mhc' | 'gill' | 'barnes' | 'jfb';

export interface CommentaryChapter {
  b: BookCode;
  c: number;
  id: CommentaryId;
  e: {
    /** Verse range [start, end]; absent for a chapter introduction. */
    v?: [number, number];
    blocks: Block[];
  }[];
}

// ---------------------------------------------------------------------------------------------
// Dictionaries and topical index: dict/{easton|smith|isbe|nave}/index.json and /{bucket}.json

export type DictionaryId = 'easton' | 'smith' | 'isbe' | 'nave';

/** [entry id, title, bucket] */
export type DictIndex = [string, string, number][];

export interface DictEntry {
  id: string;
  title: string;
  blocks: Block[];
}

/** dict/{id}/{bucket}.json */
export type DictBucket = Record<string, DictEntry>;

// ---------------------------------------------------------------------------------------------
// People, events, timelines (Theographic, CC BY-SA 4.0): theographic/…

/** theographic/people/index.json */
export interface PersonSummary {
  id: string;
  name: string;
  /** Disambiguating title, e.g. "Son of Jesse". */
  title?: string;
  g?: 'M' | 'F';
  /** Number of verses that mention the person. */
  n: number;
  /** Bucket file holding the full profile. */
  k: number;
}

/** theographic/people/{bucket}.json keyed by person id. Years: negative = BC (e.g. -1015 = 1015 BC). */
export interface Person {
  id: string;
  name: string;
  title?: string;
  g?: 'M' | 'F';
  birth?: number;
  death?: number;
  father?: string;
  mother?: string;
  siblings?: string[];
  halfSiblings?: string[];
  children?: string[];
  partners?: string[];
  groups?: string[];
  /** Verse ids of every mention, ascending. */
  verses: number[];
  /** Easton's dictionary text for this person, when present. */
  dict?: Block[];
  /** Event ids the person takes part in. */
  events?: string[];
}

/** theographic/timeline/events.json. Years: negative = BC. */
export interface TimelineEvent {
  id: string;
  title: string;
  /** Start year, negative = BC. */
  start: number;
  /** Duration as given by the source ("40Y", "3M", "7D"). */
  dur?: string;
  /** End year when computable. */
  end?: number;
  people?: string[];
  places?: string[];
  refs?: string[];
  part?: string;
}

/** theographic/timeline/rulers.json: kings (and the queen Athaliah) and prophets with dates. */
export interface Ruler {
  person: string;
  name: string;
  group: 'united' | 'judah' | 'israel' | 'prophet';
  start: number;
  end?: number;
  /** Event id the dates come from. */
  event: string;
  refs?: string[];
}

// ---------------------------------------------------------------------------------------------
// Places and maps

/** openbible-geo/places.json. */
export interface Place {
  id: string;
  name: string;
  lon: number;
  lat: number;
  /** settlement, region, mountain, river, … */
  type: string;
  /** Identification confidence 0–1000 (OpenBible.info). */
  score: number;
  /** Number of verses that mention the place. */
  n: number;
}

/** openbible-geo/verses.json: place id → verse ids (KJV numbering). */
export type PlaceVerses = Record<string, number[]>;

/** openbible-geo/chapters/{BOOK}.json: chapter → place ids mentioned in it. */
export type ChapterPlaces = Record<string, string[]>;

/** naturalearth/base.json: pre-projected SVG paths for the base map. */
export interface BaseMap {
  /** [west, south, east, north] in degrees. */
  bbox: [number, number, number, number];
  /** Projected size in map units. */
  width: number;
  height: number;
  /** Equirectangular with longitudes scaled by cos(lat0). */
  lat0: number;
  land: string;
  lakes: string;
  rivers: string;
  seas: { name: string; x: number; y: number }[];
}

// ---------------------------------------------------------------------------------------------
// Gospel harmony: harmony/robertson.json

export type GospelCode = 'MAT' | 'MRK' | 'LUK' | 'JHN';

export interface HarmonySection {
  n: number;
  title: string;
  refs: Partial<Record<GospelCode, string>>;
}

export interface Harmony {
  title: string;
  parts: { title: string; sections: HarmonySection[] }[];
}

// ---------------------------------------------------------------------------------------------
// Audio: librivox/kjv.json

export interface AudioBook {
  /** Main reader(s) of this book's recordings. */
  reader: string;
  /** LibriVox project title. */
  project: string;
  /** LibriVox project page. */
  url: string;
  /** Recordings in order. A file may cover several chapters (from–to, inclusive). */
  files: { src: string; from: number; to: number; reader?: string }[];
}

export type AudioIndex = Partial<Record<BookCode, AudioBook>>;

// ---------------------------------------------------------------------------------------------
// Owner-edited content: content/*.json, copied to data/content/

export interface ResourceItem {
  id: string;
  title: string;
  teacher: 'John Piper' | 'John MacArthur' | 'Paul Washer' | string;
  ministry: string;
  type: 'sermon' | 'article' | 'video' | 'audio' | 'book' | 'tool';
  url: string;
  refs: string[];
  books: BookCode[];
  topics: string[];
  embed: { kind: 'youtube'; id: string } | { kind: 'audio'; src: string } | null;
  verified?: string;
}

export interface StarterSet {
  id: string;
  title: string;
  /** Compact ref of the passage. */
  ref: string;
  note?: string;
}

// ---------------------------------------------------------------------------------------------
// Manifest: manifest.json

export interface DataManifest {
  /** Hash of all data files; changes when any data changes. */
  version: string;
  generated: string;
  sources: {
    id: string;
    name: string;
    homepage: string;
    version: string;
    license: { id: string; name: string; url?: string; attribution: string };
    outputs: string[];
  }[];
}
