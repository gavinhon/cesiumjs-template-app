import * as Cesium from 'cesium';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeLineOfSight, EYE_HEIGHT, raise } from './lineOfSight';

// The terrain sampler is the one thing these tests replace: it would
// otherwise need real terrain tiles over the network. `groundAt` decides
// the terrain height at each longitude, so a test can draw any profile.
let groundAt: (longitudeDegrees: number) => number = () => 0;

vi.mock('cesium', async (importOriginal) => {
  const actual = await importOriginal<typeof import('cesium')>();
  return {
    ...actual,
    sampleTerrainMostDetailed: vi.fn(
      async (_provider: unknown, positions: InstanceType<typeof actual.Cartographic>[]) => {
        for (const position of positions) {
          position.height = groundAt(actual.Math.toDegrees(position.longitude));
        }
        return positions;
      },
    ),
  };
});

/** A viewer with terrain to sample and no 3D Tiles — just enough for the analysis. */
const viewer = {
  terrainProvider: { availability: {} },
  scene: {
    mode: Cesium.SceneMode.SCENE3D,
    primitives: { length: 0, get: () => undefined },
    sampleHeightSupported: false,
  },
} as unknown as Cesium.Viewer;

// Observer and target 1 km apart along a line of latitude.
const FROM_LON = 103.8;
const TO_LON = 103.809;
const from = Cesium.Cartesian3.fromDegrees(FROM_LON, 1.35, 0);
const to = Cesium.Cartesian3.fromDegrees(TO_LON, 1.35, 0);
const midway = (FROM_LON + TO_LON) / 2;

beforeEach(() => {
  groundAt = () => 0;
});

describe('raise', () => {
  it('lifts a point straight up by the given height', () => {
    const raised = Cesium.Cartographic.fromCartesian(raise(from, EYE_HEIGHT));
    expect(raised.height).toBeCloseTo(EYE_HEIGHT, 4);
    expect(Cesium.Math.toDegrees(raised.longitude)).toBeCloseTo(FROM_LON, 9);
  });
});

describe('computeLineOfSight', () => {
  it('is clear over flat ground', async () => {
    const result = await computeLineOfSight(viewer, from, to, []);
    expect(result.obstruction).toBeNull();
  });

  it('puts the eye at standing height above the observer', async () => {
    const { eye } = await computeLineOfSight(viewer, from, to, []);
    expect(Cesium.Cartographic.fromCartesian(eye).height).toBeCloseTo(EYE_HEIGHT, 4);
  });

  it('is blocked by a hill between the two points, at the hill', async () => {
    groundAt = (lon) => (Math.abs(lon - midway) < 0.0005 ? 30 : 0);
    const { obstruction } = await computeLineOfSight(viewer, from, to, []);
    expect(obstruction).not.toBeNull();
    const blocked = Cesium.Cartographic.fromCartesian(obstruction as Cesium.Cartesian3);
    // On the hill's near face, at the hill's height.
    expect(Cesium.Math.toDegrees(blocked.longitude)).toBeGreaterThan(midway - 0.0006);
    expect(Cesium.Math.toDegrees(blocked.longitude)).toBeLessThan(midway);
    expect(blocked.height).toBeCloseTo(30, 4);
  });

  it('ignores a bump lower than the sampling-noise tolerance', async () => {
    // The sight line is ~0.85 m up at midway; 1 m pokes 0.15 m above it.
    groundAt = (lon) => (Math.abs(lon - midway) < 0.0005 ? 1 : 0);
    const { obstruction } = await computeLineOfSight(viewer, from, to, []);
    expect(obstruction).toBeNull();
  });

  it('doesn’t count the ground the target stands on as a blocker', async () => {
    // The target sits on a 20 m plateau that starts just short of it.
    const plateauStart = TO_LON - 0.000005; // about half a metre
    groundAt = (lon) => (lon >= plateauStart ? 20 : 0);
    const raisedTarget = Cesium.Cartesian3.fromDegrees(TO_LON, 1.35, 20);
    const { obstruction } = await computeLineOfSight(viewer, from, raisedTarget, []);
    expect(obstruction).toBeNull();
  });
});
