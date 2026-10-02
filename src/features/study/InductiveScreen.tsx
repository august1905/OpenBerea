import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, ErrorState, Heading, Loading, Screen } from '@/components/ui';
import { bookName, type MessageKey, t } from '@/i18n';
import { formatRef } from '@/i18n/format';
import { type BookCode } from '@/lib/bible/books';
import { useData } from '@/lib/data/fetch';
import type { ChapterText } from '@/lib/data/types';
import { useDisplay } from '@/lib/state/display';
import { setCurrentPassage } from '@/lib/state/passage';
import { useTheme } from '@/theme';
import { scriptureStyle } from '@/theme/typography';

import { readHref } from '../nav/hrefs';
import { Segments } from '../reader/Segments';
import { studyPaths } from './data';
import { crossrefsHref, inductiveHref } from './hrefs';
import { inductiveRange, PROMPTS, type PromptId, type StepId } from './inductive';
import { onPageRestored } from './page';
import { ChapterNav, InlineLink, Note } from './parts';
import { NotFoundScreen, usePassageParams } from './passage';

export function InductiveScreen() {
  const p = usePassageParams();
  if (!p) return <NotFoundScreen />;
  const range = inductiveRange(p.book, p.chapter, p.params.from, p.params.to);
  // Keyed by passage: moving to another passage starts with empty answers.
  const key = `${p.book}.${p.chapter}.${range.from ?? ''}-${range.to ?? ''}`;
  return <Inductive key={key} book={p.book} chapter={p.chapter} from={range.from} to={range.to} />;
}

/** One prompt and its answer box. The answer lives in this screen's memory only. */
function Prompt({ id, value, onChange, extra }: { id: PromptId; value: string; onChange: (s: string) => void; extra?: React.ReactNode }) {
  const { palette, fonts, scale } = useTheme();
  const question = t(`study.ind.${id}` as MessageKey);
  return (
    <View style={styles.prompt} testID={`ind-prompt-${id}`}>
      <Text nativeID={`ind-q-${id}`} style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 16 * Math.min(scale, 1.3), fontWeight: '600', marginBottom: 6 }}>
        {question}
      </Text>
      {extra}
      <TextInput
        testID={`ind-answer-${id}`}
        aria-labelledby={`ind-q-${id}`}
        accessibilityLabel={t('study.ind.answer', { prompt: question })}
        value={value}
        onChangeText={onChange}
        multiline
        numberOfLines={3}
        autoComplete="off"
        autoCorrect={false}
        textAlignVertical="top"
        style={[
          styles.answer,
          { color: palette.text, borderColor: palette.rule, backgroundColor: palette.surface, fontFamily: fonts.ui, fontSize: 16 * scale, lineHeight: 24 * scale },
        ]}
      />
    </View>
  );
}

function Inductive({ book, chapter, from, to }: { book: BookCode; chapter: number; from?: number; to?: number }) {
  const { palette, fonts, scale, dyslexia } = useTheme();
  const { redLetter } = useDisplay();
  const kjv = useData<ChapterText>(studyPaths.kjv(book, chapter));
  // Answers: component state only. Never written to storage; gone on leaving or reloading.
  const [answers, setAnswers] = useState<Partial<Record<PromptId, string>>>({});
  const label = from ? formatRef({ book, chapter, verse: from, endVerse: to && to !== from ? to : undefined }) : `${bookName(book)} ${chapter}`;
  const base = scriptureStyle(scale, dyslexia);

  useEffect(() => {
    setCurrentPassage({ book, chapter, verse: from });
  }, [book, chapter, from]);

  // If the browser restores this page from its back/forward cache, start over with empty answers.
  useEffect(() => onPageRestored(() => setAnswers({})), []);

  const set = (id: PromptId) => (s: string) => setAnswers((a) => ({ ...a, [id]: s }));
  const verses = kjv.data?.v.filter((v) => (!from || v.n >= from) && (!to || v.n <= to)) ?? [];
  const any = Object.values(answers).some((a) => a);

  const section = (step: StepId) => (
    <View key={step} testID={`ind-${step}`} style={styles.section}>
      <Heading level={2}>{t(`study.ind.${step}` as MessageKey)}</Heading>
      <Note style={styles.stepHint}>{t(`study.ind.${step}Hint` as MessageKey)}</Note>
      {PROMPTS[step].map((id) => (
        <Prompt
          key={id}
          id={id}
          value={answers[id] ?? ''}
          onChange={set(id)}
          extra={
            id === 'i3' ? (
              <InlineLink testID="ind-crossrefs" href={crossrefsHref(book, chapter, from)} style={{ fontFamily: fonts.ui, fontSize: 14, marginBottom: 8 }}>
                {t('study.ind.i3Link')}
              </InlineLink>
            ) : undefined
          }
        />
      ))}
    </View>
  );

  return (
    <Screen title={t('study.ind.pageTitle', { label })}>
      <Heading>{t('study.ind.pageTitle', { label })}</Heading>
      <Note style={styles.intro}>{t('study.ind.intro')}</Note>
      <View testID="ind-not-saved" style={[styles.notice, { borderColor: palette.gold, backgroundColor: palette.surface }]}>
        <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 15 * Math.min(scale, 1.3), lineHeight: 22 * Math.min(scale, 1.3) }}>{t('study.ind.notSaved')}</Text>
      </View>

      <Heading level={2}>{t('study.ind.passage')}</Heading>
      <View style={styles.links}>
        <InlineLink href={readHref(book, chapter, { v: from })} style={{ fontFamily: fonts.ui, fontSize: 14 }}>
          {t('study.readPassage', { label })}
        </InlineLink>
        {from ? (
          <InlineLink href={inductiveHref(book, chapter)} style={{ fontFamily: fonts.ui, fontSize: 14 }}>
            {t('study.ind.wholeChapter')}
          </InlineLink>
        ) : null}
      </View>
      {kjv.status === 'error' ? (
        <ErrorState onRetry={kjv.reload} />
      ) : kjv.status === 'loading' ? (
        <Loading />
      ) : (
        <View testID="ind-passage" style={styles.passage}>
          {kjv.data.title && !from ? (
            <Text style={[base, { color: palette.text, fontStyle: 'italic', marginBottom: 8 }]}>
              <Segments segs={kjv.data.title} redLetter={false} />
            </Text>
          ) : null}
          <Text style={[base, { color: palette.text }]}>
            {verses.map((v, i) => (
              <Text key={v.n}>
                {i > 0 ? ' ' : ''}
                <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 12 * scale, lineHeight: 12 * scale }}>{`${v.n} `}</Text>
                <Segments segs={v.s} redLetter={redLetter} />
              </Text>
            ))}
          </Text>
        </View>
      )}

      {(['observe', 'interpret', 'apply'] as const).map(section)}

      <View style={styles.clear}>
        <Button testID="ind-clear" label={t('study.ind.clear')} onPress={() => setAnswers({})} disabled={!any} />
      </View>
      <ChapterNav book={book} chapter={chapter} href={(b, c) => inductiveHref(b, c)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: 12 },
  notice: { borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 10, minHeight: 28, alignItems: 'center' },
  passage: { marginBottom: 8 },
  section: { marginTop: 12 },
  stepHint: { marginTop: -6, marginBottom: 10 },
  prompt: { marginBottom: 16 },
  answer: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 88 },
  clear: { marginTop: 8 },
});
