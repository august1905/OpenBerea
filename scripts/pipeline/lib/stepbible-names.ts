// TIPNR proper names → ProperName, plus the resolver that maps the name ids written in TAHOT/TAGNT
// to TIPNR records. The texts and TIPNR were not always updated together (TAHOT has
// "Jerusalem@Jos.10.1-Rev", TIPNR "Jerusalem@Gen.14.18-Rev"; TAGNT writes "Christ|Jesus@Mat.1.1"
// without the range), so ids are matched by name first, then by the word's Strong's tag.
// TIPNR's @Brief/@Short/@Article texts are AI-generated and are never read into the output.
import type { ProperName } from '../../../src/lib/data/types';

export interface TipnrSub {
  /** "Named", "Greek", "Spelled", "(same form with Variant)", … */
  significance: string;
  uniqueName: string;
  dStrong: string;
  eStrong: string;
}

export interface TipnrRecord {
  /** Unified id from the header line, e.g. "Aaron@Exo.4.14-Heb". */
  id: string;
  category: string;
  /** Header fields (tab-separated) of the record. */
  head: string[];
  subs: TipnrSub[];
}

/** Splits TIPNR into records. Real records start at the first "$========== " line (with a space). */
export function parseTipnr(lines: string[]): TipnrRecord[] {
  const records: TipnrRecord[] = [];
  const start = lines.findIndex((l) => l.startsWith('$========== '));
  if (start < 0) throw new Error('TIPNR: no records');
  let cur: TipnrRecord | null = null;
  let wantHead = false;
  for (const line of lines.slice(start)) {
    if (line.startsWith('$==========')) {
      cur = { id: '', category: line.replace(/^\$=+\s*/, '').trim(), head: [], subs: [] };
      records.push(cur);
      wantHead = true;
      continue;
    }
    if (!cur) continue;
    if (wantHead) {
      const f = line.split('\t');
      while (f.length && f[f.length - 1] === '') f.pop();
      cur.head = f;
      cur.id = (f[0] ?? '').split('=')[0].trim();
      wantHead = false;
      continue;
    }
    if (line.startsWith('– ') && !line.startsWith('– Total')) {
      const f = line.split('\t');
      if (f.length < 3) continue;
      const tag = (f[2] ?? '').split('=')[0];
      const [dStrong, eStrong] = tag.split('«');
      cur.subs.push({
        significance: f[0].replace(/^–\s*/, '').trim(),
        uniqueName: f[1].trim(),
        dStrong: (dStrong ?? '').trim(),
        eStrong: (eStrong ?? '').trim(),
      });
    }
  }
  for (const r of records) if (!r.id) throw new Error(`TIPNR: record without id (${r.category})`);
  return records;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Short factual description: TIPNR's Description field, or for places the start of #Summary. */
export function nameSignificance(rec: TipnrRecord): string | undefined {
  const isPlace = rec.category.startsWith('PLACE');
  if (!isPlace) {
    const d = (rec.head[1] ?? '').trim();
    return d && d !== '>' ? d : undefined;
  }
  const summary = rec.head.find((f) => f.startsWith('#'));
  if (!summary) return undefined;
  const text = stripHtml(summary.slice(1));
  const clause = text.split(/\s+(?:first|only)\s+mentioned\b|[;,(]/)[0].trim();
  // A bare "A location" says no more than kind: 'place'.
  return clause && clause !== 'A location' ? clause : undefined;
}

export function properName(rec: TipnrRecord): ProperName {
  const kind: ProperName['kind'] = rec.category.startsWith('PERSON')
    ? 'person'
    : rec.category.startsWith('PLACE')
      ? 'place'
      : 'other';
  const name = rec.id.split('@')[0].replace(/_/g, ' ').trim();
  const out: ProperName = { id: rec.id, name, kind };
  const sig = nameSignificance(rec);
  if (sig) out.sig = sig;
  return out;
}

/** "Jerusalem@Jos.10.1-Rev" → "Jerusalem@Jos.10.1"; "Akeldama@Mat.27.7-+" → "Akeldama@Mat.27.7". */
function firstRefKey(id: string): string {
  return id.replace(/\+$/, '').replace(/-[^@]*$/, '');
}

function numberKey(id: string): string {
  const m = /^([HG])(\d+)/.exec(id);
  return m ? `${m[1]}${m[2].padStart(4, '0')}` : id;
}

export type NameMatch = 'exact' | 'unified' | 'sub' | 'firstRef' | 'dStrong' | 'eStrong';

export class NameIndex {
  readonly byId = new Map<string, TipnrRecord>();
  private bySub = new Map<string, Set<string>>();
  private byFirst = new Map<string, Set<string>>();
  private byDStrong = new Map<string, Set<string>>();
  private byNumber = new Map<string, Set<string>>();
  readonly stats = new Map<NameMatch | 'unmatched', number>();
  readonly unmatched = new Map<string, number>();

  constructor(records: TipnrRecord[]) {
    const add = (map: Map<string, Set<string>>, key: string, id: string) => {
      if (!key) return;
      let set = map.get(key);
      if (!set) map.set(key, (set = new Set()));
      set.add(id);
    };
    for (const r of records) {
      if (this.byId.has(r.id)) throw new Error(`TIPNR: duplicate id ${r.id}`);
      this.byId.set(r.id, r);
      add(this.byFirst, firstRefKey(r.id), r.id);
      for (const s of r.subs) {
        add(this.bySub, s.uniqueName, r.id);
        add(this.byDStrong, s.dStrong, r.id);
        add(this.byNumber, numberKey(s.eStrong || s.dStrong), r.id);
      }
    }
  }

  private count(kind: NameMatch | 'unmatched') {
    this.stats.set(kind, (this.stats.get(kind) ?? 0) + 1);
  }

  private unique(map: Map<string, Set<string>>, key: string): string | null {
    const set = map.get(key);
    return set && set.size === 1 ? set.values().next().value! : null;
  }

  /** Maps a name id from the text ("Abram»Abraham@…", "Christ|Jesus@Mat.1.1") to a TIPNR id. */
  resolve = (raw: string, dStrongs: string[]): string | null => {
    const id = raw.trim();
    const unified = id.split('|').pop()!.trim();
    let hit: string | null = null;
    let how: NameMatch | null = null;
    if (this.byId.has(id)) [hit, how] = [id, 'exact'];
    else if (this.byId.has(unified)) [hit, how] = [unified, 'unified'];
    else if ((hit = this.unique(this.bySub, id))) how = 'sub';
    else if ((hit = this.unique(this.byFirst, firstRefKey(unified)))) how = 'firstRef';
    else {
      for (const d of dStrongs) if ((hit = this.unique(this.byDStrong, d))) break;
      if (hit) how = 'dStrong';
      else {
        for (const d of dStrongs) if ((hit = this.unique(this.byNumber, numberKey(d)))) break;
        if (hit) how = 'eStrong';
      }
    }
    if (hit && how) {
      this.count(how);
      return hit;
    }
    this.count('unmatched');
    this.unmatched.set(id, (this.unmatched.get(id) ?? 0) + 1);
    return null;
  };
}
