import { domNode } from '@/lib/platform/dom';

// Web-only map input: mouse-wheel (and trackpad pinch) zoom and arrow-key panning on the map
// surface. On native, domNode() returns null and this is a no-op; touch pan and pinch use the
// responder system, which works on both platforms.

export interface MapInputHandlers {
  /** Zoom by `factor` around (x, y), in pixels from the map's top-left corner. */
  zoom: (factor: number, x: number, y: number) => void;
  /** Returns true when the key was handled. */
  key: (key: string) => boolean;
}

export function attachMapInput(node: unknown, handlers: MapInputHandlers): () => void {
  const el = domNode(node);
  if (!el) return () => {};
  // The map owns touch gestures; the page still scrolls from anywhere else.
  el.style.touchAction = 'none';
  el.style.cursor = 'grab';
  el.style.userSelect = 'none';
  // The frame clips its edges (rounded corners), so draw the keyboard focus ring inside.
  el.style.outlineOffset = '-4px';
  el.style.borderRadius = '14px';
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    // Trackpad pinches arrive as wheel events with ctrlKey and small deltas.
    const rate = e.ctrlKey ? 0.01 : 0.0015;
    const factor = Math.exp(-e.deltaY * unit * rate);
    const rect = el.getBoundingClientRect();
    handlers.zoom(Math.min(2, Math.max(0.5, factor)), e.clientX - rect.left, e.clientY - rect.top);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (handlers.key(e.key)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  // A tap opens a sheet; without this, the browser's follow-up click would land on its backdrop.
  const onTouchEnd = (e: TouchEvent) => {
    if (e.cancelable) e.preventDefault();
  };
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('keydown', onKey);
  el.addEventListener('touchend', onTouchEnd, { passive: false });
  return () => {
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('keydown', onKey);
    el.removeEventListener('touchend', onTouchEnd);
  };
}

/** Shows the grabbing cursor while dragging (web). */
export function setGrabbing(node: unknown, grabbing: boolean) {
  const el = domNode(node);
  if (el) el.style.cursor = grabbing ? 'grabbing' : 'grab';
}
