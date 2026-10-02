import { useLocalSearchParams } from 'expo-router';

import { ErrorState, Heading, Screen } from '@/components/ui';
import { t } from '@/i18n';
import { bookInfo, type BookCode, toBookCode } from '@/lib/bible/books';

/** Book, chapter, and optional verse (?v=) from a /study/<tool>/[book]/[chapter] route. */
export function usePassageParams(): { book: BookCode; chapter: number; v?: number; params: Record<string, string | undefined> } | null {
  const params = useLocalSearchParams<{ book: string; chapter: string; v?: string }>();
  const book = toBookCode(params.book);
  const chapter = Number(params.chapter);
  if (!book || !Number.isInteger(chapter) || chapter < 1 || chapter > bookInfo(book).chapters) return null;
  const v = Number(params.v);
  return { book, chapter, v: Number.isInteger(v) && v > 0 ? v : undefined, params: params as Record<string, string | undefined> };
}

export function NotFoundScreen({ message }: { message?: string }) {
  return (
    <Screen title={t('notFound.title')}>
      <Heading>{t('notFound.title')}</Heading>
      <ErrorState message={message ?? t('study.notFound')} />
    </Screen>
  );
}
