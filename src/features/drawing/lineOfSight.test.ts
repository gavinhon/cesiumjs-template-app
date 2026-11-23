import * as Cesium from 'cesium';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeLineOfSight } from './lineOfSight';

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

describe('computeLineOfSight', () => {
  it('is clear over flat ground', async () => {
    const result = await computeLineOfSight(viewer, from, to, []);
    expect(result.obstruction).toBeNull();
  });

  it('starts at exactly the chosen point, not a standing eye height above it', async () => {
    const { eye } = await computeLineOfSight(viewer, from, to, []);
    expect(Cesium.Cartesian3.distance(eye, from)).toBeLessThan(1e-6);
  });

  it('is blocked by a hill between the two points, where the line meets it', async () => {
    groundAt = (lon) => (Math.abs(lon - midway) < 0.0005 ? 30 : 0);
    const { obstruction } = await computeLineOfSight(viewer, from, to, []);
    expect(obstruction).not.toBeNull();
    const blocked = Cesium.Cartographic.fromCartesian(obstruction as Cesium.Cartesian3);
    // On the hill's near face, and on the sight line itself — at ground
    // level here — not up at the 30 m summit, so the clear line runs
    // straight to it instead of bending up to the top of whatever blocked it.
    expect(Cesium.Math.toDegrees(blocked.longitude)).toBeGreaterThan(midway - 0.0006);
    expect(Cesium.Math.toDegrees(blocked.longitude)).toBeLessThan(midway);
    expect(Math.abs(blocked.height)).toBeLessThan(0.5);
  });

  it('ignores a bump lower than the sampling-noise tolerance', async () => {
    // The sight line runs along the ground; 0.2 m pokes just above it.
    groundAt = (lon) => (Math.abs(lon - midway) < 0.0005 ? 0.2 : 0);
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

describe('computeLineOfSight through 3D Tiles', () => {
  /** A viewer whose scene can cast rays, answering with `hit` (or nothing). */
  function rayViewer(hit: Cesium.Cartesian3 | null) {
    const sampleHeightMostDetailed = vi.fn(async () => []);
    // The start point's own surface comes first, as it does in a real scene.
    const drillPickFromRayMostDetailed = vi.fn(async () =>
      hit ? [{ position: Cesium.Cartesian3.clone(from) }, { position: hit }] : [],
    );
    const rayScene = {
      mode: Cesium.SceneMode.SCENE3D,
      primitives: { length: 0, get: () => undefined },
      sampleHeightSupported: true,
      sampleHeightMostDetailed,
      drillPickFromRayMostDetailed,
    };
    return {
      viewer: {
        terrainProvider: { availability: {} },
        scene: rayScene,
      } as unknown as Cesium.Viewer,
      sampleHeightMostDetailed,
      drillPickFromRayMostDetailed,
    };
  }

  it('is blocked where the ray meets a wall, on the sight line', async () => {
    const wall = Cesium.Cartesian3.fromDegrees(midway, 1.35, 0.85);
    const { viewer: walled } = rayViewer(wall);
    const { obstruction } = await computeLineOfSight(walled, from, to, []);
    expect(obstruction).not.toBeNull();
    expect(Cesium.Cartesian3.distance(obstruction as Cesium.Cartesian3, wall)).toBeLessThan(1e-6);
  });

  it('is clear when the ray only meets the surface the target stands on', async () => {
    const { viewer: open } = rayViewer(Cesium.Cartesian3.clone(to));
    const { obstruction } = await computeLineOfSight(open, from, to, []);
    expect(obstruction).toBeNull();
  });

  it('casts the line instead of sampling building heights from above', async () => {
    // The top-down samples are what called a line through a window blocked.
    const {
      viewer: open,
      sampleHeightMostDetailed,
      drillPickFromRayMostDetailed,
    } = rayViewer(null);
    const { obstruction } = await computeLineOfSight(open, from, to, []);
    expect(obstruction).toBeNull();
    expect(drillPickFromRayMostDetailed).toHaveBeenCalledOnce();
    expect(sampleHeightMostDetailed).not.toHaveBeenCalled();
  });

  it('still stops at a hill nearer than anything the ray hits', async () => {
    groundAt = (lon) => (Math.abs(lon - midway) < 0.0005 ? 30 : 0);
    const beyondHill = Cesium.Cartesian3.fromDegrees(midway + 0.002, 1.35, 0.5);
    const { viewer: hilly } = rayViewer(beyondHill);
    const { obstruction } = await computeLineOfSight(hilly, from, to, []);
    const blocked = Cesium.Cartographic.fromCartesian(obstruction as Cesium.Cartesian3);
    expect(Cesium.Math.toDegrees(blocked.longitude)).toBeLessThan(midway);
  });
});
