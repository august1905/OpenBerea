import { t } from '@/i18n';

/** Streams a LibriVox MP3 from archive.org (where LibriVox hosts it) with the browser's audio controls. */
export function Player({ src, title }: { src: string; title: string }) {
  return <audio controls preload="none" src={src} aria-label={t('audio.playerLabel', { title })} style={{ width: '100%' }} />;
}
