import { describe, expect, it } from 'vitest';

import type { Person } from '@/lib/data/types';

import { buildFamilyTree, isEmptyTree, outerGenerationIds, treeIds } from './family';

const people: Record<string, Person> = {
  obed: { id: 'obed', name: 'Obed', father: 'boaz', mother: 'ruth', children: ['jesse'], verses: [] },
  jesse: { id: 'jesse', name: 'Jesse', father: 'obed', children: ['eliab', 'david'], verses: [] },
  david: {
    id: 'david',
    name: 'David',
    father: 'jesse',
    siblings: ['eliab', 'david'],
    halfSiblings: ['zeruiah', 'eliab'],
    partners: ['bathsheba', 'michal'],
    children: ['solomon', 'absalom'],
    verses: [1, 2, 3],
  },
  solomon: { id: 'solomon', name: 'Solomon', father: 'david', mother: 'bathsheba', children: ['rehoboam'], verses: [] },
  absalom: { id: 'absalom', name: 'Absalom', father: 'david', children: ['tamar'], verses: [] },
  lonely: { id: 'lonely', name: 'Lonely', verses: [1] },
};
const lookup = (id: string) => people[id];

describe('family tree', () => {
  it('collects parents, partners, siblings, and children', () => {
    const tree = buildFamilyTree(people.david, lookup);
    expect(tree.self).toBe('david');
    expect(tree.parents).toEqual(['jesse']);
    expect(tree.partners).toEqual(['bathsheba', 'michal']);
    expect(tree.children).toEqual(['solomon', 'absalom']);
  });

  it('never lists the person as their own sibling, or a sibling twice', () => {
    const tree = buildFamilyTree(people.david, lookup);
    expect(tree.siblings).toEqual(['eliab']);
    expect(tree.halfSiblings).toEqual(['zeruiah']);
  });

  it('adds grandparents and grandchildren from the relatives’ records', () => {
    const tree = buildFamilyTree(people.david, lookup);
    expect(tree.grandparents).toEqual([{ via: 'jesse', ids: ['obed'] }]);
    expect(tree.grandchildren).toEqual([
      { via: 'solomon', ids: ['rehoboam'] },
      { via: 'absalom', ids: ['tamar'] },
    ]);
  });

  it('works before the relatives’ records have loaded', () => {
    const tree = buildFamilyTree(people.david, () => undefined);
    expect(tree.parents).toEqual(['jesse']);
    expect(tree.grandparents).toEqual([]);
    expect(tree.grandchildren).toEqual([]);
  });

  it('lists the records needed for the outer generations', () => {
    expect(outerGenerationIds(people.david)).toEqual(['jesse', 'solomon', 'absalom']);
    expect(outerGenerationIds(people.solomon)).toEqual(['david', 'bathsheba', 'rehoboam']);
  });

  it('reports every id in the tree, and empty trees', () => {
    const tree = buildFamilyTree(people.obed, lookup);
    expect(treeIds(tree)).toEqual(['obed', 'boaz', 'ruth', 'jesse', 'eliab', 'david']);
    expect(isEmptyTree(tree)).toBe(false);
    expect(isEmptyTree(buildFamilyTree(people.lonely, lookup))).toBe(true);
  });
});
