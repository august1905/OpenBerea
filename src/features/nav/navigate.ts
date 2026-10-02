import { type Href, router } from 'expo-router';

import { activeTab, closeTab, openTab, stepTab, switchTab, tabsStore } from '@/lib/state/tabs';

// Navigation that keeps the in-memory tabs and the URL in step.

export function go(href: string) {
  router.push(href as Href);
}

export function replace(href: string) {
  router.replace(href as Href);
}

export function openInNewTab(href: string) {
  tabsStore.set((s) => openTab(s, href));
  router.push(href as Href);
}

export function newTab() {
  openInNewTab('/');
}

export function switchToTab(id: string) {
  const before = tabsStore.get();
  if (before.activeId === id) return;
  const next = switchTab(before, id);
  tabsStore.set(next);
  router.push(activeTab(next).href as Href);
}

export function stepToTab(dir: 1 | -1) {
  const next = stepTab(tabsStore.get(), dir);
  tabsStore.set(next);
  router.push(activeTab(next).href as Href);
}

export function switchToTabIndex(index: number) {
  const tab = tabsStore.get().tabs[index];
  if (tab) switchToTab(tab.id);
}

export function closeTabById(id: string) {
  const before = tabsStore.get();
  const wasActive = before.activeId === id;
  const next = closeTab(before, id);
  tabsStore.set(next);
  if (wasActive) router.replace(activeTab(next).href as Href);
}

export function closeActiveTab() {
  closeTabById(tabsStore.get().activeId);
}
