import { createStore, useStore } from '@/lib/state/store';

/** Whether the audio bar is open in the reader (memory only). */
export const audioStore = createStore<{ open: boolean }>({ open: false });

export function useAudioOpen() {
  return useStore(audioStore, (s) => s.open);
}

export function setAudioOpen(open: boolean) {
  audioStore.set({ open });
}
