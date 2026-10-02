import { StyleSheet, Text, View } from 'react-native';

import { Inlines, RichText } from '@/components/RichText';
import { Button, ExternalLink, Loading } from '@/components/ui';
import { t } from '@/i18n';
import { useLoad } from '@/lib/data/fetch';
import { describeMorph, type MorphPart } from '@/lib/data/morph';
import type { ConcEntry, OrigWord, StepLexEntry, StrongsEntry } from '@/lib/data/types';
import { useTheme } from '@/theme';

import { wordHref } from '../nav/hrefs';
import { links } from '../resources/links';
import { go, openInNewTab } from '../nav/navigate';
import { baseStrongs, languageOf, loadConcordance, loadMorphTable, loadStepEntries, loadStrongs } from './data';

export interface WordInfo {
  strongs: StrongsEntry | null;
  step: StepLexEntry[];
  conc: ConcEntry | null;
}

export async function loadWordInfo(id: string, extended?: string): Promise<WordInfo> {
  const [strongs, step, conc] = await Promise.all([loadStrongs(id), loadStepEntries(id, extended), loadConcordance(id)]);
  return { strongs, step, conc };
}

/** Cleans STEPBible's example markup ("_he/she/it taught _") for display. */
const clean = (s?: string) => s?.replace(/_/g, '').replace(/\s+/g, ' ').trim();

export function Grammar({ code, lang, testID }: { code: string; lang: 'hbo' | 'grc'; testID?: string }) {
  const { palette, fonts } = useTheme();
  const table = useLoad(`morph:${lang}`, () => loadMorphTable(lang));
  if (table.status !== 'ready') return null;
  const parts: MorphPart[] = describeMorph(code, lang, table.data);
  return (
    <View testID={testID} style={styles.section}>
      <Text style={[styles.label, { color: palette.muted, fontFamily: fonts.ui }]}>{t('word.parsing')}</Text>
      {parts.map((p, i) => (
        <Text key={i} style={[styles.body, { color: palette.text, fontFamily: fonts.ui }]}>
          <Text style={{ fontWeight: '600' }}>{p.parsing}</Text>
          {p.explanation ? ` — ${clean(p.explanation)}` : ''}
        </Text>
      ))}
      <Text style={[styles.small, { color: palette.muted, fontFamily: fonts.ui }]}>{t('word.parsingCode', { code })}</Text>
    </View>
  );
}

