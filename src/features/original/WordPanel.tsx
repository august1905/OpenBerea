import { Fragment } from 'react';
import { View } from 'react-native';

import { Sheet } from '@/components/Sheet';
import { Loading, Rule } from '@/components/ui';
import { t } from '@/i18n';
import type { BookCode } from '@/lib/bible/books';
import { useData } from '@/lib/data/fetch';
import type { ChapterText, OrigChapter, OrigWord } from '@/lib/data/types';

import type { WordTap } from '../reader/Segments';
import { wordsForSegment } from './align';
import { baseStrongs, paths } from './data';
import { WordDetails } from './WordDetails';

const ARTICLES = new Set(['G3588', 'H9009']);

/** Strong's numbers to show for a tap: content words first, the article last, affixes dropped. */
function idsFor(tap: WordTap, forms: OrigWord[]): { id: string; form?: OrigWord }[] {
  const out: { id: string; form?: OrigWord }[] = [];
  if (tap.orig) return [{ id: tap.orig.s, form: tap.orig }];
  for (const s of tap.strongs) {
    const base = baseStrongs(s);
    if (!base || /^H90\d\d$/.test(base) || out.some((o) => o.id === base)) continue;
    out.push({ id: base, form: forms.find((f) => f.s === base) ?? forms.find((f) => f.p?.some((p) => p.s === base)) });
  }
  // Forms matched through a form family (e.g. μου for G1473) keep the original word's own number.
  for (const o of out) if (!o.form && forms.length === 1 && out.length === 1) o.form = forms[0];
  return out.sort((a, b) => Number(ARTICLES.has(a.id)) - Number(ARTICLES.has(b.id)));
}

/** Tap any word: Strong's number, root, transliteration, pronunciation, definition, grammar. */
export function WordPanel({ word, book, chapter, onClose }: { word: WordTap; book: BookCode; chapter: number; onClose: () => void }) {
  const needsAlign = !word.orig && word.verse !== undefined && word.segIndex !== undefined;
  const kjv = useData<ChapterText>(needsAlign ? `kjv/${book}/${chapter}.json` : null);
  const orig = useData<OrigChapter>(needsAlign ? paths.orig(book, chapter) : null);
  const loading = needsAlign && (kjv.status === 'loading' || orig.status === 'loading');
  let forms: OrigWord[] = [];
  if (needsAlign && kjv.data && orig.data) {
    const verse = kjv.data.v.find((v) => v.n === word.verse);
    const ov = orig.data.v.find((v) => v.n === word.verse);
    if (verse && ov) forms = wordsForSegment(verse.s, word.segIndex!, ov.w);
  }
  const entries = loading ? [] : idsFor(word, forms);
  return (
    <Sheet testID="word-panel" visible title={`${word.text} · ${t('word.panelTitle')}`} onClose={onClose} wide>
      {loading ? (
        <Loading />
      ) : (
        <View>
          {entries.map((e, i) => (
            <Fragment key={e.id}>
              {i > 0 ? <Rule /> : null}
              <WordDetails id={e.id} form={e.form} compact />
            </Fragment>
          ))}
        </View>
      )}
    </Sheet>
  );
}
