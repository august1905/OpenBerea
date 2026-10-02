import { StyleSheet, Text, View } from 'react-native';

import { MediaEmbed } from '@/components/media/MediaEmbed';
import { ExternalLink, Heading } from '@/components/ui';
import { type MessageKey, t } from '@/i18n';
import { formatRef } from '@/i18n/format';
import type { BookCode } from '@/lib/bible/books';
import type { ResourceItem } from '@/lib/data/types';
import { useTheme } from '@/theme';

import { refHref } from '../nav/hrefs';
import { go } from '../nav/navigate';
import library from '../../../content/resources.json';
import { ATTRIBUTION, links } from './links';

export const RESOURCES = (library as { items: ResourceItem[] }).items;

export function attributionFor(item: Pick<ResourceItem, 'teacher'>): string | null {
  if (item.teacher === 'John Piper') return ATTRIBUTION.piper;
  if (item.teacher === 'John MacArthur') return ATTRIBUTION.macarthur;
  if (item.teacher === 'Paul Washer') return ATTRIBUTION.washer;
  return null;
}

/** Only John Piper's media may be embedded (Desiring God's terms); others are links. */
export function canEmbed(item: ResourceItem): boolean {
  return !!item.embed && item.teacher === 'John Piper' && item.ministry === 'Desiring God';
}

/** Topics are stored as slugs ("love-of-god"); show them as words. */
export const topicLabel = (topic: string) => topic.replace(/-/g, ' ');

const siteName = (url: string) => new URL(url).hostname.replace(/^www\./, '');

export function ResourceCard({ item }: { item: ResourceItem }) {
  const { palette, fonts } = useTheme();
  const attribution = attributionFor(item);
  return (
    <View testID={`res-${item.id}`} style={[styles.card, { borderColor: palette.rule }]}>
      <Text style={[styles.meta, { color: palette.muted, fontFamily: fonts.ui }]}>
        {t(`res.type.${item.type}` as MessageKey)} · {item.teacher} · {item.ministry}
      </Text>
      <ExternalLink href={item.url} label={item.title} style={styles.title} testID={`res-link-${item.id}`} />
      {canEmbed(item) && item.embed ? <MediaEmbed embed={item.embed} title={item.title} testID={`embed-${item.id}`} /> : null}
      <Text style={[styles.refs, { color: palette.text, fontFamily: fonts.ui }]}>
        {item.refs.map((r, i) => (
          <Text key={r}>
            {i > 0 ? ', ' : ''}
            <Text
              role="link"
              onPress={() => go(refHref(r))}
              style={{ textDecorationLine: 'underline', textDecorationColor: palette.gold } as never}
            >
              {formatRef(r)}
            </Text>
          </Text>
        ))}
        {item.topics.length ? <Text style={{ color: palette.muted }}>{`  ·  ${item.topics.map(topicLabel).join(', ')}`}</Text> : null}
      </Text>
      {attribution ? (
        <Text testID={`attr-${item.id}`} style={[styles.attr, { color: palette.muted, fontFamily: fonts.ui }]}>
          {attribution}
        </Text>
      ) : null}
      <Text style={[styles.attr, { color: palette.muted, fontFamily: fonts.ui }]}>{t('res.openSite', { site: siteName(item.url) })}</Text>
    </View>
  );
}

/** Per-verse (or per-chapter) links to other study sites. */
export function StudyLinks({ book, chapter, verse, testament }: { book: BookCode; chapter: number; verse?: number; testament: 'OT' | 'NT' }) {
  const { palette } = useTheme();
  const items: [string, string][] = verse
    ? [
        [t('res.site.blb'), links.blbVerse(book, chapter, verse)],
        [t('res.site.blbInterlinear'), links.blbInterlinear(book, chapter, verse, testament)],
        [t('res.site.biblehub'), links.bibleHubVerse(book, chapter, verse)],
        [t('res.site.biblehubInterlinear'), links.bibleHubInterlinear(book, chapter, verse)],
        [t('res.site.step'), links.stepVerse(book, chapter, verse)],
        [t('res.site.gateway'), links.bibleGateway(book, chapter, verse)],
      ]
    : [
        [t('res.site.blb'), links.blbVerse(book, chapter)],
        [t('res.site.step'), links.stepVerse(book, chapter)],
        [t('res.site.gateway'), links.bibleGateway(book, chapter)],
      ];
  return (
    <View testID="study-links" style={[styles.links, { borderColor: palette.rule }]}>
      {items.map(([label, href]) => (
        <ExternalLink key={label} href={href} label={label} style={styles.link} />
      ))}
    </View>
  );
}

export function TeacherLinks({ book, chapter }: { book: BookCode; chapter: number }) {
  const { palette, fonts } = useTheme();
  const ref = formatRef({ book, chapter });
  const dg = links.dgChapter(book, chapter);
  const body = [styles.body, { color: palette.text, fontFamily: fonts.ui }];
  const muted = [styles.attr, { color: palette.muted, fontFamily: fonts.ui }];
  return (
    <View testID="teacher-links">
      <View style={[styles.teacher, { borderColor: palette.rule }]}>
        <Heading level={3} style={{ marginTop: 0 }}>{t('res.teacher.piper')}</Heading>
        {dg ? (
          <ExternalLink testID="dg-link" href={dg} label={t('res.teacher.piper.link', { ref })} />
        ) : (
          <Text style={body}>{t('res.teacher.piper.none', { book: formatRef({ book, chapter }).split(' ')[0] })}</Text>
        )}
        <Text style={muted}>{ATTRIBUTION.piper}</Text>
      </View>
      <View style={[styles.teacher, { borderColor: palette.rule }]}>
        <Heading level={3} style={{ marginTop: 0 }}>{t('res.teacher.macarthur')}</Heading>
        <ExternalLink testID="gty-link" href={links.gtyScripture()} label={t('res.teacher.macarthur.link')} />
        <Text style={body}>{t('res.teacher.macarthur.note', { book: ref.replace(/ \d+$/, '') })}</Text>
        <Text style={muted}>{ATTRIBUTION.macarthur}</Text>
      </View>
      <View style={[styles.teacher, { borderColor: palette.rule }]}>
        <Heading level={3} style={{ marginTop: 0 }}>{t('res.teacher.washer')}</Heading>
        <ExternalLink testID="heartcry-link" href={links.heartcryChapter(book, chapter)} label={t('res.teacher.washer.link', { ref })} />
        <Text style={muted}>{ATTRIBUTION.washer}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12, gap: 4 },
  meta: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  title: { fontSize: 18, fontWeight: '600', lineHeight: 26 },
  refs: { fontSize: 14, lineHeight: 22 },
  attr: { fontSize: 12, lineHeight: 18 },
  body: { fontSize: 15, lineHeight: 22 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6 },
  link: { fontSize: 15 },
  teacher: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12, gap: 6 },
});
