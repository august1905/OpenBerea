import { type ComponentType, createElement, lazy, Suspense } from 'react';

/**
 * Loads a component on first use (its code is split into a separate chunk on the web), showing
 * `fallback` meanwhile. Keeps rarely used panels out of the startup bundle.
 */
export function lazyComponent<P extends object>(load: () => Promise<ComponentType<P>>, fallback: React.ReactNode = null): ComponentType<P> {
  const Lazy = lazy(async () => ({ default: await load() }));
  function Deferred(props: P) {
    return createElement(Suspense, { fallback }, createElement(Lazy as ComponentType<P>, props));
  }
  return Deferred;
}
