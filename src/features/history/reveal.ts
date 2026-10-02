import { domNode } from '@/lib/platform/dom';

/**
 * Scrolls the page so the node is in view (web). Native builds will need measureLayout against the
 * screen's ScrollView; until then this is a no-op there and the content is simply not scrolled.
 */
export function revealNode(node: unknown, block: 'start' | 'center' = 'start') {
  const el = domNode(node);
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block, inline: 'nearest' });
}
