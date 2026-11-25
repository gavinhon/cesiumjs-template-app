import * as Cesium from 'cesium';
import type { ModelPlacement } from './modelTypes';

export interface TilesetFootprint {
  base: number;
  top: number;
  center: Cesium.Cartographic;
  under: Cesium.Cartographic[];
}

interface TilesetJsonTile {
  boundingVolume?: BoundingVolumeJson;
  content?: { boundingVolume?: BoundingVolumeJson };
  transform?: number[];
}

interface BoundingVolumeJson {
  region?: number[];
  box?: number[];
  sphere?: number[];
}

export function footprintOf(tilesetJson: unknown): TilesetFootprint | null {
  const root = (tilesetJson as { root?: TilesetJsonTile } | null)?.root;
  if (!root) return null;
  const volume = root.content?.boundingVolume ?? root.boundingVolume;
  if (!volume) return null;

  const transform =
    root.transform?.length === 16
      ? Cesium.Matrix4.fromArray(root.transform)
      : Cesium.Matrix4.IDENTITY;

  if (volume.region?.length === 6) {
    const [west, south, east, north, minimumHeight, maximumHeight] = volume.region;
    const center = new Cesium.Cartographic((west + east) / 2, (south + north) / 2);
    const corners = [
      [west, south],
      [east, south],
      [west, north],
      [east, north],
    ].map(([longitude, latitude]) => new Cesium.Cartographic(longitude, latitude));
    return { base: minimumHeight, top: maximumHeight, center, under: [center, ...corners] };
  }

  if (volume.box?.length === 12) {
    const box = volume.box;
    const localCenter = new Cesium.Cartesian3(box[0], box[1], box[2]);
    const axes = [0, 1, 2].map(
      (i) => new Cesium.Cartesian3(box[3 + i * 3], box[4 + i * 3], box[5 + i * 3]),
    );
    const corners: Cesium.Cartographic[] = [];
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const local = Cesium.Cartesian3.clone(localCenter);
          [sx, sy, sz].forEach((sign, i) => {
            Cesium.Cartesian3.add(
              local,
              Cesium.Cartesian3.multiplyByScalar(axes[i], sign, new Cesium.Cartesian3()),
              local,
            );
          });
          const world = Cesium.Matrix4.multiplyByPoint(transform, local, new Cesium.Cartesian3());
          corners.push(Cesium.Cartographic.fromCartesian(world));
        }
      }
    }
    const worldCenter = Cesium.Matrix4.multiplyByPoint(
      transform,
      localCenter,
      new Cesium.Cartesian3(),
    );
    const center = Cesium.Cartographic.fromCartesian(worldCenter);
    return {
      base: Math.min(...corners.map((corner) => corner.height)),
      top: Math.max(...corners.map((corner) => corner.height)),
      center: new Cesium.Cartographic(center.longitude, center.latitude),
      under: [center, ...corners].map(
        (point) => new Cesium.Cartographic(point.longitude, point.latitude),
      ),
    };
  }

  if (volume.sphere?.length === 4) {
    const [x, y, z, radius] = volume.sphere;
    const world = Cesium.Matrix4.multiplyByPoint(
      transform,
      new Cesium.Cartesian3(x, y, z),
      new Cesium.Cartesian3(),
    );
    const center = Cesium.Cartographic.fromCartesian(world);
    const scaledRadius = radius * Cesium.Matrix4.getMaximumScale(transform);
    const ground = new Cesium.Cartographic(center.longitude, center.latitude);
    return {
      base: center.height - scaledRadius,
      top: center.height + scaledRadius,
      center: ground,
      under: [ground],
    };
  }

  return null;
}

export function placementHint(tilesetJson: unknown): ModelPlacement | null {
  const placement = (tilesetJson as { extras?: { placement?: unknown } } | null)?.extras?.placement;
  return placement === 'on-terrain' || placement === 'draped' || placement === 'as-authored'
    ? placement
    : null;
}

const LARGEST_PLACEABLE_RADIUS = 20_000;

export const WORLDWIDE_RADIUS = 1_000_000;

export function isPlaceable(footprint: TilesetFootprint): boolean {
  const center = Cesium.Cartographic.toCartesian(footprint.center);
  return footprint.under.every(
    (point) =>
      Cesium.Cartesian3.distance(center, Cesium.Cartographic.toCartesian(point)) <=
      LARGEST_PLACEABLE_RADIUS,
  );
}

export function initialPlacement(
  footprint: TilesetFootprint,
  ground: number,
  hint: ModelPlacement | null,
): { placement: ModelPlacement; reason: string | null } {
  if (hint) return { placement: hint, reason: 'Set in tileset.json' };
  if (footprint.top < ground) {
    return { placement: 'as-authored', reason: 'Underground, hidden by terrain' };
  }
  return { placement: 'on-terrain', reason: null };
}

export async function groundHeightUnder(
  terrainProvider: Cesium.TerrainProvider,
  footprint: TilesetFootprint,
): Promise<number> {
  if (!terrainProvider.availability) return 0;
  const samples = footprint.under.map(
    (point) => new Cesium.Cartographic(point.longitude, point.latitude),
  );
  await Cesium.sampleTerrainMostDetailed(terrainProvider, samples);
  const heights = samples.map((sample) => sample.height).filter(Number.isFinite);
  return heights.length > 0 ? Math.min(...heights) : 0;
}

export function verticalShift(center: Cesium.Cartographic, meters: number): Cesium.Matrix4 {
  const from = Cesium.Cartesian3.fromRadians(center.longitude, center.latitude, 0);
  const to = Cesium.Cartesian3.fromRadians(center.longitude, center.latitude, meters);
  return Cesium.Matrix4.fromTranslation(
    Cesium.Cartesian3.subtract(to, from, new Cesium.Cartesian3()),
  );
}
