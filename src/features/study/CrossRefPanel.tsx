import { StyleSheet, View } from 'react-native';

import { Heading } from '@/components/ui';
import { bookName, t } from '@/i18n';

import type { VerseContext } from '../reader/verseActions';
import { crossrefsHref } from './hrefs';
import { Credit, InlineLink } from './parts';
import { VerseXrefs } from './XrefList';

/** Cross-references in the verse tools sheet (opened by tapping a verse number). */
export function CrossRefPanel({ ctx, close }: { ctx: VerseContext; close: () => void }) {
  const label = `${bookName(ctx.book)} ${ctx.chapter}`;
  return (
    <View testID="verse-xref-panel" style={styles.panel}>
      <Heading level={3}>{t('study.xref.title')}</Heading>
      <VerseXrefs key={`${ctx.book}.${ctx.chapter}.${ctx.verse}`} book={ctx.book} chapter={ctx.chapter} verse={ctx.verse} before={close} testID="verse-xrefs" />
      <InlineLink testID="verse-xrefs-page" href={crossrefsHref(ctx.book, ctx.chapter, ctx.verse)} style={styles.page}>
        {t('study.xref.allForChapter', { label })}
      </InlineLink>
      <Credit testID="verse-xrefs-credit">{t('study.xref.credit')}</Credit>
    </View>
  );
}

export function renderCrossRefPanel(ctx: VerseContext, close: () => void) {
  return <CrossRefPanel ctx={ctx} close={close} />;
}

const styles = StyleSheet.create({
  panel: { marginTop: 8 },
  page: { fontSize: 14, marginTop: 4 },
});
