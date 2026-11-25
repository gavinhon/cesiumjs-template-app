export function dropIndex(midpoints: readonly number[], from: number, pointerY: number): number {
  let index = 0;
  midpoints.forEach((midpoint, i) => {
    if (i !== from && midpoint < pointerY) index++;
  });
  return index;
}
