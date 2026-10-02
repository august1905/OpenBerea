export interface MediaEmbedProps {
  embed: { kind: 'youtube'; id: string } | { kind: 'audio'; src: string };
  title: string;
  testID?: string;
}
