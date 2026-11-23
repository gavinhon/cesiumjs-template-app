import * as Cesium from 'cesium';
import { MAP_COLORS } from '@/cesium/mapColors';
import { EYE_HEIGHT, sampleGroundHeights, visibleTilesets } from './lineOfSight';
import { formatDistance } from './measurement';

/**
 * Viewshed analysis: everything a person standing at one point could see
 * within a radius.
 *
 * **CesiumJS has no viewshed API either.** The two ways people build one:
 *
 *  - **GPU shadow mapping** — render depth from the observer's position and
 *    test every pixel on screen against it. Fast and includes buildings,
 *    but depends on Cesium's private `ShadowMap` internals and a custom
 *    shader, both of which break across Cesium releases.
 *  - **Ray tracing over terrain samples** — what GIS packages do, and what
 *    this module does. Cast rays outward from the observer, sample terrain
 *    height along each, and walk outward keeping the steepest angle seen so
 *    far: a point is visible exactly when it rises above everything nearer
 *    on its ray. Uses only public APIs, so it survives Cesium upgrades.
 *
 * **Buildings count, where there are any.** Terrain is sampled
 * everywhere; 3D Tiles (`scene.sampleHeightMostDetailed`) only at samples
 * inside a shown tileset's footprint, because each scene sample costs a
 * small GPU render and a viewshed has up to `MAX_SAMPLES` of them. For one
 * building that's hundreds to a few thousand, depending on the spacing. A tileset covering the whole
 * circle (a city) would mean all of them, so past `MAX_BUILDING_SAMPLES`
 * the whole grid is coarsened until the building samples fit — a coarser
 * viewshed that still sees buildings beats an exact one that ignores them.
 *
 * The result is painted into a canvas and draped on the ground, so it
 * follows the terrain like any other imagery would.
 */

/** Sample budget across the whole viewshed — keeps one analysis around a second. */
const MAX_SAMPLES = 160_000;
/**
 * Budget for the samples that also ask the 3D Tiles for a height — each a
 * small render, so far fewer than the terrain budget.
 */
const MAX_BUILDING_SAMPLES = 12_000;
/** Pixels across the draped result. More just costs memory: the sampling is the limit. */
const IMAGE_SIZE = 512;
/**
 * Refraction bends sight lines slightly around the earth's curve, so a
 * viewer sees a little further than pure geometry says. 0.13 is the
 * standard coefficient GIS packages use for visible light.
 */
const REFRACTION = 0.13;
/** Mean earth radius — only for the curvature drop, where 0.5% doesn't matter. */
const EARTH_RADIUS = 6_371_000;

/**
 * How many metres one radian of latitude and of longitude span at a given
 * latitude, on the WGS84 ellipsoid Cesium draws.
 *
 * A sphere is not close enough here: near the equator a spherical earth
 * puts a point "1 km north" only 994 m away on Cesium's globe, so the
 * viewshed's rim and image came out visibly short of the radius it reported.
 * The ellipsoid's curvature differs north–south (meridian radius) from
 * east–west (prime-vertical radius); these are the textbook formulas.
 */
function metresPerRadian(latitude: number): { north: number; east: number } {
  const { maximumRadius: a, minimumRadius: b } = Cesium.Ellipsoid.WGS84;
  const e2 = 1 - (b * b) / (a * a);
  const w = 1 - e2 * Math.sin(latitude) ** 2;
  return {
    north: (a * (1 - e2)) / w ** 1.5,
    east: (a / Math.sqrt(w)) * Math.cos(latitude),
  };
}

export interface ViewshedResult {
  /** The visible/hidden pattern, transparent outside the radius. */
  image: HTMLCanvasElement;
  /** Where on the globe the image goes. */
  rectangle: Cesium.Rectangle;
  /** Share of the area within the radius that is visible, 0–1. */
  visibleFraction: number;
  /** Whether any 3D Tiles stood within the radius and were sampled. */
  includesBuildings: boolean;
}

/** A ray grid: how many rays, how many samples on each, how far apart. */
export interface ViewshedGrid {
  rays: number;
  steps: number;
  spacing: number;
}

