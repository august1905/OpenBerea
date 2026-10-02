import { Linking } from 'react-native';

import { t } from '@/i18n';

import { Button } from '../ui';
import type { MediaEmbedProps } from './types';

/** Native placeholder: opens the media on its publisher's site (an in-app player comes with the apps). */
export function MediaEmbed({ embed, title, testID }: MediaEmbedProps) {
  const url = embed.kind === 'audio' ? embed.src : `https://www.youtube.com/watch?v=${embed.id}`;
  return <Button testID={testID} label={t('media.open', { title })} onPress={() => Linking.openURL(url)} />;
}
