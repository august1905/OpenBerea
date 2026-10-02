import Head from 'expo-router/head';
import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { linkProps, pressStyle } from '@/lib/platform/press';
import { useTheme } from '@/theme';
import { READING_WIDTH } from '@/theme/typography';

/** Sets the browser tab title (web) for the current screen. */
export function PageTitle({ title }: { title: string }) {
  if (Platform.OS !== 'web') return null;
  return (
    <Head>
      <title>{`${title} · ${t('app.name')}`}</title>
    </Head>
  );
}

/**
 * Scrolling page with a centered reading column and room at the bottom for the corner menus.
 */
export const Screen = forwardRef<ScrollView, ScrollViewProps & { children: ReactNode; width?: number; title?: string }>(
  function Screen({ children, width = READING_WIDTH, title, contentContainerStyle, ...rest }, ref) {
    const insets = useSafeAreaInsets();
    const { palette } = useTheme();
    return (
      <>
        {title ? <PageTitle title={title} /> : null}
        <ScrollView
          ref={ref}
          style={{ flex: 1, backgroundColor: palette.bg }}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 120 },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          {...rest}
        >
          <View role="main" style={[styles.column, { maxWidth: width }]}>
            {children}
          </View>
        </ScrollView>
      </>
    );
  },
);

export function Heading({ children, level = 1, style }: { children: ReactNode; level?: 1 | 2 | 3; style?: TextStyle }) {
  const { palette, fonts, scale } = useTheme();
  const size = level === 1 ? 30 : level === 2 ? 21 : 17;
  return (
    <Text
      role="heading"
      aria-level={level}
      style={[
        {
          color: palette.text,
          fontFamily: level === 1 ? fonts.scripture : fonts.ui,
          fontSize: size * Math.min(scale, 1.3),
          fontWeight: level === 1 ? '500' : '600',
          marginBottom: level === 1 ? 6 : 10,
          marginTop: level === 1 ? 0 : 18,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: TextStyle }) {
  const { palette, fonts, scale } = useTheme();
  return (
    <Text style={[{ color: muted ? palette.muted : palette.text, fontFamily: fonts.ui, fontSize: 16 * scale, lineHeight: 24 * scale }, style]}>
      {children}
    </Text>
  );
}

/** Low-key text button: underlined on hover/focus, gold underline when active. */
export function TextButton({
  label,
  onPress,
  active,
  accessibilityLabel,
  testID,
  style,
  size = 15,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  style?: ViewStyle;
  size?: number;
}) {
  const { palette, fonts } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      aria-current={active ? 'true' : undefined}
      onPress={onPress}
      style={pressStyle(({ hovered, focused, pressed }) => [
        styles.textButton,
        (hovered || focused || pressed) && { backgroundColor: palette.highlight },
        style,
      ])}
    >
      <Text
        style={{
          color: active ? palette.text : palette.muted,
          fontFamily: fonts.ui,
          fontSize: size,
          fontWeight: active ? '600' : '500',
        }}
      >
        {label}
      </Text>
      <View style={[styles.underline, { backgroundColor: active ? palette.gold : 'transparent' }]} />
    </Pressable>
  );
}

/** Bordered button for primary actions inside panels. */
export function Button({
  label,
  onPress,
  icon,
  testID,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  testID?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const { palette, fonts } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={pressStyle(({ hovered, focused, pressed }) => [
        styles.button,
        { borderColor: palette.gold, backgroundColor: hovered || focused || pressed ? palette.highlight : palette.surface },
        disabled && { opacity: 0.5 },
      ])}
    >
      {icon}
      <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 15, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Loading({ label }: { label?: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.center} accessibilityLabel={label ?? t('common.loading')} role="status">
      <ActivityIndicator color={palette.gold} />
    </View>
  );
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  return (
    <View style={styles.center} role="alert">
      <Body muted>{message ?? t('common.error')}</Body>
      {onRetry ? <Button label={t('common.retry')} onPress={onRetry} /> : null}
    </View>
  );
}

/** Link to another site. Opens in a new window on the web. */
export function ExternalLink({ href, label, style, testID }: { href: string; label: string; style?: TextStyle; testID?: string }) {
  const { palette, fonts } = useTheme();
  return (
    <Text
      testID={testID}
      role="link"
      {...(Platform.OS === 'web' ? linkProps(href) : null)}
      accessibilityLabel={t('common.externalLink', { label })}
      onPress={Platform.OS === 'web' ? undefined : () => Linking.openURL(href)}
      style={[{ color: palette.text, fontFamily: fonts.ui, textDecorationLine: 'underline', textDecorationColor: palette.gold } as TextStyle, style]}
    >
      {label}
    </Text>
  );
}

export function Rule() {
  const { palette } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.rule, marginVertical: 20 }} />;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 20 },
  column: { width: '100%' },
  textButton: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
  underline: { height: 2, width: '70%', marginTop: 2, borderRadius: 1 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignSelf: 'flex-start',
  },
  center: { padding: 32, alignItems: 'center', gap: 16 },
});
