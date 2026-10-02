import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { ExternalLink, Loading, TextButton } from '@/components/ui';
import { bookName, t } from '@/i18n';
import type { BookCode } from '@/lib/bible/books';
import { useData } from '@/lib/data/fetch';
import type { AudioIndex } from '@/lib/data/types';
import { useTheme } from '@/theme';

import { filesForChapter } from './pick';
import { Player } from './Player';
import { setAudioOpen, useAudioOpen } from './state';

/** Audio Bible: the public-domain LibriVox KJV recording of this chapter. */
export function AudioBar({ book, chapter }: { book: BookCode; chapter: number }) {
  const open = useAudioOpen();
  const { palette, fonts } = useTheme();
  const index = useData<AudioIndex>(open ? 'librivox/kjv.json' : null);
  if (!open) return null;
  const entry = index.data?.[book];
  const files = filesForChapter(entry, chapter);
  const name = bookName(book);
  const small = [styles.small, { color: palette.muted, fontFamily: fonts.ui }];
  return (
    <View testID="audio-bar" role="region" aria-label={t('audio.region')} style={[styles.bar, { borderColor: palette.rule, backgroundColor: palette.surface }]}>
      <View style={styles.head}>
        <Icon name="audio" size={18} color={palette.text} />
        <Text style={[styles.title, { color: palette.text, fontFamily: fonts.ui }]}>{t('audio.title', { book: name, chapter })}</Text>
        <TextButton testID="audio-close" label={t('common.close')} onPress={() => setAudioOpen(false)} size={14} />
      </View>
      {index.status === 'loading' ? (
        <Loading />
      ) : !entry || !files.length ? (
        <Text style={small}>{t('audio.none')}</Text>
      ) : (
        files.map((f, i) => {
          const label = f.from === f.to ? `${name} ${f.from}` : `${name} ${f.from}–${f.to}`;
          return (
            <View key={f.src} testID={`audio-file-${i}`} style={styles.file}>
              {files.length > 1 ? <Text style={small}>{t('audio.part', { n: i + 1, of: files.length })}</Text> : null}
              <Player src={f.src} title={label} />
              {f.from !== f.to ? <Text style={small}>{t('audio.covers', { label, chapter })}</Text> : null}
              <Text style={small}>{t('audio.reader', { reader: f.reader ?? entry.reader })}</Text>
            </View>
          );
        })
      )}
      {entry ? (
        <Text style={small}>
          {t('audio.noTimings')} <ExternalLink href={entry.url} label={t('audio.librivox')} style={{ fontSize: 13 }} />
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 18, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: '600' },
  file: { gap: 4 },
  small: { fontSize: 13, lineHeight: 19 },
});
