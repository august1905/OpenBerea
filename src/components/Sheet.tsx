import { type ReactNode, useEffect, useRef } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { focusNode } from '@/lib/platform/dom';
import { useTheme } from '@/theme';

import { Icon } from './Icon';

/**
 * Tools appear only when called up: a bottom sheet on phones, a side panel on wide screens.
 * Content is held in memory only and cleared when the sheet closes.
 */
export function Sheet({
  visible,
  title,
  onClose,
  children,
  testID,
  wide,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  testID: string;
  /** Use more width on desktop (e.g. word studies). */
  wide?: boolean;
}) {
  const { palette, fonts } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const closeRef = useRef<View>(null);
  const side = width >= 900;

  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => focusNode(closeRef.current), 30);
    return () => clearTimeout(id);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={[styles.root, side ? styles.rootSide : null]}>
        {/* Backdrop: tap to close. Hidden from assistive tech, which uses the Close button or Escape. */}
        <Pressable
          aria-hidden
          focusable={false}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim }]}
        />
        <View
          testID={testID}
          role="dialog"
          aria-modal
          aria-label={title}
          style={[
            styles.panel,
            side
              ? [styles.side, { width: wide ? Math.min(560, width * 0.45) : 440 }]
              : [styles.bottom, { paddingBottom: insets.bottom }],
            { backgroundColor: palette.surface, borderColor: palette.rule },
          ]}
        >
          <View style={styles.header}>
            <Text role="heading" aria-level={2} numberOfLines={2} style={[styles.title, { color: palette.text, fontFamily: fonts.ui }]}>
              {title}
            </Text>
            <Pressable
              ref={closeRef}
              testID={`${testID}-close`}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              onPress={onClose}
              style={styles.close}
            >
              <Icon name="close" color={palette.text} />
            </Pressable>
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  rootSide: { flexDirection: 'row', justifyContent: 'flex-end' },
  panel: { borderWidth: 1, overflow: 'hidden' },
  bottom: { maxHeight: '82%', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  side: { height: '100%', borderTopLeftRadius: 20, borderBottomLeftRadius: 20 },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, paddingTop: 10, minHeight: 56 },
  title: { flex: 1, fontSize: 18, fontWeight: '600' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: 20, paddingBottom: 28 },
});
