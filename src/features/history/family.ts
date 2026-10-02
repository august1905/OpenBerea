import type { Person } from '@/lib/data/types';

// Family tree for a profile: one generation up and down beyond parents and children, when the data
// has them. Grandparents and grandchildren come from the parents' and children's own records, which
// load on demand (they live in other people buckets).

export interface Branch {
  /** The parent (for grandparents) or child (for grandchildren) this group hangs from. */
  via: string;
  ids: string[];
}

export interface FamilyTree {
  self: string;
  grandparents: Branch[];
  parents: string[];
  partners: string[];
  siblings: string[];
  halfSiblings: string[];
  children: string[];
  grandchildren: Branch[];
}

const uniq = (ids: (string | undefined)[], exclude: Set<string>) => {
  const out: string[] = [];
  for (const id of ids) {
    if (!id || exclude.has(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
};

const parentsOf = (p: Pick<Person, 'father' | 'mother'>) => [p.father, p.mother].filter((id): id is string => !!id);

/** Builds the tree from a person and whatever relatives' records are available so far. */
export function buildFamilyTree(person: Person, lookup: (id: string) => Person | undefined): FamilyTree {
  const self = new Set([person.id]);
  const parents = uniq(parentsOf(person), self);
  const children = uniq(person.children ?? [], self);
  const siblings = uniq(person.siblings ?? [], self);
  const halfSiblings = uniq(person.halfSiblings ?? [], new Set([person.id, ...siblings]));
  const partners = uniq(person.partners ?? [], self);

  const near = new Set([person.id, ...parents, ...children]);
  const grandparents: Branch[] = [];
  for (const id of parents) {
    const ids = uniq(parentsOf(lookup(id) ?? {}), near);
    if (ids.length) grandparents.push({ via: id, ids });
  }
  const grandchildren: Branch[] = [];
  for (const id of children) {
    const ids = uniq(lookup(id)?.children ?? [], near);
    if (ids.length) grandchildren.push({ via: id, ids });
  }
  return { self: person.id, grandparents, parents, partners, siblings, halfSiblings, children, grandchildren };
}

/** Relatives whose records are needed for the outer generations. */
export function outerGenerationIds(person: Person): string[] {
  return [...parentsOf(person), ...(person.children ?? [])];
}

/** Every id that appears in the tree (for loading names). */
export function treeIds(tree: FamilyTree): string[] {
  return [
    tree.self,
    ...tree.grandparents.flatMap((b) => b.ids),
    ...tree.parents,
    ...tree.partners,
    ...tree.siblings,
    ...tree.halfSiblings,
    ...tree.children,
    ...tree.grandchildren.flatMap((b) => b.ids),
  ];
}

export function isEmptyTree(tree: FamilyTree): boolean {
  return treeIds(tree).length === 1;
}
