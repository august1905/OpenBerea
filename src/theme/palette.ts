// Color tokens. Background and the two accents come from the spec's Design section. Accents are
// for dots, lines, active states (gold) and soft highlights behind text (peach), never for text.

export interface Palette {
  scheme: 'light' | 'dark';
  highContrast: boolean;
  bg: string;
  /** Raised surfaces: panels, sheets, menus. */
  surface: string;
  text: string;
  /** Secondary text (verse numbers, labels). Still meets 4.5:1 on bg and surface. */
  muted: string;
  /** Hairlines and dividers. */
  rule: string;
  gold: string;
  peach: string;
  /** Peach at low opacity, for highlights behind text. */
  highlight: string;
  redLetter: string;
  /** Scrim behind open sheets and dialogs. */
  scrim: string;
  /** Light veil behind the corner menus: the page fades back so the arcs stand out. */
  veil: string;
  focus: string;
}

export const GOLD = '#A87A22';
export const PEACH = '#F2A06B';

const light: Palette = {
  scheme: 'light',
  highContrast: false,
  bg: '#FFFAE1',
  surface: '#FFFDF1',
  text: '#1C1A17',
  muted: '#5C5548',
  rule: '#E4D9B4',
  gold: GOLD,
  peach: PEACH,
  highlight: 'rgba(242, 160, 107, 0.32)',
  redLetter: '#A3161A',
  scrim: 'rgba(28, 26, 23, 0.18)',
  veil: 'rgba(255, 250, 225, 0.84)',
  focus: '#7A5510',
};

const dark: Palette = {
  scheme: 'dark',
  highContrast: false,
  bg: '#14120F',
  surface: '#1E1B17',
  text: '#FFFAE1',
  muted: '#BDB49C',
  rule: '#3A342A',
  gold: GOLD,
  peach: PEACH,
  highlight: 'rgba(242, 160, 107, 0.26)',
  redLetter: '#FF8C82',
  scrim: 'rgba(0, 0, 0, 0.45)',
  veil: 'rgba(20, 18, 15, 0.86)',
  focus: '#E0B75C',
};

const lightHighContrast: Palette = {
  ...light,
  highContrast: true,
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  text: '#000000',
  muted: '#2B2B2B',
  rule: '#000000',
  gold: '#7A5510',
  highlight: 'rgba(242, 160, 107, 0.55)',
  redLetter: '#8A0000',
  focus: '#000000',
  veil: 'rgba(255, 255, 255, 0.9)',
};

const darkHighContrast: Palette = {
  ...dark,
  highContrast: true,
  bg: '#000000',
  surface: '#000000',
  text: '#FFFFFF',
  muted: '#E6E6E6',
  rule: '#FFFFFF',
  gold: '#F2C25B',
  highlight: 'rgba(242, 160, 107, 0.3)',
  redLetter: '#FFA59E',
  focus: '#FFFFFF',
  veil: 'rgba(0, 0, 0, 0.9)',
};

export function paletteFor(scheme: 'light' | 'dark', highContrast: boolean): Palette {
  if (scheme === 'dark') return highContrast ? darkHighContrast : dark;
  return highContrast ? lightHighContrast : light;
}
