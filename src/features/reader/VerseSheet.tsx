import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { t } from '@/i18n';
import { formatRef } from '@/i18n/format';
import { pressStyle } from '@/lib/platform/press';
import { useTheme } from '@/theme';

import { interlinearHref, readHref } from '../nav/hrefs';
import { go, openInNewTab } from '../nav/navigate';
import { type VerseAction, type VerseContext, verseActions, versePanels } from './verseActions';

/** Study tools for one verse, shown only when called up from the verse number. */
export function VerseSheet({ visible, ctx, onClose }: { visible: boolean; ctx: VerseContext | null; onClose: () => void }) {
  const { palette, fonts } = useTheme();
  if (!ctx) return null;
  const builtIn: VerseAction[] = [
    { id: 'newtab', label: t('reader.actions.newTab'), icon: 'plus', onPress: () => openInNewTab(readHref(ctx.book, ctx.chapter, { v: ctx.verse })) },
    { id: 'interlinear', label: t('reader.actions.interlinear'), icon: 'interlinear', onPress: () => go(interlinearHref(ctx.book, ctx.chapter, ctx.verse)) },
  ];
  const all = [...builtIn, ...verseActions(ctx)];
  return (
    <Sheet testID="verse-sheet" visible={visible} title={formatRef({ book: ctx.book, chapter: ctx.chapter, verse: ctx.verse })} onClose={onClose}>
      <View style={styles.actions}>
        {all.map((a) => (
          <Pressable
            key={a.id}
            testID={`verse-action-${a.id}`}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              a.onPress();
            }}
            style={pressStyle(({ hovered, focused, pressed }) => [
              styles.action,
              { borderColor: palette.rule, backgroundColor: hovered || focused || pressed ? palette.highlight : 'transparent' },
            ])}
          >
            <Icon name={a.icon} size={18} color={palette.text} />
            <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 15 }}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
      {versePanels().map((p) => (
        <Fragment key={p.id}>{p.render(ctx, onClose)}</Fragment>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, minHeight: 44 },
});
