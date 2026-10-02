import { useLocalSearchParams } from 'expo-router';
import { type ComponentType, useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body, ErrorState, Heading, Loading, Screen, TextButton } from '@/components/ui';
import { type MessageKey, t } from '@/i18n';
import { formatRef } from '@/i18n/format';
import type { BookCode } from '@/lib/bible/books';
import { toCompact } from '@/lib/bible/refs';
import { verseCount } from '@/lib/bible/versification';
import type { TranslationId } from '@/lib/data/types';
import { useTheme } from '@/theme';

import { go, replace } from '../nav/navigate';
import { chainSteps, chunkVerses, formatPart, isChapterLength, nextPart, type Part, partSpan, resolvePart, type Span } from './chunks';
import { DASHBOARD_HREF, type Mode, modeName, MODES, practiceHref, toMode, toTranslation, TRANSLATIONS, trName, trShort } from './modes';
import { FillBlank } from './modes/FillBlank';
import { FirstLetter } from './modes/FirstLetter';
import { Progressive } from './modes/Progressive';
import { RefToVerse } from './modes/RefToVerse';
import { Scramble } from './modes/Scramble';
import type { ModeProps } from './modes/types';
import { VerseToRef } from './modes/VerseToRef';
import { Choices, OptionButton, ResultCard } from './parts';
import { parseCompactRef, type Passage, type PassageVerse, unitOf } from './passage';
import { newAttemptId, recordAttempt, type Report, sessionSeed } from './session';
import { SessionScore } from './SessionScore';
import { hashSeed } from './shuffle';
import { usePassage } from './usePassage';

const COMPONENTS: Record<Mode, ComponentType<ModeProps>> = {
  'first-letter': FirstLetter,
  progressive: Progressive,
  'fill-blank': FillBlank,
  'ref-to-verse': RefToVerse,
  'verse-to-ref': VerseToRef,
  scramble: Scramble,
};


/** Verse numbers of a span, e.g. "1–3", "4", or "1:31–2:2" across chapters. */
function spanLabel(verses: readonly PassageVerse[], span: Span): string {
  const a = verses[span.start];
  const b = verses[span.end];
  const multi = verses[0].c !== verses[verses.length - 1].c;
  const at = (v: PassageVerse) => (multi ? t('mem.part.chapterVerse', { c: v.c, v: v.n }) : String(v.n));
  return span.start === span.end ? at(a) : t('mem.part.range', { from: at(a), to: at(b) });
}

function spanA11y(verses: readonly PassageVerse[], span: Span): string {
  const label = spanLabel(verses, span);
  return span.start === span.end ? t('mem.part.verseLabel', { n: label }) : t('mem.part.versesLabel', { range: label });
}

/** /memorize/practice?ref=ROM.8.28-30&tr=kjv&mode=first-letter&part=chunk-1 */
export function PracticeScreen() {
  const params = useLocalSearchParams<{ ref?: string; tr?: string; mode?: string; part?: string }>();
  const ref = useMemo(() => parseCompactRef(params.ref, verseCount), [params.ref]);
  const tr = toTranslation(params.tr);
  const mode = toMode(params.mode);
  const passage = usePassage(ref, tr);

  if (!ref) {
    return (
      <Screen title={t('mem.title')}>
        <BackLink />
        <Heading>{t('mem.title')}</Heading>
        <ErrorState message={t('mem.practice.badRef')} />
      </Screen>
    );
  }
  const title = mode === 'verse-to-ref' ? t('mem.practice.title', { ref: modeName(mode) }) : t('mem.practice.title', { ref: formatRef(ref) });
  return (
    <Screen title={title}>
      <BackLink />
      <Heading>{mode === 'verse-to-ref' ? t('mem.practice.hiddenRef') : formatRef(ref)}</Heading>
      <Body muted>{t('mem.practice.subtitle', { tr: trName(tr), mode: modeName(mode) })}</Body>
      {passage.status === 'ready' ? (
        <Practice passage={passage.data} mode={mode} partParam={params.part} />
      ) : passage.status === 'error' ? (
        <ErrorState />
      ) : (
        <Loading />
      )}
      <SessionScore />
    </Screen>
  );
}

function BackLink() {
  return (
    <TextButton
      testID="practice-back"
      label={`← ${t('mem.practice.back')}`}
      accessibilityLabel={t('mem.practice.back')}
      onPress={() => go(DASHBOARD_HREF)}
      style={{ alignSelf: 'flex-start', marginLeft: -8, marginBottom: 12 }}
      size={14}
    />
  );
}

