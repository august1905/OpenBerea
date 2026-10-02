import 'react-native';

declare module 'react-native' {
  interface ViewProps {
    /** react-native-web: rendered as data-* attributes (the corner menus' motion tags). Ignored on native. */
    dataSet?: Record<string, string>;
  }
}
