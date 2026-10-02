import { createStore, useStore } from './store';

// Open tabs for this visit. Memory only: closing or reloading the site clears them (spec: Tabs).

export interface Tab {
  id: string;
  /** Current location of the tab: path plus query, e.g. "/read/jhn/3?tr=asv". */
  href: string;
}

export interface TabsState {
  tabs: Tab[];
  activeId: string;
}

let counter = 0;
const newId = () => `t${++counter}`;

export function initialTabs(href: string): TabsState {
  const id = newId();
  return { tabs: [{ id, href }], activeId: id };
}

export const tabsStore = createStore<TabsState>(initialTabs('/'));

export function useTabs(): TabsState {
  return useStore(tabsStore);
}

export function activeTab(state: TabsState = tabsStore.get()): Tab {
  return state.tabs.find((t) => t.id === state.activeId) ?? state.tabs[0];
}

// Pure reducers (unit-tested), plus store helpers that apply them.

export function syncLocation(state: TabsState, href: string): TabsState {
  const active = activeTab(state);
  if (active.href === href) return state;
  // Back/forward onto another tab's page switches to that tab.
  const match = state.tabs.find((t) => t.href === href);
  if (match) return { ...state, activeId: match.id };
  return { ...state, tabs: state.tabs.map((t) => (t.id === active.id ? { ...t, href } : t)) };
}

export function openTab(state: TabsState, href: string): TabsState {
  const id = newId();
  const index = state.tabs.findIndex((t) => t.id === state.activeId);
  const tabs = [...state.tabs];
  tabs.splice(index + 1, 0, { id, href });
  return { tabs, activeId: id };
}

export function closeTab(state: TabsState, id: string): TabsState {
  const index = state.tabs.findIndex((t) => t.id === id);
  if (index < 0) return state;
  const tabs = state.tabs.filter((t) => t.id !== id);
  if (!tabs.length) return initialTabs('/');
  const activeId = state.activeId === id ? tabs[Math.min(index, tabs.length - 1)].id : state.activeId;
  return { tabs, activeId };
}

export function switchTab(state: TabsState, id: string): TabsState {
  return state.tabs.some((t) => t.id === id) ? { ...state, activeId: id } : state;
}

export function stepTab(state: TabsState, dir: 1 | -1): TabsState {
  const index = state.tabs.findIndex((t) => t.id === state.activeId);
  const next = state.tabs[(index + dir + state.tabs.length) % state.tabs.length];
  return { ...state, activeId: next.id };
}
