import { describe, expect, it } from 'vitest';
import { decodeHeight, encodeHeight, rasterizeTriangle } from './terrainHeightmap';

describe('encodeHeight', () => {
  it('round-trips to a tenth of a metre', () => {
    for (const height of [-12.34, 0, 8.05, 163.7, 4000]) {
      expect(Math.abs(decodeHeight(encodeHeight(height)) - height)).toBeLessThanOrEqual(
        0.05 + 1e-9,
      );
    }
  });

  it('fits in two bytes, clamping what it can’t hold', () => {
    expect(encodeHeight(-5000)).toBe(0);
    expect(encodeHeight(9000)).toBe(65535);
  });
});

describe('rasterizeTriangle', () => {
  const grid = (width: number, height: number) => ({
    width,
    height,
    heights: new Float32Array(width * height),
    filled: new Uint8Array(width * height),
  });

  it('interpolates heights across the texels inside it', () => {
    const g = grid(4, 4);
    // A slope rising 10 m per texel eastward.
    rasterizeTriangle(g, [0, 0, 0], [3, 0, 30], [0, 3, 0]);
    expect(g.filled[0]).toBe(1);
    expect(g.heights[2]).toBeCloseTo(20);
    expect(g.heights[1 * 4 + 1]).toBeCloseTo(10);
    // (3, 3) is across the diagonal: the other triangle's.
    expect(g.filled[3 * 4 + 3]).toBe(0);
  });

  it('leaves no crack along an edge two triangles share', () => {
    const g = grid(5, 5);
    rasterizeTriangle(g, [0, 0, 5], [4, 0, 5], [0, 4, 5]);
    rasterizeTriangle(g, [4, 0, 5], [4, 4, 5], [0, 4, 5]);
    expect([...g.filled].every((value) => value === 1)).toBe(true);
  });

  it('clips to the grid', () => {
    const g = grid(2, 2);
    // Far larger than the grid: covers it all without writing outside it.
    rasterizeTriangle(g, [-10, -10, 1], [30, -10, 1], [-10, 30, 1]);
    expect([...g.filled]).toEqual([1, 1, 1, 1]);
  });
});
