import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body, ErrorState, Loading, TextButton } from '@/components/ui';
import { t } from '@/i18n';
import { formatRef } from '@/i18n/format';
import type { BookCode } from '@/lib/bible/books';
import type { ChapterText, OpenBibleXrefChapter, TskChapter } from '@/lib/data/types';
import { useTheme } from '@/theme';

import { refHref } from '../nav/hrefs';
import { chapterKey, OPENBIBLE_TOP, previewText, verseXrefs } from './crossrefs';
import { studyPaths, useOptionalData, usePreviewChapters } from './data';
import { NewTabButton, RowLink } from './parts';

/** One cross-reference: the ref and a short KJV preview (a link), plus "open in new tab". */
function XrefRow({
  compact,
  source,
  chapters,
  before,
}: {
  compact: string;
  source: 'tsk' | 'ob';
  chapters: Map<string, ChapterText>;
  before?: () => void;
}) {
  const { palette, fonts, scale } = useTheme();
  const label = formatRef(compact);
  const key = chapterKey(compact);
  const preview = key ? previewText(compact, chapters.get(key)) : null;
  const href = refHref(compact);
  return (
    <View style={[styles.row, { borderColor: palette.rule }]} testID={`xref-${source}-${compact}`}>
      <RowLink href={href} before={before} style={styles.rowLink} testID={`xref-link-${source}-${compact}`}>
        <Text style={{ color: palette.text, fontFamily: fonts.ui, fontWeight: '600', fontSize: 15 * Math.min(scale, 1.3) }}>{label}</Text>
        <Text
          style={{
            color: preview ? palette.text : palette.muted,
            fontFamily: fonts.scripture,
            fontSize: 15 * scale,
            lineHeight: 23 * scale,
            marginTop: 2,
          }}
        >
          {preview ?? '…'}
        </Text>
      </RowLink>
      <NewTabButton href={href} label={label} before={before} testID={`xref-newtab-${source}-${compact}`} />
    </View>
  );
}

function SourceHeading({ children }: { children: string }) {
  const { palette, fonts } = useTheme();
  return (
    <Text role="heading" aria-level={4} style={[styles.source, { color: palette.muted, fontFamily: fonts.ui }]}>
      {children}
    </Text>
  );
}

/**
 * Cross-references for one verse: Treasury of Scripture Knowledge, then OpenBible.info (top ten
 * by votes, then all). `before` runs before navigating (e.g. closing the verse sheet).
 */
export function VerseXrefs({ book, chapter, verse, before, testID = 'xrefs' }: { book: BookCode; chapter: number; verse: number; before?: () => void; testID?: string }) {
  const tsk = useOptionalData<TskChapter>(studyPaths.tsk(book, chapter));
  const ob = useOptionalData<OpenBibleXrefChapter>(studyPaths.openbible(book, chapter));
  const [all, setAll] = useState(false);
  const refs = verseXrefs(tsk.data ?? undefined, ob.data ?? undefined, verse);
  const obShown = all ? refs.openbible : refs.openbible.slice(0, OPENBIBLE_TOP);
  const chapters = usePreviewChapters([...refs.tsk, ...obShown.map((r) => r[0])]);

  if (tsk.status === 'error' || ob.status === 'error') return <ErrorState onRetry={() => (tsk.status === 'error' ? tsk.reload() : ob.reload())} />;
  if (tsk.status === 'loading' || ob.status === 'loading') return <Loading />;
  if (!refs.tsk.length && !refs.openbible.length) return <Body muted>{t('study.xref.none')}</Body>;

  return (
    <View testID={testID}>
      {refs.tsk.length ? (
        <View testID={`${testID}-tsk`} style={styles.group}>
          <SourceHeading>{t('study.xref.tsk')}</SourceHeading>
          {refs.tsk.map((r) => (
            <XrefRow key={r} compact={r} source="tsk" chapters={chapters} before={before} />
          ))}
        </View>
      ) : null}
      {refs.openbible.length ? (
        <View testID={`${testID}-ob`} style={styles.group}>
          <SourceHeading>{t('study.xref.openbible')}</SourceHeading>
          {obShown.map(([r]) => (
            <XrefRow key={r} compact={r} source="ob" chapters={chapters} before={before} />
          ))}
          {refs.openbible.length > OPENBIBLE_TOP ? (
            <TextButton
              testID={`${testID}-ob-all`}
              label={all ? t('study.xref.showFewer', { n: OPENBIBLE_TOP }) : t('study.xref.showAll', { n: refs.openbible.length })}
              onPress={() => setAll((a) => !a)}
              style={styles.more}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: 12 },
  source: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 12, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  rowLink: { flex: 1, borderBottomWidth: 0 },
  more: { alignSelf: 'flex-start', marginTop: 6, marginLeft: -8, minHeight: 44, justifyContent: 'center' },
});
