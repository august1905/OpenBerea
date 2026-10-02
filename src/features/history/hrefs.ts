import type { BookCode } from '@/lib/bible/books';

// URL builders for maps, timelines, people, and the gospel harmony. The URL holds each screen's state.

export function mapHref(opts: { ch?: { book: BookCode; chapter: number }; place?: string } = {}): string {
  const q = new URLSearchParams();
  if (opts.ch) q.set('ch', `${opts.ch.book}.${opts.ch.chapter}`);
  if (opts.place) q.set('place', opts.place);
  const qs = q.toString();
  return `/study/maps${qs ? `?${qs}` : ''}`;
}

export type TimelineView = 'kings' | 'events';

export function timelineHref(opts: { view?: TimelineView; event?: string; era?: string } = {}): string {
  const q = new URLSearchParams();
  if (opts.event) {
    q.set('view', 'events');
    q.set('event', opts.event);
  } else if (opts.era) {
    q.set('view', 'events');
    q.set('era', opts.era);
  } else if (opts.view && opts.view !== 'kings') {
    q.set('view', opts.view);
  }
  const qs = q.toString();
  return `/study/timeline${qs ? `?${qs}` : ''}`;
}

export function peopleHref(): string {
  return '/study/people';
}

export function personHref(id: string): string {
  return `/study/people/${encodeURIComponent(id)}`;
}

export function harmonyHref(opts: { v?: string } = {}): string {
  return opts.v ? `/study/harmony?v=${encodeURIComponent(opts.v)}` : '/study/harmony';
}

export function harmonySectionHref(n: number): string {
  return `/study/harmony/${n}`;
}