/**
 * A tileset's footprint in the observer's local frame, in metres east and
 * north of the observer — its bounding sphere seen from above. Generous
 * (a sphere encloses more than the model), which only costs a few extra
 * samples that find no building and keep the terrain height.
 */
export interface Footprint {
  east: number;
  north: number;
  radius: number;
}

/**
 * The ray grid for a viewshed of `radius` metres within `budget` samples.
 * Rays sit close enough at the rim that neighbours are about one sample
 * apart, so the result doesn't fan out into spokes.
 */
export function viewshedGrid(radius: number, budget: number, minSpacing = 2): ViewshedGrid {
  let spacing = Math.max(minSpacing, radius / 150);
  let rays = Math.min(1440, Math.max(360, Math.round((2 * Math.PI * radius) / spacing)));
  let steps = Math.ceil(radius / spacing);
  if (rays * steps > budget) {
    const shrink = Math.sqrt((rays * steps) / budget);
    spacing *= shrink;
    rays = Math.max(360, Math.round(rays / shrink));
    steps = Math.ceil(radius / spacing);
  }
  return { rays, steps, spacing };
}

/**
 * Distances for the samples between the observer and a ray's first grid
 * sample: 0.25 m, doubling, short of `spacing`.
 *
 * The grid starts one spacing out — 2 m at least, several metres on a big
 * radius — so whatever the observer stands on between there and their
 * feet went unsampled. On a rooftop that's the roof edge: with it missing,
 * the first sample was the street far below, and the trace "saw" straight
 * down the façade. A few close samples catch the edge; doubling keeps it
 * to a handful per ray however large the spacing.
 */
export function nearDistances(spacing: number): number[] {
  const distances: number[] = [];
  for (let d = 0.25; d < spacing; d *= 2) distances.push(d);
  return distances;
}

/** Whether a point east/north of the observer, in metres, is under any footprint. */
function inAnyFootprint(east: number, north: number, footprints: Footprint[]): boolean {
  return footprints.some(
    (footprint) => Math.hypot(east - footprint.east, north - footprint.north) <= footprint.radius,
  );
}

/**
 * Which samples of `grid` fall inside any footprint — the ones worth
 * asking the 3D Tiles about. Same layout as the heights: ray by ray,
 * nearest sample first. Pure, so it's tested without a scene.
 */
export function samplesInFootprints(grid: ViewshedGrid, footprints: Footprint[]): Uint8Array {
  const { rays, steps, spacing } = grid;
  const mask = new Uint8Array(rays * steps);
  if (footprints.length === 0) return mask;
  for (let r = 0; r < rays; r++) {
    const bearing = (r / rays) * 2 * Math.PI;
    const sin = Math.sin(bearing);
    const cos = Math.cos(bearing);
    for (let s = 1; s <= steps; s++) {
      if (inAnyFootprint(s * spacing * sin, s * spacing * cos, footprints)) {
        mask[r * steps + (s - 1)] = 1;
      }
    }
  }
  return mask;
}

function countMarked(mask: Uint8Array): number {
  let count = 0;
  for (const value of mask) count += value;
  return count;
}

/**
 * The canvas fills, as the 0–255 RGBA bytes `ImageData` takes, from the same
 * colours Cesium draws with.
 *
 * Visible ground is tinted with the sight colour; hidden ground is shaded
 * dark, which reads as "can't be seen" without needing a legend. Cyan
 * rather than the orange accent because OSM's beiges and greens swallow a
 * translucent orange almost entirely, while cyan stays distinct on every
 * basemap colour OSM uses.
 */
const VISIBLE_FILL = MAP_COLORS.sight.withAlpha(0.5).toBytes();
const HIDDEN_FILL = Cesium.Color.BLACK.withAlpha(0.42).toBytes();

/**
 * Which samples on a set of rays can be seen from the eye — the heart of
 * the viewshed, kept free of Cesium and the canvas so it can be tested.
 *
 * `ground` holds `rays × steps` terrain heights, ray by ray, nearest sample
 * first; sample `s` (from 1) of each ray is `s × spacing` metres out. A
 * sample is visible when the angle up to it is at least the steepest angle
 * to anything nearer on the same ray.
 *
 * `nearSteepest`, one per ray, is the steepest angle among the samples
 * closer than the first one (`nearDistances`) — the roof edge under a
 * rooftop observer. Without it each ray starts as if nothing were nearer.
 */
