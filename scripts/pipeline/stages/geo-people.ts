// People, timelines, places, maps and cross-references:
//   versemap        STEPBible TVTMS → ESV-to-KJV verse mapping (no output; used by the stages below)
//   theographic     Theographic Bible Metadata → theographic/people, theographic/timeline (CC BY-SA 4.0)
//   basemap         Natural Earth 10m → naturalearth/base.json (public domain)
//   places          OpenBible.info Bible Geocoding Data → openbible-geo/ (CC BY 4.0)
//   openbible-xref  OpenBible.info cross-references → openbible-xref/{BOOK}/{ch}.json (CC BY 4.0)
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { BOOKS, type BookCode, bookInfo } from '../../../src/lib/bible/books';
import { fromCompact, fromVerseId, verseId } from '../../../src/lib/bible/refs';
import type {
  BaseMap,
  ChapterPlaces,
  OpenBibleXrefChapter,
  Person,
  PersonSummary,
  Place,
  PlaceVerses,
  Ruler,
  TimelineEvent,
} from '../../../src/lib/data/types';
import { download, log, OUT, readJson, recordSource, writeData } from '../lib/context';
import { buildBaseMap, type GeoCollection } from '../lib/geo-basemap';
import {
  bestLocation,
  type ObAncient,
  type ObModern,
  parseXrefLine,
  placeDisplayName,
  placeSlug,
  placeVerseToKjv,
  readJsonl,
  readZipEntry,
  xrefTarget,
} from '../lib/geo-openbible';
import { BASEMAP_PROJECTION, projectLonLat, scaleOf } from '../lib/geo-projection';
import { decodePath, distanceToLine, pointInRings, type Pt, ringArea } from '../lib/geo-shapes';
import {
  compressVerseIds,
  dictToBlocks,
  dropInvalidRefs,
  eventEndYear,
  eventYear,
  matchPlace,
  type PlaceCandidate,
  personTitle,
  personYear,
  slugify,
  theoVerseId,
  type TitleSource,
} from '../lib/geo-theographic';
import { ensureTvtms, isKjvVerse, loadVerseMap, OSIS_BOOKS, TVTMS_COMMIT, TVTMS_URL, type VerseMapper } from '../lib/versemap';
import type { Stage } from '../run';

// ---------------------------------------------------------------------------------------------
// Pins (sha256 of the files in .cache/sources)

const THEO_COMMIT = 'cfb1c485d4da6fb63a69cb3b7f5b0752792f46bc';
const THEO_FILES: Record<string, string> = {
  'people.json': '76041eba0b6f36c36514802fcfa69a068cbf06ef7b57aaec82909f509e3b6fb4',
  'events.json': '59dc86b8ff124813488fa036ffb70ff83127e024aa6ccd326c905d5c5018b5a9',
  'verses.json': '471b7d7648acd4cf5300437acd9d048514f6a5da1f34f4ce2e43ef9eeec0e858',
  'peopleGroups.json': '1cedf112a81ab20dd4debd6ae58a3d55a25c37841b29aa608fa8e21d6efc71a7',
  'places.json': '5a8e929baa4701602e461e66271a0fa6e9f6f6629635053f1a1e4bbcfce06c14',
};

const OB_GEO_COMMIT = '7eb18a5ee62f27b9b93bd6689ea272d76dd23b8f';
const OB_GEO_FILES: Record<string, string> = {
  'data/ancient.jsonl': 'b8187aa4737e8517ccc090f765d2be11da4c548cd2a59d3cdcb62e952cb8c0f2',
  'data/modern.jsonl': 'da731f6e110bac4ea66a9f037a0a31cfb11c4f1efc1206aa9e109092b2c60087',
};

const XREF_URL = 'https://a.openbible.info/data/cross-references.zip';
const XREF_SHA256 = '224f28aae59812b7c0866534133578661fbcbcf04e432e24af8c47044e93782e';

const NE_TAG = 'v5.1.2';
const NE_COMMIT = 'f1890d9f152c896d250a77557a5751a93d494776';
const NE_FILES: Record<string, string> = {
  'ne_10m_land.geojson': '1ac90796408bc6ad6911d69448485d3c4dbf2190370080368a09976e1c9f7416',
  'ne_10m_lakes.geojson': '2d036f53dedec578001c5c30c2959ee7d4eebc1306900fa4367c49929ec8f2d9',
  'ne_10m_rivers_lake_centerlines.geojson': 'bb854a900ecbd3b408df46d5e16e3e0f974ba55993f9d8b5c26e855273c0905a',
  'ne_10m_geography_marine_polys.geojson': '53f865e8ffa966cdd402145c82c5cd14ee7ce974cd0eb9a3f59f03a4cfd2d66c',
};

type Downloaded = Awaited<ReturnType<typeof download>>;
type FileRecord = { url: string; sha256: string; bytes: number };

async function fetchAll(base: string, sub: string, prefix: string, files: Record<string, string>) {
  const paths: Record<string, string> = {};
  const records: FileRecord[] = [];
  for (const [file, sha] of Object.entries(files)) {
    const url = `${base}/${file}`;
    const d: Downloaded = await download(url, sub, `${prefix}${file}`, sha);
    paths[file] = d.path;
    records.push({ url, sha256: d.sha256, bytes: d.bytes });
  }
  return { paths, records };
}

const theoSources = () =>
  fetchAll(`https://raw.githubusercontent.com/robertrouse/theographic-bible-metadata/${THEO_COMMIT}/json`, 'theographic', 'json/', THEO_FILES);
const obGeoSources = () =>
  fetchAll(`https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/${OB_GEO_COMMIT}`, 'openbible-geo', 'repo/', OB_GEO_FILES);
const neSources = () =>
  fetchAll(`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_COMMIT}/geojson`, 'naturalearth', 'geojson/', NE_FILES);

// ---------------------------------------------------------------------------------------------
// Small utilities

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`Verification failed: ${message}`);
}

function resetFolder(rel: string) {
  rmSync(join(OUT, rel), { recursive: true, force: true });
}

function folderStats(rel: string): string {
  let files = 0;
  let bytes = 0;
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else {
        files++;
        bytes += statSync(p).size;
      }
    }
  };
  walk(join(OUT, rel));
  return `${rel}/: ${files} files, ${(bytes / 1e6).toFixed(2)} MB`;
}

const validVerseId = (id: number) => {
  const book = Math.floor(id / 1e6);
  if (book < 1 || book > 66) return false;
  const v = fromVerseId(id);
  return isKjvVerse(v.book, v.chapter, v.verse);
};

function validCompact(ref: string): boolean {
  const r = fromCompact(ref);
  if (!r || r.chapter < 1 || r.chapter > bookInfo(r.book).chapters) return false;
  if (r.verse === undefined) return true;
  if (!isKjvVerse(r.book, r.chapter, r.verse)) return false;
  const endCh = r.endChapter ?? r.chapter;
  if (r.endVerse === undefined) return true;
  if (!isKjvVerse(r.book, endCh, r.endVerse)) return false;
  return endCh > r.chapter || r.endVerse > r.verse;
}

const blockRefs = (blocks: { c: (string | { ref?: string })[] }[]) =>
  blocks.flatMap((b) => b.c.flatMap((c) => (typeof c !== 'string' && c.ref ? [c.ref] : [])));

// ---------------------------------------------------------------------------------------------
// OpenBible places (shared by "places" and the event-place matching in "theographic")

interface ExtractedPlace {
  place: Place;
  verses: number[];
  /** Lower-case translation spellings, for matching Theographic places. */
  names: Set<string>;
  custom: boolean;
  osmCoords: boolean;
  /** Source score when it was outside 0–1000. */
  clamped?: number;
}

interface PlaceExtraction {
  places: ExtractedPlace[];
  skipped: { id: string; reason: string }[];
  ancientCount: number;
  slugMismatches: string[];
  verseLinks: number;
  viaAlternate: number;
  renumbered: number;
  invalidVerses: string[];
  sourceVerseCounts: Map<string, number>;
}

