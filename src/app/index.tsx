import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { Body, Screen, TextButton } from '@/components/ui';
import { go } from '@/features/nav/navigate';
import { BookBrowser } from '@/features/home/BookBrowser';
import { QuickJump } from '@/features/home/QuickJump';
import { VerseOfDay } from '@/features/home/VerseOfDay';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

export default function Home() {
  const { palette, fonts } = useTheme();
  const { jump } = useLocalSearchParams<{ jump?: string }>();
  return (
    <Screen title={t('app.tagline')}>
      <Text role="heading" aria-level={1} style={[styles.title, { color: palette.text, fontFamily: fonts.scripture }]}>
        {t('home.title')}
      </Text>
      <Body muted>{t('app.tagline')}</Body>
      <QuickJump autoFocus={jump === '1'} />
      <VerseOfDay />
      <BookBrowser />
      <Body muted style={{ marginTop: 40, fontSize: 14 }}>
        {t('home.footer')}
      </Body>
      <TextButton testID="home-about" label={t('home.about')} onPress={() => go('/about')} style={{ alignSelf: 'flex-start', marginLeft: -8, marginTop: 4 }} size={14} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 40, fontWeight: '500', marginBottom: 4 },
});
