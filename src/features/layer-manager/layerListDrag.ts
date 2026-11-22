/**
 * Where a dragged row would land: its index in the list once dropped.
 *
 * `midpoints` are the vertical centres of every row, top to bottom, as they
 * were when the drag began — measured once then, because the dragged row
 * itself moves under the pointer and would otherwise count against itself.
 * The row lands below every other row whose centre the pointer has passed.
 *
 * Pure, so the drag logic is testable without a DOM.
 */
export function dropIndex(midpoints: readonly number[], from: number, pointerY: number): number {
  let index = 0;
  midpoints.forEach((midpoint, i) => {
    if (i !== from && midpoint < pointerY) index++;
  });
  return index;
}
