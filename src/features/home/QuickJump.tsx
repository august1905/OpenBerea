import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { TextButton } from '@/components/ui';
import { t } from '@/i18n';
import { formatRef } from '@/i18n/format';
import { parseReference } from '@/lib/bible/refs';
import { verseCount } from '@/lib/bible/versification';
import { useTheme } from '@/theme';

import { readHref, searchHref } from '../nav/hrefs';
import { go } from '../nav/navigate';

/** Quick jump by typed reference ("Jn 3:16"), accepting common book abbreviations. */
export function QuickJump({ autoFocus }: { autoFocus?: boolean }) {
  const { palette, fonts, scale } = useTheme();
  const [value, setValue] = useState('');
  const inputRef = useRef<TextInput>(null);
  const ref = value.trim() ? parseReference(value, verseCount) : null;

  useEffect(() => {
    if (!autoFocus) return;
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [autoFocus]);

  const submit = () => {
    if (ref) go(readHref(ref.book, ref.chapter, { v: ref.verse }));
    else if (value.trim()) go(searchHref(value.trim()));
  };

  return (
    <View style={styles.wrap}>
      <Text nativeID="jump-label" style={[styles.label, { color: palette.muted, fontFamily: fonts.ui }]}>
        {t('home.jumpLabel')}
      </Text>
      <TextInput
        ref={inputRef}
        testID="quick-jump"
        aria-labelledby="jump-label"
        accessibilityLabel={t('home.jumpLabel')}
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        placeholder={t('home.jumpPlaceholder')}
        placeholderTextColor={palette.muted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        enterKeyHint="go"
        style={[
          styles.input,
          {
            color: palette.text,
            borderColor: palette.gold,
            backgroundColor: palette.surface,
            fontFamily: fonts.ui,
            fontSize: 18 * Math.min(scale, 1.4),
          },
        ]}
      />
      <View style={styles.hintRow} aria-live="polite">
        {value.trim() ? (
          ref ? (
            <TextButton testID="quick-jump-go" label={`${formatRef(ref)} →`} onPress={submit} accessibilityLabel={t('home.jumpHint', { ref: formatRef(ref) })} active />
          ) : (
            <TextButton testID="quick-jump-search" label={t('home.searchInstead', { q: value.trim() })} onPress={submit} />
          )
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 28 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, letterSpacing: 0.3 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, minHeight: 52 },
  hintRow: { minHeight: 44, marginTop: 6, alignItems: 'flex-start' },
});