export function traceVisibility(
  ground: ArrayLike<number>,
  rays: number,
  steps: number,
  spacing: number,
  eyeHeight: number,
  nearSteepest?: ArrayLike<number>,
): { visible: Uint8Array; visibleFraction: number } {
  const visible = new Uint8Array(rays * steps);
  let visibleArea = 0;
  let totalArea = 0;
  for (let r = 0; r < rays; r++) {
    let steepest = nearSteepest ? nearSteepest[r] : -Infinity;
    for (let s = 1; s <= steps; s++) {
      const index = r * steps + (s - 1);
      const d = s * spacing;
      // The ground falls away below a level sight line as the earth curves.
      const curvatureDrop = ((d * d) / (2 * EARTH_RADIUS)) * (1 - REFRACTION);
      const slope = (ground[index] - curvatureDrop - eyeHeight) / d;
      // Each sample stands for a ring segment whose area grows with distance.
      totalArea += d;
      if (slope >= steepest) {
        visible[index] = 1;
        visibleArea += d;
      }
      steepest = Math.max(steepest, slope);
    }
  }
  return { visible, visibleFraction: totalArea > 0 ? visibleArea / totalArea : 0 };
}

/**
 * Everything visible from `observer` (raised to eye height) within
 * `radius` metres, over terrain and the shown 3D Tiles in `viewer`'s scene.
 *
 * `exclude` should list the app's own entities, so drawings — and an
 * earlier viewshed's overlay — aren't sampled as buildings.
 */
