import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { applyUpdate, dismissUpdate, useOfflineStatus } from '@/lib/platform/offline';
import { pressStyle } from '@/lib/platform/press';
import { useTheme } from '@/theme';

import { Icon } from './Icon';

/**
 * A small notice at the bottom of the screen when a new version is ready and switching now could
 * interrupt the reader (see offline.web.ts). "Reload" switches; the close button hides it for this
 * visit, and the update then waits for the next time the site opens.
 */
export function UpdateNotice() {
  const { palette, fonts } = useTheme();
  const s = useOfflineStatus();
  if (s.update !== 'ready' || s.dismissed) return null;
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View testID="update-notice" role="status" style={[styles.notice, { backgroundColor: palette.surface, borderColor: palette.gold }]}>
        <Text style={[styles.text, { color: palette.text, fontFamily: fonts.ui }]}>{t('update.ready')}</Text>
        <Pressable
          testID="update-reload"
          accessibilityRole="button"
          onPress={applyUpdate}
          style={pressStyle(({ hovered, focused, pressed }) => [styles.reload, { borderColor: palette.gold }, (hovered || focused || pressed) && { backgroundColor: palette.highlight }])}
        >
          <Text style={[styles.reloadText, { color: palette.text, fontFamily: fonts.ui }]}>{t('update.reload')}</Text>
        </Pressable>
        <Pressable
          testID="update-dismiss"
          accessibilityRole="button"
          accessibilityLabel={t('update.notNow')}
          onPress={dismissUpdate}
          style={pressStyle(({ hovered, focused }) => [styles.close, (hovered || focused) && { backgroundColor: palette.highlight }])}
        >
          <Icon name="close" size={16} color={palette.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Centered at the bottom, clear of the corner menus.
  wrap: { position: 'absolute', left: 72, right: 72, bottom: 14, alignItems: 'center', zIndex: 40 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 4, paddingVertical: 4, borderRadius: 22, borderWidth: 1, maxWidth: 440 },
  text: { flexShrink: 1, fontSize: 14, lineHeight: 19 },
  reload: { paddingHorizontal: 12, minHeight: 36, justifyContent: 'center', borderRadius: 18, borderWidth: 1 },
  reloadText: { fontSize: 14, fontWeight: '600' },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
