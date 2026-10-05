import { memo } from 'react';
import { Text, type TextStyle } from 'react-native';

import type { Seg, TranslationId } from '@/lib/data/types';
import { useTheme } from '@/theme';

export interface WordTap {
  text: string;
  strongs: string[];
  morph?: string[];
  /** Translation (KJV when absent), verse, and segment index, so the panel can find the original word. */
  tr?: TranslationId;
  verse?: number;
  segIndex?: number;
  /** The original-language word itself (taps in the Hebrew/Greek or interlinear views). */
  orig?: import('@/lib/data/types').OrigWord;
}

interface Props {
  segs: Seg[];
  redLetter: boolean;
  /** Called when a word with Strong's numbers is tapped (KJV and ASV). */
  onWord?: (word: WordTap) => void;
  /** Strong's number to highlight (e.g. from a word study). */
  highlightStrongs?: string;
}

/** Renders a verse's text segments: red letter, translators' added words in italics, small-caps LORD. */
export const Segments = memo(function Segments({ segs, redLetter, onWord, highlightStrongs }: Props) {
  const { palette } = useTheme();
  return (
    <>
      {segs.map((seg, i) => {
        if (typeof seg === 'string') return seg;
        const style: TextStyle = {};
        if (seg.w && redLetter) style.color = palette.redLetter;
        if (seg.a) style.fontStyle = 'italic';
        if (seg.dn) style.fontVariant = ['small-caps'];
        if (highlightStrongs && seg.s?.includes(highlightStrongs)) style.backgroundColor = palette.highlight;
        if (onWord && seg.s?.length) {
          return (
            <Text
              key={i}
              style={style}
              role="button"
              accessibilityLabel={seg.t}
              onPress={() => onWord({ text: seg.t, strongs: seg.s!, morph: seg.m, segIndex: i })}
            >
              {seg.t}
            </Text>
          );
        }
        return (
          <Text key={i} style={style}>
            {seg.t}
          </Text>
        );
      })}
    </>
  );
});

/** Plain text of segments. */
export function segsText(segs: Seg[]): string {
  return segs.map((s) => (typeof s === 'string' ? s : s.t)).join('');
}
