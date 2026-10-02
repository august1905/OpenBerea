import { useGlobalSearchParams, usePathname } from 'expo-router';
import { useMemo } from 'react';

import type { RadialNode } from '@/components/radial/types';
import { t } from '@/i18n';
import { bookInfo, toBookCode } from '@/lib/bible/books';
import { setDisplay, stepFontScale, useDisplay } from '@/lib/state/display';
import { useCurrentPassage } from '@/lib/state/passage';
import { useTheme } from '@/theme';

import { interlinearHref, readHref, type ReadVersion } from './hrefs';
import { go } from './navigate';

// Extra items registered by feature areas (study tools, memorization, resources, audio). Each feature
// adds its own entries without editing this file's core tree.
export type MenuSlot = 'read' | 'study' | 'study.passage' | 'study.reference' | 'memorize' | 'resources';
type Contribution = (ctx: MenuContext) => RadialNode | null;
const contributions: Partial<Record<MenuSlot, Contribution[]>> = {};

export function registerMenuItems(slot: MenuSlot, ...items: Contribution[]) {
  contributions[slot] = [...(contributions[slot] ?? []), ...items];
}

export interface MenuContext {
  book: ReturnType<typeof useCurrentPassage>['book'];
  chapter: number;
  verse?: number;
  testament: 'OT' | 'NT';
  /** Version shown on the current page, when it's a reading page. */
  version: ReadVersion | 'interlinear' | null;
}

function extra(slot: MenuSlot, ctx: MenuContext): RadialNode[] {
  return (contributions[slot] ?? []).map((c) => c(ctx)).filter((n): n is RadialNode => !!n);
}

/** The main corner menu: Read, Search, Study, Memorize, Resources (up to three levels deep). */
export function useMainMenu(): RadialNode[] {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ tr?: string }>();
  const passage = useCurrentPassage();
  const display = useDisplay();
  const scheme = useTheme().palette.scheme;

  return useMemo(() => {
    const onRead = /^\/read\//.test(pathname);
    const onInterlinear = /^\/interlinear\//.test(pathname);
    const routeBook = toBookCode(pathname.split('/')[2]);
    const book = (onRead || onInterlinear) && routeBook ? routeBook : passage.book;
    const chapter = onRead || onInterlinear ? Number(pathname.split('/')[3]) || passage.chapter : passage.chapter;
    const tr = (params.tr as ReadVersion | undefined) ?? 'kjv';
    const version: MenuContext['version'] = onInterlinear ? 'interlinear' : onRead ? tr : null;
    const ctx: MenuContext = { book, chapter, verse: passage.verse, testament: bookInfo(book).testament, version };
    const readAs = (v: ReadVersion) => () => go(readHref(book, chapter, { tr: v }));

    const versionNode: RadialNode = {
      id: 'read.version',
      label: t('menu.version'),
      icon: 'passage',
      children: [
        { id: 'read.kjv', label: t('menu.kjv'), icon: 'passage', active: version === 'kjv', onSelect: readAs('kjv') },
        { id: 'read.asv', label: t('menu.asv'), icon: 'passage', active: version === 'asv', onSelect: readAs('asv') },
        { id: 'read.par', label: t('menu.parallel'), icon: 'passage', active: version === 'par', onSelect: readAs('par') },
        { id: 'read.orig', label: t('menu.original'), icon: 'word', active: version === 'orig', onSelect: readAs('orig') },
        {
          id: 'read.interlinear',
          label: t('menu.interlinear'),
          icon: 'interlinear',
          active: version === 'interlinear',
          onSelect: () => go(interlinearHref(book, chapter)),
        },
      ],
    };

    const displayNode: RadialNode = {
      id: 'read.display',
      label: t('menu.display'),
      icon: 'display',
      children: [
        { id: 'display.verse', label: t('menu.versePerLine'), icon: 'display', active: display.layout === 'verse', onSelect: () => setDisplay({ layout: 'verse' }) },
        { id: 'display.paragraph', label: t('menu.paragraphs'), icon: 'display', active: display.layout === 'paragraph', onSelect: () => setDisplay({ layout: 'paragraph' }) },
        { id: 'display.redLetter', label: t('menu.redLetter'), icon: 'text', active: display.redLetter, onSelect: () => setDisplay({ redLetter: !display.redLetter }) },
      ],
    };

    const a11yNode: RadialNode = {
      id: 'read.a11y',
      label: t('menu.accessibility'),
      icon: 'text',
      children: [
        { id: 'a11y.larger', label: t('menu.largerText'), icon: 'plus', onSelect: () => stepFontScale(1) },
        { id: 'a11y.smaller', label: t('menu.smallerText'), icon: 'text', onSelect: () => stepFontScale(-1) },
        { id: 'a11y.dyslexia', label: t('menu.dyslexiaFont'), icon: 'text', active: display.dyslexiaFont, onSelect: () => setDisplay({ dyslexiaFont: !display.dyslexiaFont }) },
        { id: 'a11y.contrast', label: t('menu.highContrast'), icon: 'display', active: display.highContrast, onSelect: () => setDisplay({ highContrast: !display.highContrast }) },
      ],
    };

    const read: RadialNode = {
      id: 'read',
      label: t('menu.read'),
      icon: 'read',
      children: ([
        { id: 'read.goto', label: t('menu.goTo'), icon: 'search', onSelect: () => go('/?jump=1') },
        versionNode,
        displayNode,
        a11yNode,
        ...extra('read', ctx),
      ] as RadialNode[]).slice(0, 5),
    };

    const studyPassage = extra('study.passage', ctx);
    const studyReference = extra('study.reference', ctx);
    const studyChildren: RadialNode[] = [
      ...(studyPassage.length ? [{ id: 'study.passage', label: t('menu.thisPassage'), icon: 'passage' as const, children: studyPassage.slice(0, 5) }] : []),
      ...(studyReference.length ? [{ id: 'study.reference', label: t('menu.reference'), icon: 'dictionary' as const, children: studyReference.slice(0, 5) }] : []),
      ...extra('study', ctx),
    ].slice(0, 5);

    const memorize = extra('memorize', ctx);
    // Light / dark sits last under Resources (the site owner's choice). It flips whichever theme is
    // showing, starting from the device setting; like every display option it resets each visit.
    const themeNode: RadialNode = {
      id: 'res.theme',
      label: t('menu.lightDark'),
      a11yLabel: t(scheme === 'dark' ? 'menu.switchToLight' : 'menu.switchToDark'),
      icon: scheme === 'dark' ? 'sun' : 'moon',
      onSelect: () => setDisplay({ theme: scheme === 'dark' ? 'light' : 'dark' }),
    };
    const resources = [...extra('resources', ctx).slice(0, 4), themeNode];

    const top: RadialNode[] = [
      read,
      { id: 'search', label: t('menu.search'), icon: 'search', onSelect: () => go('/search') },
      { id: 'study', label: t('menu.study'), icon: 'study', ...(studyChildren.length ? { children: studyChildren } : { onSelect: () => go('/study') }) },
      { id: 'memorize', label: t('menu.memorize'), icon: 'memorize', ...(memorize.length ? { children: memorize.slice(0, 5) } : { onSelect: () => go('/memorize') }) },
      { id: 'resources', label: t('menu.resources'), icon: 'resources', children: resources },
    ];
    return top;
  }, [pathname, params.tr, passage, display, scheme]);
}
