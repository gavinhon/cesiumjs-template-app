import { describe, expect, it } from 'vitest';
import { dropIndex } from './layerListDrag';

describe('dropIndex', () => {
  // Four 40px rows starting at y = 100.
  const midpoints = [120, 160, 200, 240];

  it('stays put until the pointer passes a neighbour’s centre', () => {
    expect(dropIndex(midpoints, 1, 150)).toBe(1);
    expect(dropIndex(midpoints, 1, 170)).toBe(1);
  });

  it('moves down past each centre crossed', () => {
    expect(dropIndex(midpoints, 0, 205)).toBe(2);
    expect(dropIndex(midpoints, 0, 400)).toBe(3);
  });

  it('moves up past each centre crossed', () => {
    expect(dropIndex(midpoints, 3, 155)).toBe(1);
    expect(dropIndex(midpoints, 3, 0)).toBe(0);
  });
});
