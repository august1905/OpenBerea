import { Platform, type TextStyle } from 'react-native';

// Self-hosted, open-licensed fonts (see public/fonts and the @font-face rules in public/index.html).
// On the web the fallbacks keep text readable while the fonts load.
const web = Platform.OS === 'web';

export const FONTS = {
  scripture: web ? 'Literata, Georgia, "Times New Roman", serif' : 'Literata',
  ui: web ? 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' : 'Inter',
  hebrew: web ? '"Ezra SIL", "SBL Hebrew", "Times New Roman", serif' : 'Ezra SIL',
  greek: web ? '"Gentium Plus", "Gentium", "Times New Roman", serif' : 'Gentium Plus',
} as const;

export type FontRole = keyof typeof FONTS;

/** Base sizes in px before the reader's font-size multiplier. */
export const SIZES = {
  caption: 12,
  label: 14,
  body: 16,
  scripture: 20,
  scriptureSmall: 17,
  hebrew: 26,
  greek: 22,
  title: 24,
  display: 32,
} as const;

/** Comfortable measure for Scripture: about 65–70 characters per line. */
export const READING_WIDTH = 680;

export const SPACE = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 } as const;

/**
 * The dyslexia-friendly option switches Scripture to the interface sans-serif with extra letter,
 * word, and line spacing, following British Dyslexia Association style guidance.
 */
export function scriptureStyle(scale: number, dyslexia: boolean): TextStyle {
  const size = SIZES.scripture * scale;
  return dyslexia
    ? {
        fontFamily: FONTS.ui,
        fontSize: size,
        lineHeight: Math.round(size * 1.9),
        letterSpacing: 0.6,
        ...(web ? ({ wordSpacing: '0.2em' } as unknown as TextStyle) : null),
      }
    : { fontFamily: FONTS.scripture, fontSize: size, lineHeight: Math.round(size * 1.65) };
}
