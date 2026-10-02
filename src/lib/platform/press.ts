import type { PressableStateCallbackType, StyleProp, ViewStyle } from 'react-native';

/** react-native-web adds hovered/focused to Pressable's state; React Native's types only declare pressed. */
export type PressState = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };

export function pressStyle(fn: (state: PressState) => StyleProp<ViewStyle>) {
  return fn as (state: PressableStateCallbackType) => StyleProp<ViewStyle>;
}

/** Web-only link props for Text/View (react-native-web renders them as <a href>). */
export function linkProps(href: string, external = true): object {
  return external ? { href, hrefAttrs: { target: '_blank', rel: 'noopener noreferrer' } } : { href };
}
