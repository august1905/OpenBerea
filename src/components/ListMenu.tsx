import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { t } from '@/i18n';
import { focusNode } from '@/lib/platform/dom';
import { pressStyle } from '@/lib/platform/press';
import { useTheme } from '@/theme';

import { Icon } from './Icon';
import type { RadialNode } from './radial/types';

interface Props {
  visible: boolean;
  title: string;
  nodes: RadialNode[];
  onClose: () => void;
  /** Extra content under the list (e.g. keyboard shortcuts, "New tab"). */
  footer?: React.ReactNode;
  testID: string;
}

/**
 * Standard list menu: the accessible fallback for the corner menus (spec: Design → Navigation).
 * Same items as the radial menu, as a dialog of buttons that works with a keyboard and screen readers.
 */
export function ListMenu(props: Props) {
  // Mounted fresh on every open, so submenus always start at the top level.
  return props.visible ? <ListMenuContent {...props} /> : null;
}

function ListMenuContent({ title, nodes, onClose, footer, testID }: Props) {
  const { palette, fonts } = useTheme();
  const { width } = useWindowDimensions();
  const [stack, setStack] = useState<RadialNode[]>([]);
  const firstRef = useRef<View>(null);

  const level = stack.length ? (stack[stack.length - 1].children ?? []) : nodes;
  const heading = stack.length ? stack[stack.length - 1].label : title;

  useEffect(() => {
    const id = setTimeout(() => focusNode(firstRef.current), 30);
    return () => clearTimeout(id);
  }, [stack.length]);

  const choose = (node: RadialNode) => {
    if (node.disabled) return;
    if (node.children?.length) {
      setStack((s) => [...s, node]);
      return;
    }
    onClose();
    node.onSelect?.();
  };

  const narrow = width < 600;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
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
          aria-label={heading}
          style={[
            styles.panel,
            narrow ? styles.sheet : styles.card,
            { backgroundColor: palette.surface, borderColor: palette.rule },
          ]}
        >
          <View style={styles.header}>
            {stack.length ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
                onPress={() => setStack((s) => s.slice(0, -1))}
                style={styles.iconButton}
              >
                <Icon name="back" color={palette.text} />
              </Pressable>
            ) : null}
            <Text role="heading" aria-level={2} style={[styles.title, { color: palette.text, fontFamily: fonts.ui }]}>
              {heading}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={styles.iconButton}>
              <Icon name="close" color={palette.text} />
            </Pressable>
          </View>
          <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 8 }}>
            {level.map((node, i) => (
              <View key={node.id} style={[styles.row, { borderColor: palette.rule }]}>
                <Pressable
                  ref={i === 0 ? firstRef : undefined}
                  testID={`${testID}-${node.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !!node.disabled }}
                  aria-current={node.active ? 'true' : undefined}
                  accessibilityLabel={node.children?.length ? t('menu.opensSubmenu', { label: node.label }) : node.label}
                  onPress={() => choose(node)}
                  style={pressStyle(({ pressed, hovered, focused }) => [
                    styles.item,
                    (pressed || hovered || focused) && { backgroundColor: palette.highlight },
                    node.disabled && { opacity: 0.5 },
                  ])}
                >
                  <Icon name={node.icon ?? 'dot'} size={18} color={palette.text} />
                  <Text style={[styles.itemText, { color: palette.text, fontFamily: fonts.ui }]}>{node.label}</Text>
                  {node.active ? <Icon name="check" size={18} color={palette.text} /> : null}
                  {node.children?.length ? <Icon name="forward" size={18} color={palette.muted} /> : null}
                </Pressable>
                {node.onDismiss ? (
                  <Pressable
                    testID={`${testID}-${node.id}-close`}
                    accessibilityRole="button"
                    accessibilityLabel={t('tabs.closeNamed', { label: node.label })}
                    onPress={node.onDismiss}
                    style={pressStyle(({ hovered, focused }) => [
                      styles.iconButton,
                      (hovered || focused) && { backgroundColor: palette.highlight },
                    ])}
                  >
                    <Icon name="close" size={18} color={palette.text} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </ScrollView>
          {footer}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  panel: { borderWidth: 1, maxHeight: '80%', width: '100%', overflow: 'hidden' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  card: { maxWidth: 420, borderRadius: 18, marginBottom: 'auto', marginTop: 'auto' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 8, minHeight: 52 },
  title: { flex: 1, fontSize: 18, fontWeight: '600', paddingHorizontal: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingRight: 8 },
  item: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 48 },
  itemText: { flex: 1, fontSize: 16 },
});
