import { createStore, useStore } from './store';

/** Reading and accessibility options. Held in memory only, so they reset on every visit. */
export interface DisplayOptions {
  /** Multiplier for all text sizes. */
  fontScale: number;
  /** Swaps Scripture to a plain sans-serif with wider letter, word, and line spacing. */
  dyslexiaFont: boolean;
  highContrast: boolean;
  /** Light or dark, chosen from the menu; "device" follows the device setting. */
  theme: 'device' | 'light' | 'dark';
  redLetter: boolean;
  layout: 'verse' | 'paragraph';
}

export const FONT_SCALES = [0.85, 1, 1.15, 1.3, 1.5, 1.75] as const;

export const defaultDisplay: DisplayOptions = {
  fontScale: 1,
  dyslexiaFont: false,
  highContrast: false,
  theme: 'device',
  redLetter: true,
  layout: 'verse',
};

export const displayStore = createStore<DisplayOptions>(defaultDisplay);

export function useDisplay(): DisplayOptions {
  return useStore(displayStore);
}

export function setDisplay(patch: Partial<DisplayOptions>) {
  displayStore.set((prev) => ({ ...prev, ...patch }));
}

export function stepFontScale(dir: 1 | -1) {
  displayStore.set((prev) => {
    const i = FONT_SCALES.indexOf(prev.fontScale as (typeof FONT_SCALES)[number]);
    const next = FONT_SCALES[Math.min(FONT_SCALES.length - 1, Math.max(0, (i < 0 ? 1 : i) + dir))];
    return { ...prev, fontScale: next };
  });
}
