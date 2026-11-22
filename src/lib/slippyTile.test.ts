import { describe, expect, it } from 'vitest';
import { tileAt, tileBbox3857 } from './slippyTile';

describe('tileAt', () => {
  it('finds the zoom-0 tile for anywhere', () => {
    expect(tileAt(103.8, 1.35, 0)).toEqual({ z: 0, x: 0, y: 0 });
  });

  it('finds the tile over central Singapore', () => {
    // Checked against https://tile.openstreetmap.org/11/1614/1016.png,
    // which shows the middle of the island.
    expect(tileAt(103.8198, 1.3521, 11)).toEqual({ z: 11, x: 1614, y: 1016 });
  });

  it('stays inside the grid at the edges', () => {
    expect(tileAt(180, 0, 3).x).toBe(7);
    expect(tileAt(0, 89.9, 3).y).toBe(0);
  });
});

describe('tileBbox3857', () => {
  it('covers the whole world at zoom 0', () => {
    const [minX, minY, maxX, maxY] = tileBbox3857({ z: 0, x: 0, y: 0 });
    expect(minX).toBeCloseTo(-20037508.34, 1);
    expect(maxY).toBeCloseTo(20037508.34, 1);
    expect(maxX).toBeCloseTo(20037508.34, 1);
    expect(minY).toBeCloseTo(-20037508.34, 1);
  });

  it('puts zoom-1 tile (1, 0) in the north-east quarter', () => {
    const [minX, minY, maxX, maxY] = tileBbox3857({ z: 1, x: 1, y: 0 });
    expect([minX, minY]).toEqual([0, 0]);
    expect(maxX).toBeCloseTo(20037508.34, 1);
    expect(maxY).toBeCloseTo(20037508.34, 1);
  });
});
