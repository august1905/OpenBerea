import { Linking } from 'react-native';

import { Button } from '@/components/ui';
import { t } from '@/i18n';

/** Native placeholder: an in-app player comes with the mobile apps. */
export function Player({ src, title }: { src: string; title: string }) {
  return <Button label={t('audio.open', { title })} onPress={() => Linking.openURL(src)} />;
}
