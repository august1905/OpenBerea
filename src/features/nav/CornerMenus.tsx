import { useGlobalSearchParams, usePathname } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { ListMenu } from '@/components/ListMenu';
import { CornerMenu } from '@/components/radial/CornerMenu';
import type { RadialNode } from '@/components/radial/types';
import { t } from '@/i18n';
import { isTypingTarget, onDocumentKey } from '@/lib/platform/dom';
import { syncLocation, tabsStore, useTabs } from '@/lib/state/tabs';
import { useTheme } from '@/theme';

import { describeHref, tabAccessibleLabel } from './describe';
import { closeActiveTab, closeTabById, go, newTab, stepToTab, switchToTab, switchToTabIndex } from './navigate';
import { useMainMenu } from './useMainMenu';

// Names used for dynamic route segments ([book], [chapter], …). Expo Router reports them as params,
// so they're excluded when rebuilding the query string. Never use these names as query keys.
const ROUTE_PARAMS = new Set(['book', 'chapter', 'strongs', 'id', 'dict', 'entry', 'n']);

/** Current location as "/path?query", for tab tracking. */
function useHref(): string {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  return useMemo(() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || ROUTE_PARAMS.has(k)) continue;
      q.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }
    const qs = q.toString();
    return pathname + (qs ? `?${qs}` : '');
  }, [pathname, params]);
}

/** Keeps the active tab pointed at the current URL. */
function TabsSync() {
  const href = useHref();
  useEffect(() => {
    tabsStore.set((s) => syncLocation(s, href));
  }, [href]);
  return null;
}

function useTabNodes(): RadialNode[] {
  const { tabs, activeId } = useTabs();
  return useMemo(() => {
    const nodes: RadialNode[] = tabs.map((tab) => {
      const d = describeHref(tab.href);
      return {
        id: tab.id,
        label: tabAccessibleLabel(tab.href),
        short: d.label,
        icon: d.icon,
        active: tab.id === activeId,
        onSelect: () => switchToTab(tab.id),
        onDismiss: () => closeTabById(tab.id),
      };
    });
    nodes.push({ id: 'new', label: t('tabs.new'), short: t('tabs.newShort'), icon: 'plus', onSelect: newTab });
    return nodes;
  }, [tabs, activeId]);
}

/** Visually hidden until focused: the keyboard and screen-reader entry point to each menu. */
function SkipButton({ label, onPress, side, testID }: { label: string; onPress: () => void; side: 'left' | 'right'; testID: string }) {
  const { palette, fonts } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        focused
          ? [styles.skipVisible, { [side]: 12, backgroundColor: palette.surface, borderColor: palette.focus }]
          : styles.srOnly,
      ]}
    >
      <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Both corner menus (main bottom-right, tabs bottom-left), their list-menu fallbacks, and the
 * keyboard shortcuts.
 */
export function CornerMenus() {
  const { palette, fonts } = useTheme();
  const main = useMainMenu();
  const tabNodes = useTabNodes();
  const [list, setList] = useState<'main' | 'tabs' | null>(null);

  useEffect(
    () =>
      onDocumentKey((e) => {
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e)) return;
        const key = e.key;
        const act = (fn: () => void) => {
          e.preventDefault();
          fn();
        };
        if (key === 'm' || key === 'M') act(() => setList((l) => (l === 'main' ? null : 'main')));
        else if (key === 't' || key === 'T') act(() => setList((l) => (l === 'tabs' ? null : 'tabs')));
        else if (key === 'n' || key === 'N') act(newTab);
        else if (key === 'x' || key === 'X') act(closeActiveTab);
        else if (key === ']') act(() => stepToTab(1));
        else if (key === '[') act(() => stepToTab(-1));
        else if (/^[1-9]$/.test(key)) act(() => switchToTabIndex(Number(key) - 1));
        else if (key === 'g' || key === 'G') act(() => go('/?jump=1'));
        else if (key === '/') act(() => go('/search'));
      }),
    [],
  );

  const shortcuts =
    Platform.OS === 'web' ? (
      <Text style={[styles.shortcuts, { color: palette.muted, fontFamily: fonts.ui, borderColor: palette.rule }]}>
        {t('shortcuts.title')}: {t('shortcuts.list')}
      </Text>
    ) : null;

  return (
    <>
      <TabsSync />
      <SkipButton testID="main-menu-button" side="right" label={t('menu.openMain')} onPress={() => setList('main')} />
      <SkipButton testID="tabs-menu-button" side="left" label={t('menu.openTabs')} onPress={() => setList('tabs')} />
      <CornerMenu corner="bottom-left" variant="tabs" nodes={tabNodes} testID="tabs-menu" />
      <CornerMenu corner="bottom-right" variant="menu" nodes={main} testID="main-menu" />
      <ListMenu
        testID="main-list"
        visible={list === 'main'}
        title={t('menu.main')}
        nodes={main}
        onClose={() => setList(null)}
        footer={shortcuts}
      />
      <ListMenu
        testID="tabs-list"
        visible={list === 'tabs'}
        title={t('menu.tabs')}
        nodes={tabNodes.map((n) => (n.id === 'new' ? { ...n, label: t('tabs.new') } : n))}
        onClose={() => setList(null)}
        footer={shortcuts}
      />
    </>
  );
}

const styles = StyleSheet.create({
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
    bottom: 0,
    left: 0,
  },
  skipVisible: {
    position: 'absolute',
    bottom: 64,
    zIndex: 70,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
  },
  shortcuts: { fontSize: 13, lineHeight: 19, padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
