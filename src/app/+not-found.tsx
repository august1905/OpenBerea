import { Body, Heading, Screen, TextButton } from '@/components/ui';
import { go } from '@/features/nav/navigate';
import { t } from '@/i18n';

export default function NotFound() {
  return (
    <Screen title={t('notFound.title')}>
      <Heading>{t('notFound.title')}</Heading>
      <Body>{t('notFound.body')}</Body>
      <TextButton label={t('notFound.home')} onPress={() => go('/')} style={{ alignSelf: 'flex-start', marginLeft: -8, marginTop: 12 }} />
    </Screen>
  );
}
