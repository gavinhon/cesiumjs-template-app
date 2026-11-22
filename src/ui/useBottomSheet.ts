import { useRef, useState, type PointerEvent } from 'react';

/**
 * How far up a bottom sheet is pulled: just its header (`peek`), half the
 * screen, or nearly all of it — the three resting heights maps apps use.
 */
export type SheetDetent = 'peek' | 'half' | 'full';

/** What a tap on the grabber does: step up, and from the top back to half. */
const NEXT: Record<SheetDetent, SheetDetent> = { peek: 'half', half: 'full', full: 'half' };

/** Below this many pixels a press is a tap, not a drag. */
const TAP_SLOP = 6;

/**
 * Resting heights in pixels, for snapping. These must agree with the
 * `.panel--sheet-*` / `.feature-info--sheet-*` heights in CSS: peek is
 * 128px; half is 50% of the viewport; full stops below the toolbar (an 8px
 * inset, a control, and two 8px gaps).
 */
export function detentHeights(): Record<SheetDetent, number> {
  const control =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--control-height')) ||
    44;
  const viewport = window.innerHeight;
  return {
    peek: 128,
    half: Math.round(viewport * 0.5),
    full: viewport - control - 24,
  };
}

/** The detent whose height is nearest `height`. */
export function nearestDetent(height: number, heights: Record<SheetDetent, number>): SheetDetent {
  return (Object.keys(heights) as SheetDetent[]).reduce((best, detent) =>
    Math.abs(heights[detent] - height) < Math.abs(heights[best] - height) ? detent : best,
  );
}

/**
 * Drag-to-resize for a phone bottom sheet: the panels in the compact
 * layout and the docked feature card.
 *
 * Give the sheet `sheetRef` and a `--sheet-<detent>` class from `detent`,
 * and spread `grabberProps` onto a button at its top. Dragging writes the
 * height straight to the element — 60 pointer events a second through
 * React state would re-render the whole panel each time — and on release
 * the sheet snaps to the nearest detent, which *is* state, because it
 * changes rarely. A tap (or Enter/Space, since it's a button) steps
 * through the detents, so the sheet is resizable without a drag at all.
 */
export function useBottomSheet<T extends HTMLElement>(initial: SheetDetent = 'half') {
  const sheetRef = useRef<T>(null);
  const [detent, setDetent] = useState<SheetDetent>(initial);
  const dragRef = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null);
  // Set when a drag ends, so the click the browser fires after the pointer
  // goes up isn't also taken as a tap.
  const suppressClickRef = useRef(false);

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    const sheet = sheetRef.current;
    if (!sheet) return;
    dragRef.current = { startY: event.clientY, startHeight: sheet.offsetHeight, moved: false };
    // Capture keeps the drag going when the finger slides off the thin
    // grabber. It throws for a pointer the browser doesn't consider active
    // (some synthetic events); the drag still works without it.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Not capturable — carry on uncaptured.
    }
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    const sheet = sheetRef.current;
    if (!drag || !sheet) return;
    const delta = drag.startY - event.clientY;
    if (!drag.moved && Math.abs(delta) < TAP_SLOP) return;
    drag.moved = true;
    const { peek, full } = detentHeights();
    const height = Math.min(Math.max(drag.startHeight + delta, peek * 0.6), full);
    // The CSS transition would make the sheet lag behind the finger.
    sheet.style.transition = 'none';
    sheet.style.height = `${height}px`;
  }

  function onPointerEnd() {
    const drag = dragRef.current;
    const sheet = sheetRef.current;
    dragRef.current = null;
    if (!drag?.moved || !sheet) return;
    suppressClickRef.current = true;
    const next = nearestDetent(sheet.offsetHeight, detentHeights());
    // Hand the height back to the stylesheet; the class change snaps it.
    sheet.style.transition = '';
    sheet.style.height = '';
    setDetent(next);
  }

  function onClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setDetent((current) => NEXT[current]);
  }

  return {
    sheetRef,
    detent,
    setDetent,
    grabberProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onClick,
      'aria-label': `Resize (now ${detent === 'peek' ? 'minimised' : detent})`,
    },
  };
}