function Usage({ conc }: { conc: ConcEntry }) {
  const { palette, fonts } = useTheme();
  const top = conc.kjv.slice(0, 8);
  return (
    <View style={styles.section}>
      <Text style={[styles.label, { color: palette.muted, fontFamily: fonts.ui }]}>{t('word.usage')}</Text>
      <Text testID="word-usage" style={[styles.body, { color: palette.text, fontFamily: fonts.ui }]}>
        {t('word.usageCount', { n: conc.n, verses: conc.v.length })}
      </Text>
      {top.length ? (
        <Text style={[styles.body, { color: palette.text, fontFamily: fonts.ui }]}>
          {t('word.kjvRenders')}: {top.map(([w, n]) => `${w} (${n})`).join(', ')}
          {conc.kjv.length > top.length ? ', …' : ''}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Everything about one Strong's number: lemma, transliteration, pronunciation, root, definition,
 * the grammar of the form in this verse, and usage. Used in the word panel and the word study.
 */
export function WordDetails({
  id,
  form,
  compact,
  showActions = true,
  hideUsage,
}: {
  id: string;
  form?: OrigWord;
  compact?: boolean;
  showActions?: boolean;
  hideUsage?: boolean;
}) {
  const { palette, fonts, scale } = useTheme();
  const base = baseStrongs(id) ?? id;
  const lang = languageOf(base);
  const info = useLoad(`word:${base}:${form?.e ?? ''}`, () => loadWordInfo(base, form?.e));
  if (info.status === 'loading') return <Loading />;
  const data = info.data;
  const step = data?.step[0];
  const strongs = data?.strongs;
  const lemma = strongs?.lemma || step?.lemma || form?.t || base;
  const translit = strongs?.x || step?.x;
  const scriptFont = lang === 'hbo' ? fonts.hebrew : fonts.greek;

  return (
    <View testID={`word-${base}`} style={styles.wrap}>
      <View style={styles.head}>
        <Text
          testID="word-lemma"
          style={{ color: palette.text, fontFamily: scriptFont, fontSize: (lang === 'hbo' ? 34 : 30) * Math.min(scale, 1.4), writingDirection: lang === 'hbo' ? 'rtl' : 'ltr' }}
        >
          {lemma}
        </Text>
        <Text testID="word-strongs" style={[styles.strongs, { color: palette.text, borderColor: palette.gold, fontFamily: fonts.ui }]}>
          {t('word.strongs', { id: base })}
        </Text>
      </View>
      <Text style={[styles.body, { color: palette.text, fontFamily: fonts.ui }]}>
        {translit ? (
          <>
            <Text accessibilityLabel={`${t('word.transliteration')}: ${translit}`} style={{ fontStyle: 'italic' }}>
              {translit}
            </Text>
          </>
        ) : null}
        {strongs?.pron ? (
          <Text testID="word-pron" accessibilityLabel={`${t('word.pronunciation')}: ${strongs.pron}`} style={{ color: palette.muted }}>
            {'  ·  '}
            {strongs.pron}
          </Text>
        ) : null}
      </Text>
      {step?.g ? (
        <Text testID="word-gloss" style={[styles.gloss, { color: palette.text, fontFamily: fonts.scripture }]}>
          “{step.g}”
        </Text>
      ) : null}

      {form ? (
        <View style={styles.section}>
          <Text style={[styles.label, { color: palette.muted, fontFamily: fonts.ui }]}>{t('word.form')}</Text>
          <Text style={[styles.body, { color: palette.text, fontFamily: fonts.ui }]}>
            <Text style={{ fontFamily: scriptFont, fontSize: 20, writingDirection: lang === 'hbo' ? 'rtl' : 'ltr' }}>{form.t}</Text>
            {`  ${form.x} — ${form.g}`}
          </Text>
        </View>
      ) : null}
      {form ? <Grammar code={form.m} lang={lang} testID="word-grammar" /> : null}

      {strongs?.deriv?.length ? (
        <View style={styles.section}>
          <Text style={[styles.label, { color: palette.muted, fontFamily: fonts.ui }]}>{t('word.root')}</Text>
          <Text testID="word-root" style={[styles.body, { color: palette.text, fontFamily: fonts.ui }]}>
            <Inlines runs={strongs.deriv} size={15} />
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={[styles.label, { color: palette.muted, fontFamily: fonts.ui }]}>{t('word.definition')}</Text>
        {strongs?.def?.length ? (
          <RichText testID="word-definition" blocks={compact ? strongs.def.slice(0, 2) : strongs.def} size={15} />
        ) : step?.d?.length ? (
          <RichText testID="word-definition" blocks={compact ? step.d.slice(0, 3) : step.d} size={15} />
        ) : (
          <Text style={[styles.body, { color: palette.muted, fontFamily: fonts.ui }]}>{step?.g ?? t('word.notFound', { id: base })}</Text>
        )}
        {strongs?.kjv ? (
          <Text style={[styles.small, { color: palette.muted, fontFamily: fonts.ui }]}>{t('lex.kjvUsage', { usage: strongs.kjv })}</Text>
        ) : null}
      </View>

      {data?.conc && !hideUsage ? <Usage conc={data.conc} /> : null}

      <WordLinks id={base} />

      {showActions ? (
        <View style={styles.actions}>
          <Button testID="word-study-link" label={t('word.study')} onPress={() => go(wordHref(base))} />
          <Button label={t('word.studyNewTab')} onPress={() => openInNewTab(wordHref(base))} />
        </View>
      ) : null}
    </View>
  );
}

/** Per-word link-outs to other study sites (Blue Letter Bible, Bible Hub). */
function WordLinks({ id }: { id: string }) {
  const { palette, fonts } = useTheme();
  const blb = links.blbLexicon(id);
  const hub = links.bibleHubStrongs(id);
  if (!blb && !hub) return null;
  return (
    <View testID="word-links" style={styles.section}>
      <Text style={[styles.label, { color: palette.muted, fontFamily: fonts.ui }]}>{t('res.studyLinksWord', { id })}</Text>
      <View style={styles.linkRow}>
        {blb ? <ExternalLink href={blb} label={t('res.site.blbLexicon')} /> : null}
        {hub ? <ExternalLink href={hub} label={t('res.site.biblehubStrongs')} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  wrap: { paddingVertical: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  strongs: { fontSize: 13, fontWeight: '600', borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
  gloss: { fontSize: 18, marginTop: 6 },
  section: { marginTop: 14 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 },
  body: { fontSize: 15, lineHeight: 23 },
  small: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
});
