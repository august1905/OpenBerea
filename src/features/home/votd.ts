import votd from '../../../content/votd.json';

/** Day of the year, 1–366, in local time. */
export function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime() + (start.getTimezoneOffset() - date.getTimezoneOffset()) * 60_000;
  return Math.floor(diff / 86_400_000);
}

/** The verse of the day from the built-in list (content/votd.json), picked by date. */
export function verseOfTheDay(date: Date = new Date(), list: string[] = votd.verses): string {
  return list[(dayOfYear(date) - 1) % list.length];
}
