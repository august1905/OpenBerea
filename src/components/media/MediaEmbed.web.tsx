import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { pressStyle } from '@/lib/platform/press';
import { useTheme } from '@/theme';

import { Icon } from '../Icon';
import type { MediaEmbedProps } from './types';

/**
 * Whole, unaltered media from the original host. YouTube loads only after the viewer asks
 * (privacy-enhanced youtube-nocookie.com); audio streams from the publisher with preload="none".
 */
export function MediaEmbed({ embed, title, testID }: MediaEmbedProps) {
  const { palette, fonts } = useTheme();
  const [loaded, setLoaded] = useState(false);
  if (embed.kind === 'audio') {
    return (
      <View testID={testID} style={styles.audio}>
        <audio controls preload="none" src={embed.src} aria-label={t('media.audioLabel', { title })} style={{ width: '100%' }} />
      </View>
    );
  }
  if (!loaded) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={t('media.playVideo', { title })}
        onPress={() => setLoaded(true)}
        style={pressStyle(({ hovered, focused }) => [
          styles.facade,
          { borderColor: palette.rule, backgroundColor: hovered || focused ? palette.highlight : palette.surface },
        ])}
      >
        <View style={[styles.play, { borderColor: palette.gold }]}>
          <Icon name="play" size={22} color={palette.text} />
        </View>
        <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>{t('media.loadVideo')}</Text>
        <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 13, textAlign: 'center' }}>{t('media.videoPrivacy')}</Text>
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={styles.frame}>
      <iframe
        title={title}
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(embed.id)}?autoplay=1&rel=0`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, borderRadius: 12 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  audio: { marginVertical: 8 },
  facade: { aspectRatio: 16 / 9, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, marginVertical: 8 },
  play: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  frame: { position: 'relative', aspectRatio: 16 / 9, marginVertical: 8 },
});
