import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { useDisplay } from '@/lib/state/display';

import { type Palette, paletteFor } from './palette';
import { FONTS, SIZES, SPACE } from './typography';

export interface Theme {
  palette: Palette;
  fonts: typeof FONTS;
  sizes: typeof SIZES;
  space: typeof SPACE;
  /** Reader font-size multiplier (resets each visit). */
  scale: number;
  dyslexia: boolean;
}

const ThemeContext = createContext<Theme | null>(null);

/** Follows the device light/dark setting; high contrast and font size come from display options. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { highContrast, fontScale, dyslexiaFont } = useDisplay();
  const theme = useMemo<Theme>(
    () => ({
      palette: paletteFor(scheme, highContrast),
      fonts: FONTS,
      sizes: SIZES,
      space: SPACE,
      scale: fontScale,
      dyslexia: dyslexiaFont,
    }),
    [scheme, highContrast, fontScale, dyslexiaFont],
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside ThemeProvider');
  return theme;
}

export { FONTS, SIZES, SPACE } from './typography';
export type { Palette } from './palette';
