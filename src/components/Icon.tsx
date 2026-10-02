import Svg, { Circle, Path } from 'react-native-svg';

// Simple line icons drawn on a 24×24 grid (stroke-based, so they follow the text color).
const PATHS = {
  passage: 'M4 5.5C6.5 4.5 9.5 4.5 12 6v13c-2.5-1.5-5.5-1.5-8-.5zM20 5.5c-2.5-1-5.5-1-8 .5v13c2.5-1.5 5.5-1.5 8-.5z',
  interlinear: 'M4 7h7M13 7h7M5 11h5M14 11h5M4 15h7M13 15h7M5 19h5M14 19h5',
  word: 'M5 18l4.5-12 4.5 12M6.7 14h5.6M15 18c0-2.2 1.3-3.4 3-3.4s2.5 1 2.5 2.3V18m0-1.3c-.5 1-1.4 1.6-2.6 1.6',
  page: 'M6 3.5h8l4 4v13H6zM14 3.5v4h4M9 12h6M9 16h6',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  search: 'M10.5 4a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM15.5 15.5L20 20',
  read: 'M4 5.5C6.5 4.5 9.5 4.5 12 6v13c-2.5-1.5-5.5-1.5-8-.5zM20 5.5c-2.5-1-5.5-1-8 .5v13c2.5-1.5 5.5-1.5 8-.5z',
  study: 'M12 4l9 4.5-9 4.5-9-4.5zM6.5 10.5v4.5c3 2.5 8 2.5 11 0v-4.5M21 8.5V14',
  memorize: 'M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z',
  resources: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  audio: 'M4 9.5h3.5L12 6v12l-4.5-3.5H4zM15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11',
  display: 'M4 7h16M4 12h10M4 17h13',
  text: 'M5 7V5h14v2M12 5v14M9 19h6',
  map: 'M9 4L4 6v14l5-2 6 2 5-2V4l-5 2zM9 4v14M15 6v14',
  person: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20c1.2-3.5 4-5 7.5-5s6.3 1.5 7.5 5',
  timeline: 'M4 12h16M7 9v6M12 7v10M17 9v6',
  link: 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5',
  info: 'M12 8h.01M11 12h1v5h1M12 21a9 9 0 100-18 9 9 0 000 18z',
  check: 'M5 12.5l4.5 4.5L19 7',
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M8 5v14M16 5v14',
  stop: 'M6.5 6.5h11v11h-11z',
  chevronDown: 'M6 9l6 6 6-6',
  keyboard: 'M3.5 7h17v10h-17zM7 10.5h.01M10 10.5h.01M13 10.5h.01M16 10.5h.01M8 14h8',
  harmony: 'M5 4v16M10 4v16M15 4v16M20 4v16',
  dictionary: 'M6 4h11a1 1 0 011 1v15H7a1.5 1.5 0 010-3h11M6 4a1.5 1.5 0 00-1.5 1.5V18.5',
} as const;

export type IconName = keyof typeof PATHS | 'dot';

export function Icon({ name, size = 20, color, strokeWidth = 1.75 }: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      {name === 'dot' ? (
        <Circle cx={12} cy={12} r={4} fill={color} />
      ) : (
        <Path d={PATHS[name]} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </Svg>
  );
}
