import type { IconName } from '@/components/Icon';
import { bookShort, type MessageKey, t } from '@/i18n';
import { toBookCode } from '@/lib/bible/books';

export type TabKind = 'passage' | 'interlinear' | 'word' | 'page';

const PAGE_LABELS: [RegExp, MessageKey][] = [
  [/^\/search/, 'tabs.search'],
  [/^\/study/, 'tabs.study'],
  [/^\/memorize/, 'tabs.memorize'],
  [/^\/resources/, 'tabs.resources'],
  [/^\/about/, 'tabs.about'],
];

/** Short label and view kind for a tab's location, e.g. "/read/jhn/3" → { label: "Jn 3", kind: "passage" }. */
export function describeHref(href: string): { label: string; kind: TabKind; icon: IconName } {
  const path = href.split('?')[0].split('#')[0];
  const read = /^\/(read|interlinear)\/([^/]+)\/(\d+)/.exec(path);
  if (read) {
    const book = toBookCode(read[2]);
    const label = book ? `${bookShort(book)} ${read[3]}` : read[2];
    return read[1] === 'read'
      ? { label, kind: 'passage', icon: 'passage' }
      : { label, kind: 'interlinear', icon: 'interlinear' };
  }
  const word = /^\/word\/([GH]\d+[a-zA-Z]?)/.exec(path);
  if (word) return { label: word[1].toUpperCase(), kind: 'word', icon: 'word' };
  for (const [re, key] of PAGE_LABELS) if (re.test(path)) return { label: t(key), kind: 'page', icon: 'page' };
  return { label: t('tabs.home'), kind: 'page', icon: 'page' };
}

export function tabAccessibleLabel(href: string): string {
  const { label, kind } = describeHref(href);
  return t('tabs.item', { label, kind: t(`tabs.kind.${kind}` as MessageKey) });
}
