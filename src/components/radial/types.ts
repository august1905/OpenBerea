import type { IconName } from '../Icon';

/** One item in a corner menu. Items with children open their own arc (marking-menu style). */
export interface RadialNode {
  id: string;
  label: string;
  /** Spoken label in the list menu, when the visible label alone doesn't say what happens. */
  a11yLabel?: string;
  /** Short text shown inside a sphere (tabs menu), e.g. "Jn 3". */
  short?: string;
  icon?: IconName;
  children?: RadialNode[];
  onSelect?: () => void;
  /** Currently in effect (e.g. the active tab or translation). */
  active?: boolean;
  /** Tabs: dragging the sphere off the arc calls this (closes the tab). */
  onDismiss?: () => void;
  disabled?: boolean;
}