function Practice({ passage, mode, partParam }: { passage: Passage; mode: Mode; partParam?: string }) {
  const { ref, tr, verses } = passage;
  const chapterMode = isChapterLength(ref.verse === undefined, verses.length);
  const chunks = useMemo(() => chunkVerses(verses.map((v) => v.words.length)), [verses]);
  const part = resolvePart(chapterMode, partParam, chunks, verses.length);
  const span = partSpan(part, chunks, verses.length);
  const compact = toCompact(ref);

  const update = (patch: { tr?: TranslationId; mode?: Mode; part?: Part }) =>
    replace(
      practiceHref({
        ref: compact,
        tr: patch.tr ?? tr,
        mode: patch.mode ?? mode,
        part: chapterMode ? formatPart(patch.part ?? part) : undefined,
      }),
    );

  const following = chapterMode ? nextPart(part, chunks.length, verses.length) : null;
  const followingSpan = following ? partSpan(following, chunks, verses.length) : null;

  if (!verses.length || !span) return <ErrorState />;

  return (
    <View>
      <View style={styles.controls}>
        <Choices
          label={t('mem.practice.modes')}
          testIDPrefix="mode"
          value={mode}
          onChange={(m) => update({ mode: m })}
          options={MODES.map((m) => ({ id: m, label: t(`mem.modeShort.${m}` as MessageKey), a11y: modeName(m) }))}
          size={14}
        />
        <Choices
          label={t('mem.pick.translation')}
          testIDPrefix="tr"
          value={tr}
          onChange={(v) => update({ tr: v })}
          options={TRANSLATIONS.map((v) => ({ id: v, label: trShort(v), a11y: trName(v) }))}
          size={14}
        />
      </View>
      {chapterMode ? <PartPicker verses={verses} chunks={chunks} part={part} onChange={(p) => update({ part: p })} /> : null}
      <Runner
        key={`${span.start}-${span.end}|${tr}|${mode}`}
        book={ref.book}
        verses={verses}
        start={span.start}
        end={span.end}
        tr={tr}
        mode={mode}
        showUnit={chapterMode && mode !== 'verse-to-ref'}
        next={following && followingSpan ? { label: spanA11y(verses, followingSpan), onPress: () => update({ part: following }) } : null}
      />
    </View>
  );
}

function PartPicker({ verses, chunks, part, onChange }: { verses: PassageVerse[]; chunks: Span[]; part: Part; onChange: (p: Part) => void }) {
  const { palette } = useTheme();
  const steps = useMemo(() => chainSteps(verses.length), [verses.length]);
  const hint = part.kind === 'chunk' ? 'mem.part.chunksHint' : part.kind === 'chain' ? 'mem.part.chainHint' : 'mem.part.wholeHint';
  return (
    <View testID="chapter-mode" style={[styles.parts, { borderColor: palette.rule }]}>
      <Heading level={3} style={{ marginTop: 0, marginBottom: 4 }}>
        {t('mem.part.heading')}
      </Heading>
      <Choices
        label={t('mem.part.heading')}
        showLabel={false}
        testIDPrefix="part-kind"
        value={part.kind}
        onChange={(k) => onChange(k === 'all' ? { kind: 'all' } : { kind: k, index: 0 })}
        options={[
          { id: 'chunk', label: t('mem.part.chunks') },
          { id: 'chain', label: t('mem.part.chain') },
          { id: 'all', label: t('mem.part.whole') },
        ]}
        size={14}
      />
      <Body muted style={{ fontSize: 14, marginBottom: part.kind === 'all' ? 0 : 10 }}>
        {t(hint)}
      </Body>
      {part.kind !== 'all' ? (
        <View style={styles.options}>
          {(part.kind === 'chunk' ? chunks : steps).map((s, i) => (
            <OptionButton
              key={i}
              testID={`part-${part.kind}-${i + 1}`}
              label={spanLabel(verses, s)}
              a11y={spanA11y(verses, s)}
              active={part.index === i}
              onPress={() => onChange({ kind: part.kind, index: i })}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Runs one practice attempt and feeds the session score as it goes. */
function Runner({
  book,
  verses,
  start,
  end,
  tr,
  mode,
  next,
  showUnit,
}: {
  book: BookCode;
  verses: PassageVerse[];
  start: number;
  end: number;
  tr: TranslationId;
  mode: Mode;
  next: { label: string; onPress: () => void } | null;
  showUnit: boolean;
}) {
  const { palette, fonts } = useTheme();
  const unit = useMemo(() => unitOf(book, verses, { start, end }), [book, verses, start, end]);
  const [attempt, setAttempt] = useState(() => ({ id: newAttemptId(), n: 0 }));
  const [report, setReport] = useState<Report | null>(null);
  const unitRef = toCompact(unit.ref);

  const onReport = useCallback(
    (r: Report) => {
      setReport(r);
      recordAttempt({ id: attempt.id, ref: unitRef, tr, mode, ...r });
    },
    [attempt.id, unitRef, tr, mode],
  );

  const again = () => {
    setAttempt((a) => ({ id: newAttemptId(), n: a.n + 1 }));
    setReport(null);
  };

  const ModeView = COMPONENTS[mode];
  const seed = hashSeed(sessionSeed, unitRef, tr, mode, attempt.n);
  return (
    <View testID={`practice-${mode}`} style={{ marginTop: 18 }}>
      <View style={styles.runnerHead}>
        <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', flex: 1 }}>
          {showUnit ? t('mem.practice.unit', { ref: formatRef(unit.ref) }) : modeName(mode)}
        </Text>
        <TextButton testID="practice-restart" label={t('mem.restart')} onPress={again} size={14} />
      </View>
      <ModeView key={attempt.id} unit={unit} tr={tr} seed={seed} onReport={onReport} />
      {report?.done ? <ResultCard report={report} onAgain={again} next={next} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { marginTop: 16, gap: 2 },
  parts: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 14, marginTop: 10 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  runnerHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
});
