import * as Cesium from 'cesium';
import { describe, expect, it } from 'vitest';
import {
  footprintOf,
  groundHeightUnder,
  initialPlacement,
  placementHint,
  verticalShift,
  type TilesetFootprint,
} from './placeTilesetOnTerrain';

// The bounds of two real tilesets this app was tested with.
const CITY_REGION = {
  root: {
    boundingVolume: {
      region: [
        1.8123290481949434, 0.022161135098534547, 1.8127332317602762, 0.022719914029097617, -1, 64,
      ],
    },
  },
};
const BIM_TRANSFORM = [
  -0.9708361038124333, -0.23974415432767063, 0, 0, 0.0054614681326751345, -0.022116036396763766,
  0.999740492978012, 0, -0.23968193903614315, 0.9705841650262994, 0.02278040166606393, 0,
  -1528714.992381627, 6190481.31206984, 144322.97921752837, 1,
];
const BIM_BOX = {
  root: {
    transform: BIM_TRANSFORM,
    boundingVolume: {
      box: [
        33.27866789016329, 52.25630310004724, 62.58999999999999, 43.65728586466514, 0, 0, 0,
        32.9028903947812, 0, 0, 0, 15.299999999999997,
      ],
    },
  },
};

const degrees = (radians: number) => Cesium.Math.toDegrees(radians);

describe('footprintOf', () => {
  it('reads a region’s heights directly, sampling the centre and four corners', () => {
    const footprint = footprintOf(CITY_REGION);
    expect(footprint?.base).toBe(-1);
    expect(footprint?.top).toBe(64);
    expect(footprint?.under).toHaveLength(5);
    expect(degrees(footprint?.center.longitude ?? 0)).toBeCloseTo(103.8504, 3);
  });

  it('places a box through the root transform and finds its lowest corner', () => {
    const footprint = footprintOf(BIM_BOX);
    // Matches what Cesium's own loaded bounding volume reports for this model.
    expect(footprint?.base).toBeCloseTo(-2.39, 1);
    expect(footprint?.top).toBeCloseTo(28.21, 1);
    expect(degrees(footprint?.center.longitude ?? 0)).toBeCloseTo(103.8717, 3);
    expect(degrees(footprint?.center.latitude ?? 0)).toBeCloseTo(1.3058, 3);
    // Ground samples are positions on the surface; their heights are filled in later.
    expect(footprint?.under.every((point) => point.height === 0)).toBe(true);
  });

  it('prefers the tighter content bounding volume when the tileset declares one', () => {
    const footprint = footprintOf({
      root: {
        boundingVolume: { region: [0, 0, 0.001, 0.001, -60, 60] },
        content: { boundingVolume: { region: [0, 0, 0.001, 0.001, 0, 5] } },
      },
    });
    expect(footprint?.base).toBe(0);
    expect(footprint?.top).toBe(5);
  });

  it('reads a sphere as its centre plus and minus the radius', () => {
    const center = Cesium.Cartesian3.fromDegrees(103.8, 1.3, 100);
    const footprint = footprintOf({
      root: { boundingVolume: { sphere: [center.x, center.y, center.z, 30] } },
    });
    expect(footprint?.base).toBeCloseTo(70, 3);
    expect(footprint?.top).toBeCloseTo(130, 3);
  });

  it('returns null when there is nothing usable to read', () => {
    expect(footprintOf(null)).toBeNull();
    expect(footprintOf({})).toBeNull();
    expect(footprintOf({ root: {} })).toBeNull();
    expect(footprintOf({ root: { boundingVolume: { region: [1, 2, 3] } } })).toBeNull();
  });
});

describe('placementHint', () => {
  it('reads a placement from the tileset’s top-level extras', () => {
    expect(placementHint({ extras: { placement: 'as-authored' } })).toBe('as-authored');
    expect(placementHint({ extras: { placement: 'on-terrain' } })).toBe('on-terrain');
  });

  it('ignores anything else', () => {
    expect(placementHint({ extras: { placement: 'floating' } })).toBeNull();
    expect(placementHint({})).toBeNull();
    expect(placementHint(null)).toBeNull();
  });
});

describe('initialPlacement', () => {
  const footprint = (base: number, top: number): TilesetFootprint => ({
    base,
    top,
    center: new Cesium.Cartographic(),
    under: [],
  });

  it('puts a model authored on flat ground onto the terrain', () => {
    expect(initialPlacement(footprint(-1, 64), 11.4, null)).toEqual({
      placement: 'on-terrain',
      reason: null,
    });
  });

  it('leaves a model lying entirely below the surface underground', () => {
    expect(initialPlacement(footprint(-30, -8), 11.4, null)).toEqual({
      placement: 'as-authored',
      reason: 'Underground',
    });
  });

  it('lets the tileset’s own hint win over the automatic choice', () => {
    expect(initialPlacement(footprint(-30, -8), 11.4, 'on-terrain').placement).toBe('on-terrain');
    expect(initialPlacement(footprint(-1, 64), 11.4, 'as-authored')).toEqual({
      placement: 'as-authored',
      reason: 'Set in tileset.json',
    });
  });
});

describe('groundHeightUnder', () => {
  it('is 0 on the bare ellipsoid, which has no terrain data to sample', async () => {
    const footprint = footprintOf(CITY_REGION) as TilesetFootprint;
    expect(await groundHeightUnder(new Cesium.EllipsoidTerrainProvider(), footprint)).toBe(0);
  });
});

describe('verticalShift', () => {
  it('moves a point straight up by the given height, without sliding it sideways', () => {
    const center = Cesium.Cartographic.fromDegrees(103.87, 1.3);
    const before = Cesium.Cartesian3.fromRadians(center.longitude, center.latitude, -2.4);
    const after = Cesium.Matrix4.multiplyByPoint(
      verticalShift(center, 12.9),
      before,
      new Cesium.Cartesian3(),
    );
    const moved = Cesium.Cartographic.fromCartesian(after);
    expect(moved.height).toBeCloseTo(10.5, 3);
    expect(moved.longitude).toBeCloseTo(center.longitude, 10);
    expect(moved.latitude).toBeCloseTo(center.latitude, 10);
  });

  it('is the identity for no shift', () => {
    expect(
      Cesium.Matrix4.equals(verticalShift(new Cesium.Cartographic(), 0), Cesium.Matrix4.IDENTITY),
    ).toBe(true);
  });
});
