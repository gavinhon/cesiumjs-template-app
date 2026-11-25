import { useRef, useState, type PointerEvent } from 'react';

export type SheetDetent = 'peek' | 'half' | 'full';

const NEXT: Record<SheetDetent, SheetDetent> = { peek: 'half', half: 'full', full: 'half' };

const TAP_SLOP = 6;

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

export function nearestDetent(height: number, heights: Record<SheetDetent, number>): SheetDetent {
  return (Object.keys(heights) as SheetDetent[]).reduce((best, detent) =>
    Math.abs(heights[detent] - height) < Math.abs(heights[best] - height) ? detent : best,
  );
}

export function useBottomSheet<T extends HTMLElement>(initial: SheetDetent = 'half') {
  const sheetRef = useRef<T>(null);
  const [detent, setDetent] = useState<SheetDetent>(initial);
  const dragRef = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    const sheet = sheetRef.current;
    if (!sheet) return;
    dragRef.current = { startY: event.clientY, startHeight: sheet.offsetHeight, moved: false };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
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