function extractPlaces(paths: Record<string, string>, mapper: VerseMapper): PlaceExtraction {
  const ancient = readJsonl<ObAncient>(paths['data/ancient.jsonl']);
  const modernList = readJsonl<ObModern & { coordinates_source?: { type?: string } }>(paths['data/modern.jsonl']);
  const modern = new Map(modernList.map((m) => [m.id, m]));
  const out: PlaceExtraction = {
    places: [],
    skipped: [],
    ancientCount: ancient.length,
    slugMismatches: [],
    verseLinks: 0,
    viaAlternate: 0,
    renumbered: 0,
    invalidVerses: [],
    sourceVerseCounts: new Map(),
  };
  const seen = new Set<string>();
  for (const a of ancient) {
    const id = placeSlug(a.friendly_id);
    if (a.url_slug && a.url_slug !== id) out.slugMismatches.push(`${a.friendly_id}: ${a.url_slug} vs ${id}`);
    if (!id || seen.has(id)) throw new Error(`Place id "${id}" for ${a.friendly_id} is empty or duplicate`);
    seen.add(id);
    out.sourceVerseCounts.set(id, a.verses?.length ?? 0);
    const loc = bestLocation(a, modern);
    if (!loc.ok) {
      out.skipped.push({ id, reason: loc.reason });
      continue;
    }
    const verses = new Set<number>();
    for (const v of a.verses ?? []) {
      out.verseLinks++;
      const { verse, viaAlternate } = placeVerseToKjv(v, mapper);
      if (viaAlternate) out.viaAlternate++;
      if (!verse) {
        out.invalidVerses.push(`${id} ${v.osis}`);
        continue;
      }
      if (verse.rule) out.renumbered++;
      verses.add(verseId(verse.book, verse.chapter, verse.verse));
    }
    const sorted = [...verses].sort((x, y) => x - y);
    const res = a.identifications[0].resolutions?.find((r) => r.lonlat);
    const m = res?.modern_basis_id ? modern.get(res.modern_basis_id) : undefined;
    out.places.push({
      place: { id, name: placeDisplayName(a.friendly_id), lon: loc.lon, lat: loc.lat, type: loc.type, score: loc.score, n: sorted.length },
      verses: sorted,
      names: new Set(Object.keys(a.translation_name_counts ?? {}).map((n) => n.toLowerCase())),
      custom: loc.custom,
      osmCoords: m?.coordinates_source?.type === 'osm',
      clamped: loc.clamped,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Stage: versemap

const versemap: Stage = {
  id: 'versemap',
  description: 'STEPBible TVTMS: ESV-style English versification → KJV mapping (no output)',
  async run() {
    const file = await ensureTvtms();
    const text = readFileSync(file.path, 'utf8');
    assert(text.includes('In the OT, all English versions agree with KJV'), 'TVTMS no longer states that the English OT agrees with KJV');

    const esv = loadVerseMap();
    const nrsv = loadVerseMap({ scheme: 'nrsv' });
    const ordered = loadVerseMap({ contentOrder: true });
    const keys = (m: VerseMapper, kind: string) => m.rules.filter((r) => r.kind === kind).map((r) => `${r.from}>${r.to}`).sort();
    assert(JSON.stringify(keys(esv, 'table')) === JSON.stringify(['3JN.1.15>3JN.1.14']), `ESV renumbering is ${keys(esv, 'table')}`);
    assert(
      JSON.stringify(keys(nrsv, 'table')) === JSON.stringify(['2CO.13.13>2CO.13.14', '3JN.1.15>3JN.1.14', 'REV.12.18>REV.13.1']),
      `NRSV renumbering is ${keys(nrsv, 'table')}`,
    );
    assert(JSON.stringify(keys(ordered, 'reorder')) === JSON.stringify(['PHP.1.16>PHP.1.17', 'PHP.1.17>PHP.1.16']), 'Phil 1:16/17 swap');
    assert(keys(esv, 'reorder').length === 0, 'reorder rules must be opt-in');

    const expect: [VerseMapper, string, string | null][] = [
      [esv, '3John.1.15', '3JN.1.14'],
      [esv, '3John.1.14', '3JN.1.14'],
      [esv, 'Rev.12.17', 'REV.12.17'],
      [esv, 'Rev.13.1', 'REV.13.1'],
      [esv, 'Rev.12.18', 'REV.13.1'],
      [esv, 'Acts.19.40', 'ACT.19.40'],
      [esv, 'Acts.19.41', 'ACT.19.41'],
      [esv, '2Cor.13.12', '2CO.13.12'],
      [esv, '2Cor.13.13', '2CO.13.13'],
      [esv, '2Cor.13.14', '2CO.13.14'],
      [nrsv, '2Cor.13.13', '2CO.13.14'],
      [nrsv, 'Rev.12.18', 'REV.13.1'],
      [esv, 'Rom.16.24', 'ROM.16.24'],
      [esv, 'Rom.16.25', 'ROM.16.25'],
      [esv, 'Rom.16.27', 'ROM.16.27'],
      [esv, 'Rom.14.24', 'ROM.16.25'],
      [esv, 'Rom.14.26', 'ROM.16.27'],
      [esv, 'Phil.1.16', 'PHP.1.16'],
      [ordered, 'Phil.1.16', 'PHP.1.17'],
      [esv, 'Mal.4.6', 'MAL.4.6'],
      [esv, 'Joel.2.32', 'JOL.2.32'],
      [esv, 'Ps.51.19', 'PSA.51.19'],
      [esv, '3John.1.16', null],
      [esv, 'Mal.4.7', null],
      [esv, 'Gen.0.1', null],
    ];
    for (const [m, osis, want] of expect) {
      const r = m.mapOsis(osis);
      const got = r ? `${r.book}.${r.chapter}.${r.verse}` : null;
      assert(got === want, `${m.scheme} ${osis} → ${got}, expected ${want}`);
    }
    for (const r of [...esv.rules, ...nrsv.rules, ...ordered.rules]) {
      const [b, c, v] = r.to.split('.');
      assert(isKjvVerse(b as BookCode, Number(c), Number(v)), `rule target ${r.to} is not a KJV verse`);
    }
    log('versemap', `ESV → KJV: ${keys(esv, 'table').join(', ')}; Expanded-data fallbacks for non-KJV verses: ${keys(esv, 'fallback').join(', ')}`);
    log('versemap', `NRSV → KJV: ${keys(nrsv, 'table').join(', ')}; text-order swap (opt-in): ${keys(ordered, 'reorder').join(', ')}`);

    recordSource({
      id: 'stepbible-tvtms',
      name: 'STEPBible TVTMS (Translators Versification Traditions with Methodology for Standardisation)',
      homepage: 'https://github.com/STEPBible/STEPBible-Data',
      version: `commit ${TVTMS_COMMIT}`,
      files: [{ url: TVTMS_URL, sha256: file.sha256, bytes: file.bytes }],
      license: {
        id: 'CC-BY-4.0',
        name: 'Creative Commons Attribution 4.0 International',
        url: 'https://creativecommons.org/licenses/by/4.0/',
        attribution:
          'Versification mapping from STEP Bible (https://www.STEPBible.org), TVTMS, created by STEPBible.org based on work at Tyndale House Cambridge, CC BY 4.0. Source: https://github.com/STEPBible/STEPBible-Data.',
        confirmedAt:
          'TVTMS file header ("Data created by www.STEPBible.org based on work at Tyndale House Cambridge (CC BY 4.0)") and README.md ("STEPBible Data Repository CC BY 4.0") at the pinned commit',
      },
      outputs: [],
      notes:
        'Used at build time only: maps OpenBible.info refs (ESV-style numbering) to KJV numbering for openbible-geo/ and openbible-xref/. No TVTMS data is shipped.',
    });
  },
};

// ---------------------------------------------------------------------------------------------
// Stage: theographic

interface AirRecord<F> {
  id: string;
  fields: F;
}

interface TheoPerson {
  personLookup: string;
  personID: number;
  name: string;
  gender?: string;
  displayTitle?: string;
  alsoCalled?: string;
  birthYear?: string;
  deathYear?: string;
  father?: string[];
  mother?: string[];
  siblings?: string[];
  halfSiblingsSameFather?: string[];
  halfSiblingsSameMother?: string[];
  children?: string[];
  partners?: string[];
  memberOf?: string[];
  verses?: string[];
  verseCount?: number;
  dictText?: string[];
  timeline?: string[];
  'Disambiguation (temp)'?: string;
}

interface TheoEvent {
  title: string;
  eventID: number;
  startDate: string;
  duration: string;
  participants?: string[];
  locations?: string[];
  verses?: string[];
  partOf?: string[];
  sortKey: number;
}

interface TheoPlace {
  placeLookup: string;
  kjvName?: string;
  esvName?: string;
  displayTitle?: string;
  verses?: string[];
}

const RULER_GROUPS: Record<string, Ruler['group']> = {
  'United Kingdom': 'united',
  'Southern Kingdom (Judah)': 'judah',
  'Northern Kingdom (Israel)': 'israel',
};

/** Prophets with no "Prophecies of" event in Theographic (from the research notes), reported as a gap. */
const NON_WRITING_PROPHETS = ['Moses', 'Deborah', 'Samuel', 'Nathan', 'Gad', 'Ahijah', 'Micaiah', 'Huldah', 'Oded', 'John the Baptist', 'Agabus'];

const theographic: Stage = {
  id: 'theographic',
  deps: ['versemap'],
  description: 'Theographic Bible Metadata → people, family links, events and rulers (CC BY-SA 4.0)',
  async run() {
    resetFolder('theographic');
    const theo = await theoSources();
    const geo = await obGeoSources();
    await ensureTvtms();
    const mapper = loadVerseMap();

    // Verse record id → verse id.
    const verseOf = new Map<string, number>();
    {
      const verses = readJson<AirRecord<{ osisRef: string; verseID: string }>[]>(theo.paths['verses.json']);
      assert(verses.length === 31102, `verses.json has ${verses.length} verses`);
      for (const v of verses) {
        const id = theoVerseId(v.fields.verseID);
        const [b, c, n] = v.fields.osisRef.split('.');
        const book = OSIS_BOOKS[b];
        assert(book && verseId(book, Number(c), Number(n)) === id, `verseID ${v.fields.verseID} disagrees with ${v.fields.osisRef}`);
        assert(validVerseId(id), `${v.fields.osisRef} is not a KJV verse`);
        verseOf.set(v.id, id);
      }
    }
    const versesOf = (recs: string[] | undefined) => {
      const ids = (recs ?? []).map((r) => {
        const id = verseOf.get(r);
        assert(id !== undefined, `unknown verse record ${r}`);
        return id;
      });
      return [...new Set(ids)].sort((a, b) => a - b);
    };

    const people = readJson<AirRecord<TheoPerson>[]>(theo.paths['people.json']);
    const events = readJson<AirRecord<TheoEvent>[]>(theo.paths['events.json']);
    const groups = readJson<AirRecord<{ groupName: string }>[]>(theo.paths['peopleGroups.json']);
    const tplaces = readJson<AirRecord<TheoPlace>[]>(theo.paths['places.json']);
    const personRec = new Map(people.map((p) => [p.id, p.fields]));
    const eventRec = new Map(events.map((e) => [e.id, e.fields]));
    const groupName = new Map(groups.map((g) => [g.id, g.fields.groupName]));

    // Ids.
    const pid = (rec: string) => {
      const p = personRec.get(rec);
      assert(p, `unknown person record ${rec}`);
      return p.personLookup;
    };
    const eventId = new Map<string, string>();
    {
      const used = new Set<string>();
      for (const e of events) {
        let id = slugify(e.fields.title);
        if (used.has(id)) id = `${id}-${e.fields.eventID}`;
        assert(id && !used.has(id), `event id ${id}`);
        used.add(id);
        eventId.set(e.id, id);
      }
    }
    const eid = (rec: string) => {
      const id = eventId.get(rec);
      assert(id, `unknown event record ${rec}`);
      return id;
    };

    // Event places → OpenBible place ids (plottable places only, so every id resolves on the map).
    const extraction = extractPlaces(geo.paths, mapper);
    const candidates: PlaceCandidate[] = extraction.places.map((p) => ({
      id: p.place.id,
      name: p.place.name.toLowerCase(),
      names: p.names,
      verses: new Set(p.verses),
    }));
    const placeIdOf = new Map<string, string | null>();
    const unmatchedPlaces: string[] = [];
    for (const p of tplaces) {
      const f = p.fields;
      const names = [f.kjvName, f.esvName, f.displayTitle?.replace(/\s*\(.*\)$/, '')].filter((n): n is string => !!n);
      const m = matchPlace(names, versesOf(f.verses), candidates);
      placeIdOf.set(p.id, m?.id ?? null);
    }

    // Events.
    const sortedEvents = [...events].sort((a, b) => a.fields.sortKey - b.fields.sortKey);
    const timeline: TimelineEvent[] = [];
    for (const e of sortedEvents) {
      const f = e.fields;
      const start = eventYear(f.startDate);
      const end = eventEndYear(f.startDate, f.duration);
      const ev: TimelineEvent = { id: eid(e.id), title: f.title, start };
      if (f.duration) ev.dur = f.duration;
      if (end !== start) ev.end = end;
      const ppl = (f.participants ?? []).map(pid);
      if (ppl.length) ev.people = ppl;
      const places: string[] = [];
      for (const l of f.locations ?? []) {
        const id = placeIdOf.get(l);
        if (id) {
          if (!places.includes(id)) places.push(id);
        } else unmatchedPlaces.push(`${f.title}: ${tplaces.find((t) => t.id === l)?.fields.placeLookup ?? l}`);
      }
      if (places.length) ev.places = places;
      const refs = compressVerseIds(versesOf(f.verses));
      if (refs.length) ev.refs = refs;
      if (f.partOf?.[0]) ev.part = eid(f.partOf[0]);
      timeline.push(ev);
    }
    const timelineById = new Map(timeline.map((t) => [t.id, t]));

    // Rulers (kings and prophets) from "Reign of …" and "Prophecies of …" events; start/duration only.
    const kingdoms = events.filter((e) => RULER_GROUPS[e.fields.title]);
    const rulers: Ruler[] = [];
    const rulerNotes: string[] = [];
    for (const e of sortedEvents) {
      const f = e.fields;
      const reign = /^Reign of (.+)$/.exec(f.title);
      const prophecy = /^Prophecies of (.+)$/.exec(f.title);
      if (!reign && !prophecy) continue;
      assert(f.participants?.length, `${f.title} has no participant`);
      let group: Ruler['group'] | undefined;
      if (prophecy) group = 'prophet';
      else if (f.partOf?.length) group = RULER_GROUPS[eventRec.get(f.partOf[0])!.title];
      else {
        // No partOf (only Saul): use the kingdom period whose span contains the reign's start.
        const start = eventYear(f.startDate);
        const containing = kingdoms.filter((k) => start >= eventYear(k.fields.startDate) && start < eventEndYear(k.fields.startDate, k.fields.duration));
        if (containing.length === 1) {
          group = RULER_GROUPS[containing[0].fields.title];
          rulerNotes.push(`${f.title}: no partOf; group "${group}" from the "${containing[0].fields.title}" period containing its start`);
        }
      }
      if (!group) {
        rulerNotes.push(`${f.title}: no kingdom, skipped`);
        continue;
      }
      const t = timelineById.get(eid(e.id))!;
      const r: Ruler = { person: pid(f.participants[0]), name: (reign ?? prophecy)![1], group, start: t.start, event: t.id };
      if (t.end !== undefined) r.end = t.end;
      if (t.refs) r.refs = t.refs;
      rulers.push(r);
    }
    const groupOrder: Ruler['group'][] = ['united', 'judah', 'israel', 'prophet'];
    rulers.sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group) || a.start - b.start);

    // People.
    const nameCount = new Map<string, number>();
    for (const p of people) nameCount.set(p.fields.name, (nameCount.get(p.fields.name) ?? 0) + 1);
    const ownEvents = new Map<string, AirRecord<TheoEvent>[]>();
    for (const e of sortedEvents) for (const r of e.fields.participants ?? []) ownEvents.set(r, [...(ownEvents.get(r) ?? []), e]);

    const dateNotes: string[] = [];
    const unlinkedDictRefs: string[] = [];
    let datesFromEvents = 0;
    const offByOne: string[] = [];
    let dictRefs = 0;
    const lifetimeChecks = { agree: 0, differ: [] as string[] };
    const titleSources: Record<string, number> = {};
    const profiles: Person[] = [];
    const sortedPeople = [...people].sort((a, b) => a.fields.personID - b.fields.personID);
    const usedIds = new Set<string>();
    for (const p of sortedPeople) {
      const f = p.fields;
      const id = f.personLookup;
      assert(/^[a-z0-9_-]+$/.test(id) && !usedIds.has(id), `person id "${id}" is not URL-safe or not unique`);
      usedIds.add(id);
      const person: Person = { id, name: f.name, verses: versesOf(f.verses) };
      assert(person.verses.length === (f.verseCount ?? person.verses.length), `${id}: verseCount ${f.verseCount} vs ${person.verses.length}`);

      // Title.
      const rel = (k: 'father' | 'mother' | 'children' | 'partners' | 'siblings') => {
        const r = f[k]?.[0];
        return r ? personRec.get(r)?.name : undefined;
      };
      const g = f.gender === 'Male' ? 'M' : f.gender === 'Female' ? 'F' : undefined;
      const t = personTitle(
        {
          id,
          name: f.name,
          displayTitle: f.displayTitle,
          disambiguation: f['Disambiguation (temp)'],
          gender: g,
          father: rel('father'),
          mother: rel('mother'),
          child: rel('children'),
          partner: rel('partners'),
          sibling: rel('siblings'),
        },
        (nameCount.get(f.name) ?? 0) > 1,
      );
      if (t) {
        person.title = t.title;
        titleSources[t.source] = (titleSources[t.source] ?? 0) + 1;
      }
      if (g) person.g = g;

      // Years: event dates first ("Lifetime of X", "Birth of X", "Death of X"), then the person's
      // own fields, dropping values that contradict the person's own reign/prophecy events.
      const mine = ownEvents.get(p.id) ?? [];
      const named = (title: string, prefix: string) => {
        if (!title.startsWith(prefix)) return false;
        const rest = title.slice(prefix.length);
        const names = [f.name, ...(f.alsoCalled ?? '').split(',')].map((n) => n.trim()).filter(Boolean);
        return names.some((n) => new RegExp(`(^|[^A-Za-z])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z])`).test(rest));
      };
      const lifetime = mine.find((e) => e.fields.title.startsWith('Lifetime of ') && e.fields.participants?.[0] === p.id);
      const own = (prefix: string) =>
        mine.find((e) => e.fields.title.startsWith(prefix) && (e.fields.participants?.[0] === p.id || named(e.fields.title, prefix)));
      const born = own('Birth of ');
      const died = own('Death of ');
      // A specific "Birth of"/"Death of" event beats start + duration of "Lifetime of": "Lifetime of
      // Jacob" says 180Y, but "Death of Jacob" and Gen 47:28 give 147 years.
      const birthEvent = born ?? lifetime;
      const deathEvent = died ?? lifetime;
      const evBirth = born ? eventYear(born.fields.startDate) : lifetime ? eventYear(lifetime.fields.startDate) : undefined;
      const evDeath = died
        ? eventYear(died.fields.startDate)
        : lifetime
          ? eventEndYear(lifetime.fields.startDate, lifetime.fields.duration)
          : undefined;
      if (lifetime && died) {
        const lifeEnd = eventEndYear(lifetime.fields.startDate, lifetime.fields.duration);
        if (lifeEnd !== evDeath) lifetimeChecks.differ.push(`"${lifetime.fields.title}" ends ${lifeEnd} (${lifetime.fields.duration}) but "${died.fields.title}" is ${evDeath}`);
        else lifetimeChecks.agree++;
      }
      // Person years within a year of the event date are kept (the source rounds both ways); an
      // obviously inconsistent person year is replaced by the event date; a missing one is filled.
      const pick = (kind: 'birth' | 'death', person: number | undefined, event: number | undefined, from?: AirRecord<TheoEvent>) => {
        if (event === undefined) return person;
        if (person === undefined) {
          datesFromEvents++;
          return event;
        }
        if (Math.abs(person - event) <= 1) {
          if (person !== event) offByOne.push(`${id} ${kind} ${person} (event ${event})`);
          return person;
        }
        dateNotes.push(`${id}: ${kind} ${person} → ${event} from "${from!.fields.title}"`);
        return event;
      };
      let birth = pick('birth', personYear(f.birthYear), evBirth, birthEvent);
      let death = pick('death', personYear(f.deathYear), evDeath, deathEvent);
      const office = mine.filter((e) => /^(Reign|Prophecies) of /.test(e.fields.title) && e.fields.participants?.[0] === p.id);
      if (office.length) {
        const first = Math.min(...office.map((e) => eventYear(e.fields.startDate)));
        const last = Math.max(...office.map((e) => eventYear(e.fields.startDate)));
        if (birth !== undefined && birth > first) {
          dateNotes.push(`${id}: birth ${birth} dropped (after own "${office[0].fields.title}" starting ${first})`);
          birth = undefined;
        }
        if (death !== undefined && death < last) {
          dateNotes.push(`${id}: death ${death} dropped (before own "${office[office.length - 1].fields.title}" starting ${last})`);
          death = undefined;
        }
      }
      if (birth !== undefined && death !== undefined && birth > death) {
        dateNotes.push(`${id}: birth ${birth} after death ${death}; both dropped`);
        birth = death = undefined;
      }
      if (birth !== undefined) person.birth = birth;
      if (death !== undefined) person.death = death;

      // Family and groups.
      if (f.father?.[0]) person.father = pid(f.father[0]);
      if (f.mother?.[0]) person.mother = pid(f.mother[0]);
      if (f.siblings?.length) person.siblings = f.siblings.map(pid);
      const half = [...new Set([...(f.halfSiblingsSameFather ?? []), ...(f.halfSiblingsSameMother ?? [])].map(pid))];
      if (half.length) person.halfSiblings = half;
      if (f.children?.length) person.children = f.children.map(pid);
      if (f.partners?.length) person.partners = f.partners.map(pid);
      const grp = (f.memberOf ?? []).map((r) => groupName.get(r)).filter((n): n is string => !!n);
      if (grp.length) person.groups = grp;
      if (f.dictText?.length) {
        const { blocks: dict, dropped } = dropInvalidRefs(f.dictText.flatMap((t) => dictToBlocks(t)), validCompact);
        for (const r of dropped) unlinkedDictRefs.push(`${id} ${r}`);
        dictRefs += blockRefs(dict).length;
        if (dict.length) person.dict = dict;
      }
      const evs = mine.map((e) => eid(e.id));
      if (evs.length) person.events = evs;
      profiles.push(person);
    }

    // Write.
    const index: PersonSummary[] = [];
    const buckets = new Map<number, Record<string, Person>>();
    profiles.forEach((person, i) => {
      const k = Math.floor(i / 100);
      const s: PersonSummary = { id: person.id, name: person.name, n: person.verses.length, k };
      if (person.title) s.title = person.title;
      if (person.g) s.g = person.g;
      index.push(s);
      const b = buckets.get(k) ?? {};
      b[person.id] = person;
      buckets.set(k, b);
    });
    writeData('theographic/people/index.json', index);
    for (const [k, b] of buckets) writeData(`theographic/people/${k}.json`, b);
    writeData('theographic/timeline/events.json', timeline);
    writeData('theographic/timeline/rulers.json', rulers);

    // ---- Verify.
    const byId = new Map(profiles.map((p) => [p.id, p]));
    assert(profiles.length === 3067, `people: ${profiles.length}`);
    assert(timeline.length === 450, `events: ${timeline.length}`);
    for (const p of profiles) {
      for (const k of ['father', 'mother'] as const) if (p[k]) assert(byId.has(p[k]!), `${p.id}.${k} → ${p[k]}`);
      for (const k of ['siblings', 'halfSiblings', 'children', 'partners'] as const)
        for (const x of p[k] ?? []) assert(byId.has(x), `${p.id}.${k} → ${x}`);
      for (let i = 1; i < p.verses.length; i++) assert(p.verses[i] > p.verses[i - 1], `${p.id} verses not ascending`);
      for (const v of p.verses) assert(validVerseId(v), `${p.id} verse ${v}`);
      for (const r of blockRefs(p.dict ?? [])) assert(validCompact(r), `${p.id} dict ref ${r}`);
      for (const e of p.events ?? []) assert(timelineById.has(e), `${p.id} event ${e}`);
      if (p.birth !== undefined) assert(p.birth !== 0, `${p.id} year zero`);
    }
    const placeIds = new Set(extraction.places.map((p) => p.place.id));
    for (const t of timeline) {
      for (const x of t.people ?? []) assert(byId.has(x), `${t.id} person ${x}`);
      for (const x of t.places ?? []) assert(placeIds.has(x), `${t.id} place ${x}`);
      for (const r of t.refs ?? []) assert(validCompact(r), `${t.id} ref ${r}`);
      if (t.part) assert(timelineById.has(t.part), `${t.id} part ${t.part}`);
      assert(t.start !== 0 && (t.end === undefined || t.end >= t.start), `${t.id} years ${t.start}..${t.end}`);
    }

    // Family-link symmetry (reported, not fixed).
    const asym: string[] = [];
    for (const p of profiles) {
      for (const c of p.children ?? []) {
        const child = byId.get(c)!;
        if (child.father !== p.id && child.mother !== p.id) asym.push(`${p.id} lists child ${c}, whose parents are ${child.father ?? '-'}/${child.mother ?? '-'}`);
      }
      for (const k of ['father', 'mother'] as const)
        if (p[k] && !(byId.get(p[k]!)!.children ?? []).includes(p.id)) asym.push(`${p.id}.${k} ${p[k]} does not list ${p.id} as a child`);
      for (const k of ['siblings', 'halfSiblings', 'partners'] as const)
        for (const x of p[k] ?? []) if (!(byId.get(x)![k] ?? []).includes(p.id)) asym.push(`${p.id}.${k} has ${x}, not mirrored`);
    }

    // Spot checks.
    const abraham = byId.get('abraham_58')!;
    assert(abraham.father === 'terah_2841', `Abraham's father is ${abraham.father}`);
    assert(abraham.children?.includes('isaac_616'), `Abraham's children: ${abraham.children}`);
    assert(abraham.birth === -1997 && abraham.death === -1821, `Abraham ${abraham.birth}..${abraham.death}`);
    const jacob = byId.get('israel_682')!;
    assert(jacob.birth === -1836 && jacob.death === -1689, `Jacob ${jacob.birth}..${jacob.death} (147 years, Gen 47:28)`);
    const david = byId.get('david_994')!;
    assert(david.father === 'jesse_903', `David's father is ${david.father}`);
    assert(david.death === -1015, `David died ${david.death}`);
    assert(blockRefs(david.dict ?? []).includes('1SA.16.12'), "David's Easton entry links 1 Sam 16:12");
    assert(david.events?.includes('reign-of-david'), "David's events include his reign");
    const ruler = (person: string) => rulers.find((r) => r.person === person)!;
    const reho = ruler('rehoboam_2412');
    assert(reho.group === 'judah' && reho.start === -975 && reho.end === -958, `Rehoboam ${JSON.stringify(reho)}`);
    const hez = ruler('hezekiah_1512');
    assert(hez.group === 'judah' && hez.start === -726 && hez.end === -697, `Hezekiah ${JSON.stringify(hez)}`);
    const saul = ruler('saul_2478');
    assert(saul.group === 'united' && saul.start === -1095 && saul.end === -1055, `Saul ${JSON.stringify(saul)}`);
    const counts = Object.fromEntries(groupOrder.map((g) => [g, rulers.filter((r) => r.group === g).length]));
    assert(counts.united === 3 && counts.judah === 20 && counts.israel === 20 && counts.prophet === 18, `rulers ${JSON.stringify(counts)}`);
    const jerusalemEvents = timeline.filter((t) => t.places?.includes('jerusalem')).length;
    assert(jerusalemEvents > 20, `events at Jerusalem: ${jerusalemEvents}`);

    // Gaps (reported).
    const prophetNames = new Set(rulers.filter((r) => r.group === 'prophet').map((r) => r.name));
    const missingProphets = NON_WRITING_PROPHETS.filter((n) => !prophetNames.has(n));
    const placeholderProphets = rulers
      .filter((r) => r.group === 'prophet' && ['1D', '1Y'].includes(timelineById.get(r.event)!.dur ?? ''))
      .map((r) => `${r.name} (${timelineById.get(r.event)!.dur})`);
    const shared = profiles.filter((p) => (nameCount.get(p.name) ?? 0) > 1);
    const pairCount = new Map<string, number>();
    for (const p of shared) pairCount.set(`${p.name}|${p.title ?? ''}`, (pairCount.get(`${p.name}|${p.title ?? ''}`) ?? 0) + 1);
    const ambiguous = shared.filter((p) => (pairCount.get(`${p.name}|${p.title ?? ''}`) ?? 0) > 1).length;

    log('theographic', `people ${profiles.length} in ${buckets.size} buckets; events ${timeline.length}; rulers ${JSON.stringify(counts)}`);
    log('theographic', `titles: ${JSON.stringify(titleSources as Record<TitleSource, number>)}; ${shared.length} people share a name, ${ambiguous} still share name+title`);
    const withYears = profiles.filter((p) => p.birth !== undefined || p.death !== undefined).length;
    log('theographic', `years on ${withYears} people (${datesFromEvents} years filled from events); "Lifetime of" end agrees with "Death of": ${lifetimeChecks.agree}; conflicts (Death of preferred): ${lifetimeChecks.differ.join('; ') || 'none'}`);
    log('theographic', `person years kept although an event differs by one year (${offByOne.length}): ${offByOne.join('; ')}`);
    log('theographic', `person-date corrections (${dateNotes.length}): ${dateNotes.join('; ')}`);
    log('theographic', `family-link asymmetries (${asym.length}, not fixed): ${asym.join('; ')}`);
    log('theographic', `event places matched to OpenBible: ${timeline.reduce((s, t) => s + (t.places?.length ?? 0), 0)} links; unmatched (${unmatchedPlaces.length}): ${unmatchedPlaces.join('; ')}`);
    log('theographic', `Easton's text on ${profiles.filter((p) => p.dict).length} people: ${dictRefs} Scripture links; ${unlinkedDictRefs.length} refs to non-existent KJV verses left as plain text: ${unlinkedDictRefs.join(', ')}`);
    log('theographic', `ruler notes: ${rulerNotes.join('; ') || 'none'}`);
    log('theographic', `gaps: no "Prophecies of" event for ${missingProphets.join(', ')}; no "Reign of" event for Ish-bosheth; placeholder prophet durations (shown as given): ${placeholderProphets.join(', ')}`);

    recordSource({
      id: 'theographic',
      name: 'Theographic Bible Metadata',
      homepage: 'https://github.com/robertrouse/theographic-bible-metadata',
      version: `commit ${THEO_COMMIT}`,
      files: [...theo.records, ...geo.records],
      license: {
        id: 'CC-BY-SA-4.0',
        name: 'Creative Commons Attribution-ShareAlike 4.0 International',
        url: 'https://creativecommons.org/licenses/by-sa/4.0/',
        attribution:
          'People, family-tree, event and timeline data adapted from Theographic Bible Metadata by Robert Rouse (viz.bible), https://github.com/robertrouse/theographic-bible-metadata, CC BY-SA 4.0. Modified.',
        confirmedAt:
          'LICENSE (full CC BY-SA 4.0 legal code) and readme.md ("Creative Commons Attribution Share-Alike 4.0 License") at the pinned commit. The website https://theographic.netlify.app/about/ says CC BY 4.0; we follow the stricter repository license and treat all derived files as share-alike.',
      },
      outputs: ['theographic'],
      notes:
        "Easton's Bible Dictionary (1897) text in person profiles is public domain; Theographic's verse links on it come with the BY-SA data. Years are normalized to negative = BC (event startDate is astronomical, person years are BC-negative). Event places are OpenBible.info place ids (CC BY 4.0, merged into this BY-SA file), matched by name and verse overlap.",
    });
    log('theographic', folderStats('theographic'));
  },
};

// ---------------------------------------------------------------------------------------------
// Stage: basemap

const SEAS: [string, 'marine' | 'lakes', string][] = [
  ['Mediterranean Sea', 'marine', 'Mediterranean Sea'],
  ['Red Sea', 'marine', 'Red Sea'],
  ['Persian Gulf', 'marine', 'Persian Gulf'],
  ['Black Sea', 'marine', 'Black Sea'],
  ['Caspian Sea', 'marine', 'Caspian Sea'],
  ['Dead Sea', 'lakes', 'Dead Sea'],
  ['Sea of Galilee', 'lakes', 'Sea of Galilee'],
];

/** Islands that must survive simplification (Acts and Revelation), with a point inside each. */
const ISLANDS: [string, number, number][] = [
  ['Cyprus', 33.0, 35.05],
  ['Crete', 24.9, 35.25],
  ['Malta (Melita)', 14.42, 35.89],
  ['Patmos', 26.55, 37.32],
  ['Gavdos (Clauda)', 24.08, 34.84],
  ['Rhodes', 28.0, 36.2],
  ['Kos (Coos)', 27.15, 36.84],
  ['Samos', 26.8, 37.72],
  ['Chios', 26.0, 38.4],
  ['Lesbos (Mitylene)', 26.3, 39.2],
  ['Samothrace', 25.55, 40.47],
  ['Sicily (Syracuse)', 14.2, 37.5],
];

/** Douglas–Peucker tolerance for rivers, in map units (0.05 ≈ 280 m). */
const RIVER_TOLERANCE = 0.05;

const basemap: Stage = {
  id: 'basemap',
  description: 'Natural Earth 10m land, lakes, rivers and sea labels → pre-projected SVG base map',
  async run() {
    resetFolder('naturalearth');
    const ne = await neSources();
    const read = (f: string) => readJson<GeoCollection>(ne.paths[f]);
    const build = buildBaseMap(
      {
        land: read('ne_10m_land.geojson'),
        lakes: read('ne_10m_lakes.geojson'),
        rivers: read('ne_10m_rivers_lake_centerlines.geojson'),
        marine: read('ne_10m_geography_marine_polys.geojson'),
      },
      {
        proj: BASEMAP_PROJECTION,
        tolerance: { land: 0.1, lakes: 0.05, rivers: RIVER_TOLERANCE },
        minArea: { land: 0.02, lakes: 0.02 },
        seas: SEAS,
      },
    );
    const map: BaseMap = build.map;
    writeData('naturalearth/base.json', map);

    // ---- Verify.
    const size = Buffer.byteLength(JSON.stringify(map));
    assert(size < 250_000, `base.json is ${size} bytes`);
    assert(Math.abs(map.width - 1040) < 1 && map.height === 600, `size ${map.width}×${map.height}`);
    assert(scaleOf(map) === 20, `k = ${scaleOf(map)}`);
    const [ex, ey] = projectLonLat(65, 15, { bbox: map.bbox, lat0: map.lat0, k: scaleOf(map) });
    assert(Math.abs(ex - map.width) < 0.1 && Math.abs(ey - map.height) < 1e-9, 'projection corner');
    const land = decodePath(map.land);
    const lakes = decodePath(map.lakes);
    const rivers = decodePath(map.rivers);
    for (const shape of [...land, ...lakes, ...rivers])
      for (const [x, y] of shape) assert(x >= 0 && x <= map.width + 0.05 && y >= 0 && y <= map.height, `point ${x},${y} outside the map`);
    assert(land.length === build.stats.landRings && lakes.length === build.stats.lakeRings, 'decoded ring counts');
    const at = (lon: number, lat: number): Pt => projectLonLat(lon, lat, BASEMAP_PROJECTION);
    const islandReport: string[] = [];
    for (const [nameI, lon, lat] of ISLANDS) {
      const p = at(lon, lat);
      const orig = build.original.land.filter((r) => pointInRings(p, [r])).sort((a, b) => Math.abs(ringArea(a)) - Math.abs(ringArea(b)))[0];
      assert(orig, `${nameI}: test point not on 10m land`);
      const a0 = Math.abs(ringArea(orig));
      assert(a0 < 5000, `${nameI}: test point is on a continent`);
      const kept = land.find((r) => pointInRings(p, [r]) && Math.abs(Math.abs(ringArea(r)) - a0) / a0 < 0.25);
      assert(kept, `${nameI} lost or distorted by simplification`);
      islandReport.push(`${nameI} ${orig.length}→${kept.length} pts`);
    }
    assert(pointInRings(at(35.59, 32.82), lakes), 'Sea of Galilee missing');
    assert(pointInRings(at(35.5, 31.55), lakes), 'Dead Sea missing');
    const jordanIdx = build.riverNames.map((n, i) => (n === 'Jordan' ? i : -1)).filter((i) => i >= 0);
    const jordanBefore = build.original.rivers.filter((r) => r.name === 'Jordan').reduce((s, r) => s + r.line.length, 0);
    const jordanAfter = jordanIdx.reduce((s, i) => s + build.rivers[i].length, 0);
    assert(jordanAfter >= jordanBefore * 0.5, `Jordan kept ${jordanAfter} of ${jordanBefore} vertices`);
    // Shape: every original Jordan vertex lies within the tolerance of the simplified line, and the
    // ends (Hermon, the Sea of Galilee, the Dead Sea) are kept.
    let jordanDev = 0;
    for (const i of jordanIdx) {
      const orig = build.original.rivers[i].line;
      const simp = build.rivers[i];
      for (const q of orig) jordanDev = Math.max(jordanDev, distanceToLine(q, simp));
      assert(orig[0] === simp[0] && orig[orig.length - 1] === simp[simp.length - 1], 'Jordan ends kept');
    }
    assert(jordanDev <= RIVER_TOLERANCE + 1e-9, `Jordan deviates ${jordanDev}`);
    const nearLake = (p: Pt, lon: number, lat: number) => {
      const ring = build.original.lakes.find((r) => pointInRings(at(lon, lat), [r]));
      return !!ring && (pointInRings(p, [ring]) || distanceToLine(p, [...ring, ring[0]]) < 0.5);
    };
    const lower = jordanIdx.map((i) => build.rivers[i]).find((l) => l.length > 40)!;
    assert(nearLake(lower[0], 35.59, 32.82), 'lower Jordan leaves the Sea of Galilee');
    assert(nearLake(lower[lower.length - 1], 35.5, 31.55), 'lower Jordan reaches the Dead Sea');
    assert(map.seas.length === SEAS.length, 'sea labels');
    for (const s of map.seas) {
      const inLake = pointInRings([s.x, s.y], lakes);
      assert(SEAS.find((x) => x[0] === s.name)![1] === 'lakes' ? inLake : !pointInRings([s.x, s.y], land), `${s.name} label on land`);
    }
    assert(build.stats.droppedReservoirs.includes('Lake Nasser') && build.stats.droppedReservoirs.length === 8, 'reservoirs');
    assert(build.stats.droppedCanals.includes('Suez Canal'), 'canals');

    log('basemap', `${map.width}×${map.height} units (k = 20, lat0 = 30); land ${build.stats.landRings} rings, lakes ${build.stats.lakeRings}, rivers ${build.stats.riverLines} lines`);
    log('basemap', `vertices ${build.stats.pointsIn} → ${build.stats.pointsOut}; dropped ${build.stats.droppedSmallRings} rings under 0.02 units² (≈0.6 km²)`);
    log('basemap', `dropped reservoirs: ${build.stats.droppedReservoirs.join(', ')}; canals: ${[...new Set(build.stats.droppedCanals)].join(', ')}; lake centerlines across kept lakes: ${build.stats.droppedLakeCenterlines.join(', ')}`);
    log('basemap', `Jordan ${jordanBefore} → ${jordanAfter} vertices, max deviation ${jordanDev.toFixed(3)} units; islands: ${islandReport.join(', ')}`);
    log('basemap', `seas: ${map.seas.map((s) => `${s.name} (${s.x}, ${s.y})`).join('; ')}`);
    log('basemap', `size ${(size / 1024).toFixed(1)} KB (land ${(map.land.length / 1024).toFixed(1)}, lakes ${(map.lakes.length / 1024).toFixed(1)}, rivers ${(map.rivers.length / 1024).toFixed(1)})`);

    recordSource({
      id: 'naturalearth',
      name: 'Natural Earth',
      homepage: 'https://www.naturalearthdata.com/',
      version: `${NE_TAG} (commit ${NE_COMMIT})`,
      files: ne.records,
      license: {
        id: 'PD',
        name: 'Public domain',
        url: 'https://www.naturalearthdata.com/about/terms-of-use/',
        attribution: 'Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com.',
        confirmedAt: `https://www.naturalearthdata.com/about/terms-of-use/ and LICENSE.md at tag ${NE_TAG} of github.com/nvkelso/natural-earth-vector`,
      },
      outputs: ['naturalearth'],
      notes:
        'Credit is optional; we show it. 10m land, lakes (without modern reservoirs) and rivers (without canals), clipped to [5, 15, 65, 45], projected equirectangularly (lat0 30, k = height / 30) and simplified with Douglas–Peucker.',
    });
    log('basemap', folderStats('naturalearth'));
  },
};

// ---------------------------------------------------------------------------------------------
// Stage: places

const places: Stage = {
  id: 'places',
  deps: ['versemap'],
  description: 'OpenBible.info Bible Geocoding Data → plottable places, place verses, chapter places',
  async run() {
    resetFolder('openbible-geo');
    const geo = await obGeoSources();
    await ensureTvtms();
    const mapper = loadVerseMap();
    const ex = extractPlaces(geo.paths, mapper);
    const list = ex.places.map((p) => p.place);
    const verses: PlaceVerses = {};
    for (const p of ex.places) verses[p.place.id] = p.verses;
    writeData('openbible-geo/places.json', list);
    writeData('openbible-geo/verses.json', verses);
    const byBook = new Map<BookCode, Map<number, { id: string; first: number }[]>>();
    for (const p of ex.places) {
      const firstInChapter = new Map<string, number>();
      for (const v of p.verses) {
        const { book, chapter } = fromVerseId(v);
        const key = `${book}.${chapter}`;
        if (!firstInChapter.has(key)) firstInChapter.set(key, v);
      }
      for (const [key, first] of firstInChapter) {
        const [book, chapter] = key.split('.') as [BookCode, string];
        const chapters = byBook.get(book) ?? new Map();
        chapters.set(Number(chapter), [...(chapters.get(Number(chapter)) ?? []), { id: p.place.id, first }]);
        byBook.set(book, chapters);
      }
    }
    let chapterLinks = 0;
    for (const { code } of BOOKS) {
      const out: ChapterPlaces = {};
      for (const [ch, entries] of [...(byBook.get(code) ?? new Map<number, { id: string; first: number }[]>())].sort((a, b) => a[0] - b[0])) {
        out[String(ch)] = entries.sort((a, b) => a.first - b.first || a.id.localeCompare(b.id)).map((e) => e.id);
        chapterLinks += entries.length;
      }
      writeData(`openbible-geo/chapters/${code}.json`, out);
    }

    // ---- Verify.
    const byId = new Map(list.map((p) => [p.id, p]));
    assert(ex.ancientCount === 1342, `ancient places: ${ex.ancientCount}`);
    assert(list.length + ex.skipped.length === ex.ancientCount, 'every place kept or skipped');
    assert(ex.slugMismatches.length === 0, `ids differ from url_slug: ${ex.slugMismatches.join('; ')}`);
    for (const p of list) {
      assert(/^[a-z0-9-]+$/.test(p.id), `place id ${p.id}`);
      assert(!/\s\d+$/.test(p.name), `display name ${p.name}`);
      assert(Math.abs(p.lon) <= 180 && Math.abs(p.lat) <= 90 && p.score >= 0 && p.score <= 1000, `${p.id} values`);
      assert(p.n === verses[p.id].length, `${p.id} n`);
      for (const v of verses[p.id]) assert(validVerseId(v), `${p.id} verse ${v}`);
    }
    const check = (id: string, name: string, lon: number, lat: number, type: string) => {
      const p = byId.get(id);
      assert(p, `${id} missing`);
      assert(p.name === name && p.lon === lon && p.lat === lat && p.type === type, `${id}: ${JSON.stringify(p)}`);
      assert(p.n === ex.sourceVerseCounts.get(id), `${id} verse count ${p.n} vs source ${ex.sourceVerseCounts.get(id)}`);
      assert(p.score === 1000, `${id} score ${p.score}`);
      return p;
    };
    const jer = check('jerusalem', 'Jerusalem', 35.234167, 31.776667, 'settlement');
    const beth = check('bethlehem-1', 'Bethlehem', 35.207639, 31.704306, 'settlement');
    const jordan = check('jordan', 'Jordan', 35.558333, 31.761389, 'river');
    assert(jer.n === 955 && beth.n === 52 && jordan.n === 202, 'Jerusalem/Bethlehem/Jordan verse counts');
    assert(verses.jerusalem.includes(verseId('2SA', 5, 6)) && verses['bethlehem-1'].includes(verseId('MIC', 5, 2)), 'known verses');
    assert(verses.arimathea?.includes(verseId('LUK', 23, 51)), 'Arimathea uses the KJV verse (Luke 23:51)');
    assert(!byId.has('eden-1'), 'Eden must not be plotted');
    const fromChapters = (code: BookCode) => readJson<ChapterPlaces>(join(OUT, 'openbible-geo', 'chapters', `${code}.json`));
    assert(fromChapters('MIC')['5'].includes('bethlehem-1'), 'MIC 5 lists Bethlehem');
    assert(fromChapters('JHN')['1'].includes('jordan'), 'JHN 1 lists the Jordan');
    const ids = new Set(list.map((p) => p.id));
    for (const { code } of BOOKS) for (const arr of Object.values(fromChapters(code))) for (const id of arr) assert(ids.has(id), `chapter place ${id}`);
    assert(ex.invalidVerses.length === 0, `non-KJV place verses: ${ex.invalidVerses.join(', ')}`);

    const reasons: Record<string, number> = {};
    for (const s of ex.skipped) reasons[s.reason] = (reasons[s.reason] ?? 0) + 1;
    const [w, s, e, n] = BASEMAP_PROJECTION.bbox;
    const offMap = list.filter((p) => p.lon < w || p.lon > e || p.lat < s || p.lat > n).map((p) => p.name);
    const kept = ex.places.reduce((sum, p) => sum + p.verses.length, 0);
    log('places', `${list.length} plottable of ${ex.ancientCount}; skipped ${ex.skipped.length} (${JSON.stringify(reasons)})`);
    log('places', `place-verse links: ${ex.verseLinks} in plottable places → ${kept} KJV verse ids; ${ex.viaAlternate} use OpenBible's KJV alternate verse; ${ex.renumbered} renumbered by versemap; ${ex.invalidVerses.length} dropped as non-KJV`);
    const clamped = ex.places.filter((p) => p.clamped !== undefined).map((p) => `${p.place.id} ${p.clamped}→${p.place.score}`);
    log('places', `scores clamped to 0–1000 (${clamped.length}): ${clamped.join(', ')}`);
    log('places', `custom_lonlat used for ${ex.places.filter((p) => p.custom).length} places; OSM-sourced coordinates for ${ex.places.filter((p) => p.osmCoords).length}; outside the base map: ${offMap.join(', ')}`);
    log('places', `chapter→place links ${chapterLinks}; Jerusalem n=${jer.n}, Bethlehem n=${beth.n}, Jordan n=${jordan.n}`);

    recordSource({
      id: 'openbible-geo',
      name: 'OpenBible.info Bible Geocoding Data',
      homepage: 'https://www.openbible.info/geo/',
      version: `commit ${OB_GEO_COMMIT}`,
      files: geo.records,
      license: {
        id: 'CC-BY-4.0',
        name: 'Creative Commons Attribution 4.0 International',
        url: 'https://creativecommons.org/licenses/by/4.0/',
        attribution: 'Bible place locations from OpenBible.info (https://www.openbible.info/geo/), CC BY 4.0. Includes some data © OpenStreetMap contributors (ODbL).',
        confirmedAt:
          'readme.md "License" section and license.txt (CC BY 4.0 legal code) at the pinned commit of github.com/openbibleinfo/Bible-Geocoding-Data, and https://www.openbible.info/geo/',
      },
      outputs: ['openbible-geo'],
      notes:
        'Points only: best-guess identification and its first resolved coordinates (custom_lonlat where the original came from a commercial source). No OpenStreetMap-derived shapes are shipped; a few point coordinates come from OSM (ODbL). Verse refs mapped from ESV-style to KJV numbering with STEPBible TVTMS.',
    });
    log('places', folderStats('openbible-geo'));
  },
};

// ---------------------------------------------------------------------------------------------
// Stage: openbible-xref

const openbibleXref: Stage = {
  id: 'openbible-xref',
  deps: ['versemap'],
  description: 'OpenBible.info cross-references → per-chapter KJV-numbered lists, by votes',
  async run() {
    resetFolder('openbible-xref');
    const zip = await download(XREF_URL, 'openbible-xref', 'cross-references.zip', XREF_SHA256);
    await ensureTvtms();
    const mapper = loadVerseMap();
    const text = readZipEntry(readFileSync(zip.path), 'cross_references.txt').toString('utf8');
    const lines = text.split('\n');
    assert(/^From Verse\tTo Verse\tVotes\t#www\.openbible\.info CC-BY 2026-09-28/.test(lines[0]), `header: ${lines[0]}`);

    // chapter key → verse → target ref → votes
    const data = new Map<string, Map<number, Map<string, number>>>();
    const t = { rows: 0, kept: 0, lowVotes: 0, badFrom: [] as string[], badTo: [] as string[], selfOnly: 0, mappedFrom: 0, mappedTo: 0, crossBook: 0, extraRefs: 0, selfRefs: 0, merged: 0 };
    const sourceVotes = new Map<string, number>();
    for (const line of lines) {
      const row = parseXrefLine(line);
      if (!row) continue;
      t.rows++;
      if (row.from === 'John.3.16') sourceVotes.set(row.to, row.votes);
      if (row.votes <= 0) {
        t.lowVotes++;
        continue;
      }
      const from = mapper.mapOsis(row.from);
      if (!from) {
        t.badFrom.push(row.from);
        continue;
      }
      const to = xrefTarget(row.to, mapper);
      if (!to) {
        t.badTo.push(row.to);
        continue;
      }
      if (from.rule) t.mappedFrom++;
      if (to.mapped) t.mappedTo++;
      if (to.crossBook) {
        t.crossBook++;
        t.extraRefs += to.refs.length - 1;
      }
      const chKey = `${from.book}.${from.chapter}`;
      const fromKey = `${chKey}.${from.verse}`;
      const chapter = data.get(chKey) ?? new Map<number, Map<string, number>>();
      data.set(chKey, chapter);
      const list = chapter.get(from.verse) ?? new Map<string, number>();
      chapter.set(from.verse, list);
      let used = false;
      for (const ref of to.refs) {
        if (ref === fromKey) {
          t.selfRefs++;
          continue;
        }
        const prev = list.get(ref);
        if (prev !== undefined) t.merged++;
        list.set(ref, Math.max(prev ?? 0, row.votes));
        used = true;
      }
      if (used) t.kept++;
      else t.selfOnly++;
    }

    const startId = (ref: string) => {
      const r = fromCompact(ref)!;
      return verseId(r.book, r.chapter, r.verse ?? 1);
    };
    let files = 0;
    let entries = 0;
    for (const { code, chapters } of BOOKS) {
      for (let c = 1; c <= chapters; c++) {
        const out: OpenBibleXrefChapter = {};
        const chapter = data.get(`${code}.${c}`);
        for (const [v, list] of [...(chapter ?? new Map<number, Map<string, number>>())].sort((a, b) => a[0] - b[0])) {
          if (!list.size) continue;
          out[String(v)] = [...list].sort((a, b) => b[1] - a[1] || startId(a[0]) - startId(b[0]) || a[0].localeCompare(b[0]));
          entries += list.size;
        }
        writeData(`openbible-xref/${code}/${c}.json`, out);
        files++;
      }
    }

    // ---- Verify.
    assert(files === 1189, `chapters written: ${files}`);
    assert(t.rows === 344_799, `rows: ${t.rows}`);
    assert(t.lowVotes === 3534, `rows with votes ≤ 0: ${t.lowVotes}`);
    const john = readJson<OpenBibleXrefChapter>(join(OUT, 'openbible-xref', 'JHN', '3.json'))['16'];
    const find = (ref: string) => john.find((x) => x[0] === ref);
    assert(find('ROM.5.8')?.[1] === sourceVotes.get('Rom.5.8') && sourceVotes.get('Rom.5.8') === 984, `John 3:16 → Rom 5:8: ${find('ROM.5.8')}`);
    assert(find('1JN.4.9-10')?.[1] === sourceVotes.get('1John.4.9-1John.4.10') && sourceVotes.get('1John.4.9-1John.4.10') === 698, `John 3:16 → 1 John 4:9-10: ${find('1JN.4.9-10')}`);
    for (let i = 1; i < john.length; i++) assert(john[i][1] <= john[i - 1][1], 'John 3:16 sorted by votes');
    for (const { code, chapters } of BOOKS) {
      for (let c = 1; c <= chapters; c++) {
        const chapter = readJson<OpenBibleXrefChapter>(join(OUT, 'openbible-xref', code, `${c}.json`));
        for (const [v, list] of Object.entries(chapter)) {
          assert(isKjvVerse(code, c, Number(v)), `${code}.${c}.${v} is not a KJV verse`);
          for (const [ref, votes] of list) assert(validCompact(ref) && votes > 0, `${code}.${c}.${v} → ${ref} (${votes})`);
        }
      }
    }
    assert(t.kept + t.lowVotes + t.badFrom.length + t.badTo.length + t.selfOnly === t.rows, 'row accounting');
    log('openbible-xref', `rows ${t.rows}: kept ${t.kept}; dropped ${t.lowVotes} with votes ≤ 0, ${t.badFrom.length} non-KJV source verses ${JSON.stringify(t.badFrom)}, ${t.badTo.length} non-KJV targets ${JSON.stringify(t.badTo)}, ${t.selfOnly} that became self-references`);
    log('openbible-xref', `renumbered by versemap: ${t.mappedFrom} source verses, ${t.mappedTo} targets; ${t.crossBook} cross-book ranges split into per-book refs (+${t.extraRefs}); ${t.selfRefs} self-references removed; ${t.merged} duplicates merged (max votes)`);
    log('openbible-xref', `${entries} cross-references in ${files} chapter files; John 3:16 → ROM.5.8 ${find('ROM.5.8')![1]}, 1JN.4.9-10 ${find('1JN.4.9-10')![1]}`);

    recordSource({
      id: 'openbible-xref',
      name: 'OpenBible.info Cross References',
      homepage: 'https://www.openbible.info/labs/cross-references/',
      version: `cross-references.zip sha256 ${XREF_SHA256} (file header dated 2026-09-28; Last-Modified Mon, 28 Sep 2026 09:24:11 GMT)`,
      files: [{ url: XREF_URL, sha256: zip.sha256, bytes: zip.bytes }],
      license: {
        id: 'CC-BY-4.0',
        name: 'Creative Commons Attribution 4.0 International',
        url: 'https://creativecommons.org/licenses/by/4.0/',
        attribution: 'Cross-references from OpenBible.info (https://www.openbible.info/labs/cross-references/), CC BY 4.0.',
        confirmedAt:
          'https://www.openbible.info/labs/cross-references/ ("all content is licensed under a Creative Commons Attribution License", rel="license" link to CC BY 4.0) and the file header "#www.openbible.info CC-BY 2026-09-28"',
      },
      outputs: ['openbible-xref'],
      notes:
        'Derived largely from the public-domain Treasury of Scripture Knowledge. Rows with votes ≤ 0 dropped; refs mapped from ESV-style to KJV numbering with STEPBible TVTMS; sorted by votes.',
    });
    log('openbible-xref', folderStats('openbible-xref'));
  },
};

export const stages: Stage[] = [versemap, theographic, basemap, places, openbibleXref];
