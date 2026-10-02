import type { PersonSummary } from '@/lib/data/types';

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Items whose name matches the typed text: names starting with it first, then names containing it;
 * within each, the most-mentioned first. With no text, `empty` decides the order.
 */
export function searchByName<T extends { name: string; n: number }>(items: T[], query: string, empty: 'alpha' | 'mentions' = 'alpha'): T[] {
  const q = fold(query.trim());
  const byMentions = (a: T, b: T) => b.n - a.n || a.name.localeCompare(b.name);
  if (!q) return [...items].sort(empty === 'alpha' ? (a, b) => a.name.localeCompare(b.name) || b.n - a.n : byMentions);
  const starts: T[] = [];
  const contains: T[] = [];
  for (const item of items) {
    const name = fold(item.name);
    if (name.startsWith(q)) starts.push(item);
    else if (name.includes(q)) contains.push(item);
  }
  return [...starts.sort(byMentions), ...contains.sort(byMentions)];
}

/** People index search: everyone alphabetically, or the typed name's matches. */
export function searchPeople(index: PersonSummary[], query: string): PersonSummary[] {
  return searchByName(index, query, 'alpha');
}
