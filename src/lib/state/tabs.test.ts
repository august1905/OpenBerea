import { describe, expect, it } from 'vitest';

import { activeTab, closeTab, initialTabs, openTab, stepTab, switchTab, syncLocation } from './tabs';

describe('tabs', () => {
  it('opens a tab after the active one and activates it', () => {
    let s = initialTabs('/read/jhn/3');
    s = openTab(s, '/word/G25');
    expect(s.tabs.map((t) => t.href)).toEqual(['/read/jhn/3', '/word/G25']);
    expect(activeTab(s).href).toBe('/word/G25');
  });

  it('follows navigation in the active tab', () => {
    let s = initialTabs('/read/jhn/3');
    s = syncLocation(s, '/read/jhn/4');
    expect(s.tabs).toHaveLength(1);
    expect(activeTab(s).href).toBe('/read/jhn/4');
  });

  it('switches tabs when back/forward lands on another tab', () => {
    let s = initialTabs('/read/jhn/3');
    const first = s.activeId;
    s = openTab(s, '/read/rom/8');
    s = syncLocation(s, '/read/jhn/3');
    expect(s.activeId).toBe(first);
    expect(s.tabs).toHaveLength(2);
  });

  it('closes tabs and picks a neighbor', () => {
    let s = initialTabs('/a');
    s = openTab(s, '/b');
    s = openTab(s, '/c');
    const middle = s.tabs[1].id;
    s = switchTab(s, middle);
    s = closeTab(s, middle);
    expect(s.tabs.map((t) => t.href)).toEqual(['/a', '/c']);
    expect(activeTab(s).href).toBe('/c');
    s = closeTab(closeTab(s, s.tabs[0].id), s.tabs[1].id);
    expect(s.tabs).toHaveLength(1);
    expect(activeTab(s).href).toBe('/');
  });

  it('steps through tabs with wraparound', () => {
    let s = initialTabs('/a');
    s = openTab(s, '/b');
    s = stepTab(s, 1);
    expect(activeTab(s).href).toBe('/a');
    s = stepTab(s, -1);
    expect(activeTab(s).href).toBe('/b');
  });
});
