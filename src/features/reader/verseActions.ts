import type { IconName } from '@/components/Icon';
import type { BookCode } from '@/lib/bible/books';

// Feature areas register actions for the verse tools sheet (cross-references, commentary, links, …).

export interface VerseContext {
  book: BookCode;
  chapter: number;
  verse: number;
}

export interface VerseAction {
  id: string;
  label: string;
  icon: IconName;
  onPress: () => void;
}

/** Inline panels shown in the verse sheet (e.g. the cross-reference list). */
export interface VersePanel {
  id: string;
  render: (ctx: VerseContext, close: () => void) => React.ReactNode;
}

type ActionFactory = (ctx: VerseContext) => VerseAction | null;

const actions: ActionFactory[] = [];
const panels: VersePanel[] = [];

export function registerVerseAction(factory: ActionFactory) {
  actions.push(factory);
}

export function registerVersePanel(panel: VersePanel) {
  panels.push(panel);
}

export function verseActions(ctx: VerseContext): VerseAction[] {
  return actions.map((f) => f(ctx)).filter((a): a is VerseAction => !!a);
}

export function versePanels(): VersePanel[] {
  return panels;
}
