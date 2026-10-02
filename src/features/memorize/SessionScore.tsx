import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Body, TextButton } from '@/components/ui';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

import { clearSession, percent, useSession } from './session';

/** Accuracy and missed words for this visit only, with a clear action. Nothing is saved. */
export function SessionScore() {
  const { palette, fonts } = useTheme();
  const s = useSession();
  return (
    <View testID="session-score" style={[styles.panel, { borderColor: palette.rule }]}>
      <View style={styles.head}>
        <Text role="heading" aria-level={2} style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 19, fontWeight: '600', flex: 1 }}>
          {t('mem.session.heading')}
        </Text>
        <TextButton testID="session-clear" label={t('mem.session.clear')} accessibilityLabel={t('mem.session.clearLabel')} onPress={clearSession} />
      </View>
      <View style={styles.note}>
        <Icon name="info" size={16} color={palette.muted} />
        <Body muted style={{ fontSize: 14, lineHeight: 20, flex: 1 }}>
          {t('mem.session.note')}
        </Body>
      </View>
      {s.accuracy === null ? (
        <View testID="session-empty" style={{ marginTop: 10 }}>
          <Body>{t('mem.session.empty')}</Body>
        </View>
      ) : (
        <View aria-live="polite">
          <View style={styles.stats}>
            <View>
              <Text style={[styles.label, { color: palette.muted, fontFamily: fonts.ui }]}>{t('mem.session.accuracy')}</Text>
              <Text testID="session-accuracy" style={{ color: palette.text, fontFamily: fonts.scripture, fontSize: 34 }}>
                {`${percent(s.accuracy)}%`}
              </Text>
            </View>
            <View style={{ gap: 2 }}>
              <Body>{t('mem.session.right', { correct: s.correct, answered: s.answered })}</Body>
              <Body muted>{s.passages === 1 ? t('mem.session.passage') : t('mem.session.passages', { n: s.passages })}</Body>
            </View>
          </View>
          <Text style={[styles.label, { color: palette.muted, fontFamily: fonts.ui, marginTop: 14 }]}>{t('mem.session.missed')}</Text>
          {s.missed.length ? (
            <View testID="session-missed" style={styles.missed}>
              {s.missed.map((m) => (
                <View
                  key={m.word}
                  role="img"
                  aria-label={m.count > 1 ? t('mem.session.missedItem', { word: m.word, n: m.count }) : t('mem.session.missedOnce', { word: m.word })}
                  style={[styles.chip, { borderColor: palette.rule, backgroundColor: palette.surface }]}
                >
                  <Text style={{ color: palette.text, fontFamily: fonts.scripture, fontSize: 16 }}>{m.word}</Text>
                  {m.count > 1 ? <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 13 }}>{t('mem.session.count', { n: m.count })}</Text> : null}
                </View>
              ))}
            </View>
          ) : (
            <View testID="session-missed-none">
              <Body>{t('mem.session.noMissed')}</Body>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 18, marginTop: 28 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 4 },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 24, marginTop: 12, flexWrap: 'wrap' },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
  missed: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'baseline', gap: 4, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 4 },
});
