import * as Cesium from 'cesium';
import type { ModelPlacement } from './modelTypes';

/**
 * Setting a 3D Tiles model on the terrain.
 *
 * **Why models end up buried.** A tileset carries its own heights. Most BIM
 * exports and CityGML conversions are authored for flat ground at height 0
 * — the WGS84 ellipsoid, for Cesium — while real terrain is rarely at 0:
 * around Singapore the ground is 10–20 m above the ellipsoid even at the
 * coast, because the geoid itself sits ~8 m up. So the model loads sunk
 * into the hillside. It doesn't *look* buried at first, because 3D Tiles
 * draw over terrain by default; it misregisters against the imagery at
 * oblique angles, and a click on a roof finds the terrain above it.
 *
 * **What this does about it.** It moves the whole model vertically so its
 * lowest point sits on the lowest ground beneath it, via
 * `tileset.modelMatrix`. Lowest, so no edge of the model floats over a
 * slope; on sloping ground the uphill side is slightly embedded instead,
 * which is how a real building on a slope meets the ground too.
 *
 * **What it can't do.** A tileset moves as one rigid object. A city model
 * spread across hills can't have each building dropped onto its own patch
 * of ground — that needs the model's own georeferencing to be right. And
 * the "lowest point" is read from the tileset's declared bounding volume,
 * so a tileset whose bounds are padded well beyond its geometry ends up
 * that far off the ground; set it to "as authored" (see `placementHint`).
 *
 * **Underground models** — tunnels, utilities, basements authored at their
 * real depths — must not be lifted out of the ground. A model that lies
 * entirely below the terrain surface is taken to be one, and keeps its
 * authored height. The user can override that either way.
 */

/**
 * Where a tileset sits as authored, before any repositioning.
 *
 * Read from `tileset.json` rather than from Cesium's loaded tile, because
 * Cesium's bounding-volume classes are private API; the JSON's
 * `boundingVolume` is defined by the 3D Tiles spec and is the same data.
 */
export interface TilesetFootprint {
  /** Lowest point of the model, in metres above the WGS84 ellipsoid. */
  base: number;
  /** Highest point, likewise. */
  top: number;
  /** Middle of the footprint: where "up" is measured for the vertical shift. */
  center: Cesium.Cartographic;
  /** Ground positions under the model to sample terrain at — centre and corners. */
  under: Cesium.Cartographic[];
}

/** The subset of a tileset.json this module reads. */
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

/**
 * The footprint of a tileset, from its parsed `tileset.json`, or `null`
 * when its root declares no usable bounding volume.
 *
 * Uses the root *content's* bounding volume when there is one — the spec's
 * tighter fit to the actual geometry — and the tile's own otherwise.
 */
export function footprintOf(tilesetJson: unknown): TilesetFootprint | null {
  const root = (tilesetJson as { root?: TilesetJsonTile } | null)?.root;
  if (!root) return null;
  const volume = root.content?.boundingVolume ?? root.boundingVolume;
  if (!volume) return null;

  // Box and sphere are in the tile's own frame; `transform` (column-major,
  // as the spec and `Matrix4.fromArray` both define it) places that frame
  // on the globe. Regions are absolute and ignore it.
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

/**
 * A placement the tileset asks for itself, via a top-level
 * `"extras": { "placement": "as-authored" }` (or `"on-terrain"`, or
 * `"draped"` for a city model built on flat ground) in its tileset.json. `extras` is the spec's sanctioned place for
 * application-specific data, so the hint travels with the dataset: mark an
 * underground utility model once, and it never needs unticking again.
 */
export function placementHint(tilesetJson: unknown): ModelPlacement | null {
  const placement = (tilesetJson as { extras?: { placement?: unknown } } | null)?.extras?.placement;
  return placement === 'on-terrain' || placement === 'draped' || placement === 'as-authored'
    ? placement
    : null;
}

/**
 * Wider than this (centre to farthest corner, in metres), a tileset is
 * taken to be a city or more rather than one model. Moving it as one rigid
 * piece can't put it on the ground — every hill and valley under it wants
 * a different shift — and its "lowest point" is somewhere else entirely.
 * A worldwide buildings layer is the extreme: its bounds span the planet.
 */
const LARGEST_PLACEABLE_RADIUS = 20_000;

/**
 * Whether a tileset is small enough to be set on the terrain as one piece.
 *
 * Measured from the footprint's centre to its farthest corner in a straight
 * line, not along the ground: a geodesic fails to converge between
 * near-opposite points of the globe, which is exactly where a worldwide
 * tileset's corners are.
 */
export function isPlaceable(footprint: TilesetFootprint): boolean {
  const center = Cesium.Cartographic.toCartesian(footprint.center);
  return footprint.under.every(
    (point) =>
      Cesium.Cartesian3.distance(center, Cesium.Cartographic.toCartesian(point)) <=
      LARGEST_PLACEABLE_RADIUS,
  );
}

/**
 * The placement to start a tileset with, and why — the why is shown to the
 * user, so an underground model that "didn't move" doesn't look broken.
 */
export function initialPlacement(
  footprint: TilesetFootprint,
  ground: number,
  hint: ModelPlacement | null,
): { placement: ModelPlacement; reason: string | null } {
  if (hint) return { placement: hint, reason: 'Set in tileset.json' };
  // Entirely below the surface: built to be underground, so it stays put.
  // The terrain hides it (`depthTestAgainstTerrain`), so the reason says
  // so — otherwise a model that loaded fine looks like one that didn't.
  if (footprint.top < ground) {
    return { placement: 'as-authored', reason: 'Underground, hidden by terrain' };
  }
  return { placement: 'on-terrain', reason: null };
}

/**
 * The lowest terrain height under a footprint. Without terrain data (the
 * plain ellipsoid) the ground is at 0 everywhere — exactly what it is.
 */
export async function groundHeightUnder(
  terrainProvider: Cesium.TerrainProvider,
  footprint: TilesetFootprint,
): Promise<number> {
  if (!terrainProvider.availability) return 0;
  // Fresh copies: the sampler writes heights into the objects it's given.
  const samples = footprint.under.map(
    (point) => new Cesium.Cartographic(point.longitude, point.latitude),
  );
  await Cesium.sampleTerrainMostDetailed(terrainProvider, samples);
  const heights = samples.map((sample) => sample.height).filter(Number.isFinite);
  return heights.length > 0 ? Math.min(...heights) : 0;
}

/**
 * A translation moving a model `meters` straight up (negative: down) at
 * `center`. "Up" is the ellipsoid normal there, so the model is lifted
 * vertically rather than along the earth-centre axis — which, a long way
 * from the equator, would also slide it sideways.
 */
export function verticalShift(center: Cesium.Cartographic, meters: number): Cesium.Matrix4 {
  const from = Cesium.Cartesian3.fromRadians(center.longitude, center.latitude, 0);
  const to = Cesium.Cartesian3.fromRadians(center.longitude, center.latitude, meters);
  return Cesium.Matrix4.fromTranslation(
    Cesium.Cartesian3.subtract(to, from, new Cesium.Cartesian3()),
  );
}
