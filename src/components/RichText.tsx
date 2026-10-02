import { Fragment } from 'react';
import { Linking, Platform, StyleSheet, Text, type TextStyle, View } from 'react-native';

import { refHref, wordHref } from '@/features/nav/hrefs';
import { go } from '@/features/nav/navigate';
import { t } from '@/i18n';
import type { Block, Inline } from '@/lib/data/types';
import { linkProps } from '@/lib/platform/press';
import { useTheme } from '@/theme';

/** Font and direction for original-language runs inside English text. */
export function useScriptStyle() {
  const { fonts } = useTheme();
  return (l?: 'hbo' | 'grc'): TextStyle | null =>
    l === 'hbo'
      ? { fontFamily: fonts.hebrew, writingDirection: 'rtl' }
      : l === 'grc'
        ? { fontFamily: fonts.greek }
        : null;
}

/** In-app link press: the web anchor's own navigation would reload the page (losing tabs), so cancel it. */
function inApp(e: { preventDefault?: () => void } | undefined, href: string) {
  e?.preventDefault?.();
  go(href);
}

/** One inline run: plain text, emphasis, or a link to a verse, a Strong's entry, or a page. */
export function InlineRun({ run, size }: { run: Inline; size: number }) {
  const { palette } = useTheme();
  const script = useScriptStyle();
  if (typeof run === 'string') return <>{run}</>;
  const style: TextStyle = {
    ...(run.i ? { fontStyle: 'italic' } : null),
    ...(run.b ? { fontWeight: '600' } : null),
    ...(run.sup ? { fontSize: size * 0.7 } : null),
    ...script(run.l),
  };
  const link: TextStyle = { textDecorationLine: 'underline', textDecorationColor: palette.gold } as TextStyle;
  if (run.ref) {
    const href = refHref(run.ref);
    return (
      <Text role="link" style={[style, link]} onPress={(e) => inApp(e, href)} {...(Platform.OS === 'web' ? linkProps(href, false) : null)}>
        {run.t}
      </Text>
    );
  }
  if (run.s) {
    const href = wordHref(run.s);
    return (
      <Text role="link" style={[style, link]} onPress={(e) => inApp(e, href)} {...(Platform.OS === 'web' ? linkProps(href, false) : null)}>
        {run.t}
      </Text>
    );
  }
  if (run.href) {
    const internal = run.href.startsWith('/');
    return (
      <Text
        role="link"
        style={[style, link]}
        accessibilityLabel={internal ? undefined : t('common.externalLink', { label: run.t })}
        onPress={internal ? (e) => inApp(e, run.href!) : Platform.OS === 'web' ? undefined : () => Linking.openURL(run.href!)}
        {...(Platform.OS === 'web' ? linkProps(run.href, !internal) : null)}
      >
        {run.t}
      </Text>
    );
  }
  return <Text style={style}>{run.t}</Text>;
}

export function Inlines({ runs, size }: { runs: Inline[]; size: number }) {
  return (
    <>
      {runs.map((r, i) => (
        <InlineRun key={i} run={r} size={size} />
      ))}
    </>
  );
}

/** Renders source rich text (lexicons, commentaries, dictionaries). */
export function RichText({ blocks, size: base = 16, serif = false, testID }: { blocks: Block[]; size?: number; serif?: boolean; testID?: string }) {
  const { palette, fonts, scale } = useTheme();
  const size = base * scale;
  const family = serif ? fonts.scripture : fonts.ui;
  return (
    <View testID={testID}>
      {blocks.map((b, i) => {
        const text = (
          <Text
            role={b.k === 'h' ? 'heading' : undefined}
            aria-level={b.k === 'h' ? 3 : undefined}
            style={[
              { color: palette.text, fontFamily: family, fontSize: size, lineHeight: Math.round(size * 1.6) },
              b.k === 'h' && { fontWeight: '600', fontFamily: fonts.ui, marginTop: 8 },
            ]}
          >
            <Inlines runs={b.c} size={size} />
          </Text>
        );
        if (b.k === 'li') {
          return (
            <View key={i} style={[styles.li, { paddingLeft: 14 + (b.d ?? 0) * 18 }]}>
              <Text style={[styles.bullet, { color: palette.muted }]}>•</Text>
              <View style={{ flex: 1 }}>{text}</View>
            </View>
          );
        }
        if (b.k === 'q') {
          return (
            <View key={i} style={[styles.quote, { borderColor: palette.gold }]}>
              {text}
            </View>
          );
        }
        return (
          <Fragment key={i}>
            <View style={styles.p}>{text}</View>
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  p: { marginBottom: 10 },
  li: { flexDirection: 'row', marginBottom: 6 },
  bullet: { width: 14, marginLeft: -14 },
  quote: { borderLeftWidth: 2, paddingLeft: 12, marginBottom: 10 },
});