export async function computeViewshed(
  viewer: Cesium.Viewer,
  observer: Cesium.Cartesian3,
  radius: number,
  exclude: object[] = [],
): Promise<ViewshedResult> {
  const origin = Cesium.Cartographic.fromCartesian(observer);
  const eyeHeight = origin.height + EYE_HEIGHT;
  const scale = metresPerRadian(origin.latitude);

  // Footprints of the tilesets that reach into the circle, in metres from
  // the observer.
  const footprints: Footprint[] = [];
  for (const tileset of visibleTilesets(viewer.scene)) {
    const sphere = tileset.boundingSphere;
    const centre = Cesium.Cartographic.fromCartesian(sphere.center);
    const footprint = {
      east: (centre.longitude - origin.longitude) * scale.east,
      north: (centre.latitude - origin.latitude) * scale.north,
      radius: sphere.radius,
    };
    if (Math.hypot(footprint.east, footprint.north) - footprint.radius <= radius) {
      footprints.push(footprint);
    }
  }

  // Coarsen until the building samples fit their budget. A few rounds at
  // most: each shrinks the spacing by the overshoot.
  let grid = viewshedGrid(radius, MAX_SAMPLES);
  let mask = samplesInFootprints(grid, footprints);
  for (let round = 0; round < 6; round++) {
    const marked = countMarked(mask);
    if (marked <= MAX_BUILDING_SAMPLES) break;
    const shrink = Math.sqrt(marked / MAX_BUILDING_SAMPLES) * 1.05;
    grid = viewshedGrid(radius, MAX_SAMPLES, grid.spacing * shrink);
    mask = samplesInFootprints(grid, footprints);
  }
  const { rays, steps, spacing } = grid;

  // Offsets in a local flat frame around the observer. Exact enough out to
  // tens of kilometres, and the curvature that matters — the ground
  // dropping away from a level sight line — is added back below.
  const at = (bearing: number, d: number) =>
    new Cesium.Cartographic(
      origin.longitude + (d * Math.sin(bearing)) / scale.east,
      origin.latitude + (d * Math.cos(bearing)) / scale.north,
    );
  const samples: Cesium.Cartographic[] = [];
  for (let r = 0; r < rays; r++) {
    const bearing = (r / rays) * 2 * Math.PI;
    for (let s = 1; s <= steps; s++) samples.push(at(bearing, s * spacing));
  }

  // The near field, sampled in the same pass (appended after the grid):
  // a handful of points per ray between the observer and its first sample.
  const near = nearDistances(spacing);
  const nearMask = new Uint8Array(rays * near.length);
  for (let r = 0; r < rays; r++) {
    const bearing = (r / rays) * 2 * Math.PI;
    near.forEach((d, k) => {
      samples.push(at(bearing, d));
      if (inAnyFootprint(d * Math.sin(bearing), d * Math.cos(bearing), footprints)) {
        nearMask[r * near.length + k] = 1;
      }
    });
  }
  const allMask = new Uint8Array(mask.length + nearMask.length);
  allMask.set(mask);
  allMask.set(nearMask, mask.length);

  const heights = await sampleGroundHeights(
    viewer.terrainProvider,
    samples,
    viewer.scene,
    exclude,
    allMask,
  );
  const ground = heights.slice(0, rays * steps);
  const nearSteepest = new Float64Array(rays).fill(-Infinity);
  for (let r = 0; r < rays; r++) {
    near.forEach((d, k) => {
      const slope = (heights[rays * steps + r * near.length + k] - eyeHeight) / d;
      nearSteepest[r] = Math.max(nearSteepest[r], slope);
    });
  }
  const { visible, visibleFraction } = traceVisibility(
    ground,
    rays,
    steps,
    spacing,
    eyeHeight,
    nearSteepest,
  );

  // Paint: every pixel inside the circle looks up the ray and sample
  // nearest to it.
  const angularRadiusLat = radius / scale.north;
  const angularRadiusLon = radius / scale.east;
  const rectangle = new Cesium.Rectangle(
    origin.longitude - angularRadiusLon,
    origin.latitude - angularRadiusLat,
    origin.longitude + angularRadiusLon,
    origin.latitude + angularRadiusLat,
  );

  const image = document.createElement('canvas');
  image.width = IMAGE_SIZE;
  image.height = IMAGE_SIZE;
  const context = image.getContext('2d');
  if (!context) throw new Error('This browser cannot draw the viewshed (no 2D canvas).');
  const pixels = context.createImageData(IMAGE_SIZE, IMAGE_SIZE);

  for (let py = 0; py < IMAGE_SIZE; py++) {
    // Row 0 is the north edge of the rectangle.
    const north = (1 - (2 * (py + 0.5)) / IMAGE_SIZE) * radius;
    for (let px = 0; px < IMAGE_SIZE; px++) {
      const east = ((2 * (px + 0.5)) / IMAGE_SIZE - 1) * radius;
      const d = Math.hypot(east, north);
      if (d > radius || d < spacing / 2) continue;
      let bearing = Math.atan2(east, north);
      if (bearing < 0) bearing += 2 * Math.PI;
      const r = Math.round((bearing / (2 * Math.PI)) * rays) % rays;
      const s = Math.min(steps, Math.max(1, Math.round(d / spacing)));
      const rgba = visible[r * steps + (s - 1)] ? VISIBLE_FILL : HIDDEN_FILL;
      pixels.data.set(rgba, (py * IMAGE_SIZE + px) * 4);
    }
  }
  context.putImageData(pixels, 0, 0);

  return { image, rectangle, visibleFraction, includesBuildings: footprints.length > 0 };
}

/**
 * A ring of points `radius` metres around `center` — the viewshed's rim,
 * and its preview while the radius is being chosen. Heights are the
 * centre's; the rim is drawn clamped to the ground, which replaces them.
 */
export function rimPositions(center: Cesium.Cartesian3, radius: number): Cesium.Cartesian3[] {
  const origin = Cesium.Cartographic.fromCartesian(center);
  const scale = metresPerRadian(origin.latitude);
  const ring: Cesium.Cartesian3[] = [];
  const segments = 96;
  for (let i = 0; i <= segments; i++) {
    const bearing = (i / segments) * 2 * Math.PI;
    ring.push(
      Cesium.Cartesian3.fromRadians(
        origin.longitude + (radius * Math.sin(bearing)) / scale.east,
        origin.latitude + (radius * Math.cos(bearing)) / scale.north,
        origin.height,
      ),
    );
  }
  return ring;
}

/** "38% visible · 1.00 km radius", plus " · with 3D" when buildings were sampled. */
export function describeViewshed(
  visibleFraction: number,
  radius: number,
  includesBuildings = false,
): string {
  const text = `${Math.round(visibleFraction * 100)}% visible · ${formatDistance(radius)} radius`;
  return includesBuildings ? `${text} · with 3D` : text;
}
