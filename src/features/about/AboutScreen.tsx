import { StyleSheet, Text, View } from 'react-native';

import { Body, Button, ErrorState, ExternalLink, Heading, Loading, Rule, Screen } from '@/components/ui';
import { t } from '@/i18n';
import { useData } from '@/lib/data/fetch';
import type { DataManifest } from '@/lib/data/types';
import { applyUpdate, checkForUpdates, useOfflineStatus } from '@/lib/platform/offline';
import { useTheme } from '@/theme';

import site from '../../../content/site.json';

function OfflineStatus() {
  const s = useOfflineStatus();
  const text = !s.supported
    ? t('about.offlineStarting')
    : s.total && s.done >= s.total
      ? t('about.offlineReady')
      : s.total
        ? t('about.offlineProgress', { done: s.done.toLocaleString('en'), total: s.total.toLocaleString('en') })
        : t('about.offlineStarting');
  return (
    <Text testID="offline-status" role="status">
      <Body>{text}</Body>
    </Text>
  );
}

const UPDATE_TEXT = {
  idle: null,
  checking: 'about.updateChecking',
  latest: 'about.updateLatest',
  downloading: 'about.updateDownloading',
  ready: 'about.updateReady',
} as const;

/** Which version this device runs, and a way to check for a newer one. */
function Updates() {
  const s = useOfflineStatus();
  if (!s.supported || !s.build) return null;
  const status = UPDATE_TEXT[s.update];
  return (
    <View testID="updates">
      <Heading level={2}>{t('about.updates')}</Heading>
      <Body muted>{t('about.updatesIntro')}</Body>
      <Body style={{ marginTop: 8 }}>{t('about.build', { build: s.build })}</Body>
      {status ? (
        <Text testID="update-status" role="status">
          <Body>{t(status)}</Body>
        </Text>
      ) : null}
      <View style={styles.row}>
        {s.update === 'ready' ? (
          <Button testID="about-reload" label={t('update.reload')} onPress={applyUpdate} />
        ) : (
          <Button testID="check-updates" label={t('about.checkUpdates')} onPress={() => checkForUpdates()} disabled={s.update === 'checking' || s.update === 'downloading'} />
        )}
      </View>
    </View>
  );
}

function Sources() {
  const { palette, fonts } = useTheme();
  const manifest = useData<DataManifest>('manifest.json');
  if (manifest.status === 'loading') return <Loading />;
  if (manifest.status === 'error') return <ErrorState onRetry={manifest.reload} />;
  return (
    <View testID="sources">
      {manifest.data.sources.map((s) => (
        <View key={s.id} testID={`source-${s.id}`} style={[styles.source, { borderColor: palette.rule }]}>
          <ExternalLink href={s.homepage.split(' ')[0]} label={s.name} style={styles.sourceName} />
          <Text style={[styles.attr, { color: palette.text, fontFamily: fonts.ui }]}>{s.license.attribution}</Text>
          <Text style={[styles.small, { color: palette.muted, fontFamily: fonts.ui }]}>
            {t('about.license', { license: s.license.name })}
            {s.license.url ? '  ' : ''}
          </Text>
          {s.license.url ? <ExternalLink href={s.license.url} label={s.license.url} style={styles.small} /> : null}
          <Text style={[styles.small, { color: palette.muted, fontFamily: fonts.ui }]}>{t('about.version', { version: s.version })}</Text>
        </View>
      ))}
    </View>
  );
}

export function AboutScreen() {
  const { palette, fonts } = useTheme();
  const bullet = (text: string, testID?: string) => (
    <Text testID={testID} style={[styles.bullet, { color: palette.text, fontFamily: fonts.ui }]}>
      {'•  '}
      {text}
    </Text>
  );
  return (
    <Screen title={t('about.title')}>
      <Heading>{t('about.title')}</Heading>
      <Body>{t('about.intro')}</Body>
      <Body muted style={{ marginTop: 8 }}>
        {t('about.berea')}
      </Body>
      <Body style={{ marginTop: 12 }}>{t('about.funding')}</Body>
      <View style={styles.row}>
        {site.donationUrl ? <ExternalLink href={site.donationUrl} label={t('about.donate')} /> : null}
        {site.repositoryUrl ? <ExternalLink href={site.repositoryUrl} label={t('about.code')} /> : null}
        {site.contactEmail ? <ExternalLink href={`mailto:${site.contactEmail}`} label={t('about.contact')} /> : null}
      </View>

      <Heading level={2}>{t('about.offline')}</Heading>
      <OfflineStatus />
      <Updates />

      <Heading level={2}>{t('about.credits')}</Heading>
      <Body muted>{t('about.creditsIntro')}</Body>
      <Sources />

      <Heading level={2}>{t('about.teachers')}</Heading>
      <Body muted>{t('about.teachersIntro')}</Body>
      <View testID="teacher-credits" style={{ marginTop: 8 }}>
        {bullet(t('about.piper'))}
        <Text style={[styles.bullet, styles.indent, { color: palette.muted, fontFamily: fonts.ui }]}>{t('about.piperBio')}</Text>
        {bullet(t('about.macarthur'))}
        {bullet(t('about.washer'))}
        {bullet(t('about.blb'))}
        {bullet(t('about.otherSites'))}
      </View>

      <Heading level={2}>{t('about.excluded')}</Heading>
      <View testID="excluded">
        {bullet(t('about.excluded.gill'))}
        {bullet(t('about.excluded.tbesh'))}
        {bullet(t('about.excluded.barnesOt'))}
        {bullet(t('about.excluded.thayer'))}
        {bullet(t('about.excluded.gesenius'))}
        {bullet(t('about.excluded.audio'))}
      </View>

      <Heading level={2}>{t('about.privacy')}</Heading>
      <Body>{t('about.privacyBody')}</Body>

      <Heading level={2}>{t('about.shortcuts')}</Heading>
      <Body>{t('shortcuts.list')}</Body>
      <Rule />
      <Body muted>{t('about.codeLicense')}</Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 6 },
  source: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 12, gap: 3 },
  sourceName: { fontSize: 16, fontWeight: '600' },
  attr: { fontSize: 14, lineHeight: 21 },
  small: { fontSize: 12, lineHeight: 18 },
  bullet: { fontSize: 15, lineHeight: 23, marginBottom: 8 },
  indent: { paddingLeft: 18, fontSize: 14 },
});
