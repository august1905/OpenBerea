import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, type ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Body, Button, Heading, Screen } from '@/components/ui';
import { type MessageKey, t } from '@/i18n';
import { formatRef } from '@/i18n/format';
import { fromCompact, parseReference, toCompact } from '@/lib/bible/refs';
import { verseCount } from '@/lib/bible/versification';
import type { TranslationId } from '@/lib/data/types';
import { pressStyle } from '@/lib/platform/press';
import { useTheme } from '@/theme';

import { go } from '../nav/navigate';
import { refVerseTotal } from './check';
import { isChapterLength } from './chunks';
import { type Mode, modeName, MODES, practiceHref, TRANSLATIONS, trName, trShort } from './modes';
import { Choices, practiceStyles } from './parts';
import { SessionScore } from './SessionScore';
import { STARTER_SETS } from './starters';

/** /memorize: pick a passage, starter sets, and the session score. */
export function MemorizeScreen() {
  const { palette, fonts, scale } = useTheme();
  const { view } = useLocalSearchParams<{ view?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const [startersY, setStartersY] = useState<number | null>(null);
  const [value, setValue] = useState('');
  const [tr, setTr] = useState<TranslationId>('kjv');
  const [mode, setMode] = useState<Mode>('first-letter');
  const ref = value.trim() ? parseReference(value, verseCount) : null;
  const verses = ref ? refVerseTotal(ref) : 0;

  useEffect(() => {
    if (view === 'starters' && startersY !== null) scrollRef.current?.scrollTo({ y: startersY, animated: false });
  }, [view, startersY]);

  const start = () => {
    if (ref) go(practiceHref({ ref: toCompact(ref), tr, mode }));
  };

  return (
    <Screen ref={scrollRef} title={t('mem.title')}>
      <Heading>{t('mem.title')}</Heading>
      <Body muted>{t('mem.intro')}</Body>
      <View testID="nothing-saved" style={[styles.note, { borderColor: palette.gold }]}>
        <Icon name="info" size={18} color={palette.text} />
        <Body style={{ flex: 1, fontSize: 15, lineHeight: 22 }}>{t('mem.nothingSaved')}</Body>
      </View>

      <Heading level={2}>{t('mem.pick.heading')}</Heading>
      <Text nativeID="mem-pick-label" style={[practiceStyles.label, { color: palette.muted, fontFamily: fonts.ui }]}>
        {t('mem.pick.label')}
      </Text>
      <TextInput
        testID="memorize-ref"
        aria-labelledby="mem-pick-label"
        accessibilityLabel={t('mem.pick.label')}
        value={value}
        onChangeText={setValue}
        onSubmitEditing={start}
        placeholder={t('mem.pick.placeholder')}
        placeholderTextColor={palette.muted}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="go"
        style={[practiceStyles.input, { color: palette.text, borderColor: palette.gold, backgroundColor: palette.surface, fontFamily: fonts.ui, fontSize: 18 * Math.min(scale, 1.4) }]}
      />
      <View style={styles.hint} aria-live="polite">
        {value.trim() ? (
          ref ? (
            <>
              <View testID="memorize-ref-preview">
                <Body>{verses === 1 ? t('mem.pick.verse', { ref: formatRef(ref) }) : t('mem.pick.verses', { ref: formatRef(ref), n: verses })}</Body>
              </View>
              {isChapterLength(ref.verse === undefined, verses) ? (
                <Body muted style={{ fontSize: 14 }}>
                  {t('mem.pick.chapterMode')}
                </Body>
              ) : null}
            </>
          ) : (
            <Body muted>{t('mem.pick.invalid')}</Body>
          )
        ) : null}
      </View>
      <Choices
        label={t('mem.pick.translation')}
        testIDPrefix="pick-tr"
        value={tr}
        onChange={setTr}
        options={TRANSLATIONS.map((v) => ({ id: v, label: trShort(v), a11y: trName(v) }))}
      />
      <Choices
        label={t('mem.pick.mode')}
        testIDPrefix="pick-mode"
        value={mode}
        onChange={setMode}
        options={MODES.map((m) => ({ id: m, label: modeName(m) }))}
      />
      <Body muted style={{ fontSize: 14, marginBottom: 14 }}>
        {t(`mem.modeHint.${mode}` as MessageKey)}
      </Body>
      <Button
        testID="memorize-start"
        label={t('mem.pick.start')}
        accessibilityLabel={ref ? t('mem.pick.startLabel', { ref: formatRef(ref), tr: trName(tr), mode: modeName(mode) }) : t('mem.pick.start')}
        onPress={start}
        disabled={!ref}
      />

      <SessionScore />

      <View testID="starter-sets" onLayout={(e) => setStartersY(e.nativeEvent.layout.y)} style={{ marginTop: 12 }}>
        <Heading level={2}>{t('mem.starters.heading')}</Heading>
        <Body muted style={{ marginBottom: 8 }}>
          {t('mem.starters.intro')}
        </Body>
        {STARTER_SETS.map((set) => {
          const r = fromCompact(set.ref);
          const label = r ? formatRef(r) : set.ref;
          return (
            <Pressable
              key={set.id}
              testID={`starter-${set.id}`}
              accessibilityRole="link"
              accessibilityLabel={t('mem.starters.label', { ref: label, title: set.title })}
              onPress={() => go(practiceHref({ ref: set.ref, tr, mode }))}
              style={pressStyle(({ hovered, focused, pressed }) => [
                styles.starter,
                { borderColor: palette.rule },
                (hovered || focused || pressed) && { backgroundColor: palette.highlight },
              ])}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: palette.text, fontFamily: fonts.scripture, fontSize: 18 * Math.min(scale, 1.3) }}>{set.title}</Text>
                <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 14, marginTop: 2 }}>
                  <Text style={{ color: palette.text, fontWeight: '600' }}>{label}</Text>
                  {set.note ? ` · ${set.note}` : ''}
                </Text>
              </View>
              <Icon name="forward" size={18} color={palette.muted} />
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 4, marginTop: 16, marginBottom: 8 },
  hint: { minHeight: 24, marginTop: 8, marginBottom: 4 },
  starter: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 6 },
});
