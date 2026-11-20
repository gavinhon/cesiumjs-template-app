import * as Cesium from 'cesium';

/**
 * Line-of-sight analysis: can someone standing at one point see another?
 *
 * **CesiumJS has no line-of-sight API.** It has the pieces one is built
 * from — terrain height sampling and scene height sampling — and this
 * module assembles them. (Commercial Cesium add-ons sell this as a
 * feature; it is not in the open-source library.)
 *
 * The method is the standard one: walk along the straight sight line from
 * the observer's eye to the target, and at each step compare the line's
 * height with the height of whatever is on the ground there. The first
 * place the ground rises above the line is where the view is blocked.
 *
 * "Ground" means both terrain and 3D Tiles — a building blocks a view as
 * surely as a hill does. Terrain comes from the terrain tiles at their
 * most detailed level; buildings from `scene.sampleHeightMostDetailed`,
 * which can only see tilesets the scene has loaded and only works in 3D.
 */

/** A standing adult's eye height — the convention for "can a person see it". */
export const EYE_HEIGHT = 1.7;

/** Sample spacing along the sight line, in metres, before the cap below kicks in. */
const SAMPLE_SPACING = 2;
const MAX_SAMPLES = 600;

/**
 * How far above the sight line the ground has to rise to count as a
 * blocker. Absorbs terrain-sampling noise, which would otherwise report a
 * line skimming along flat ground as blocked by its own endpoint.
 */
const TOLERANCE = 0.3;

export interface LineOfSightResult {
  /** Where the eye is: the observer's ground point, raised by `EYE_HEIGHT`. */
  eye: Cesium.Cartesian3;
  target: Cesium.Cartesian3;
  /** The first point where the view is blocked, on the blocking surface; `null` if clear. */
  obstruction: Cesium.Cartesian3 | null;
}

/**
 * Raises a ground point by `meters` along the vertical — how an observer's
 * eye is placed above where they stand.
 */
export function raise(position: Cesium.Cartesian3, meters: number): Cesium.Cartesian3 {
  const carto = Cesium.Cartographic.fromCartesian(position);
  return Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height + meters);
}

/**
 * Heights of the terrain and anything standing on it, at each position.
 * Shared with the viewshed, which needs terrain only and so passes no scene.
 *
 * Terrain without tile availability (the plain ellipsoid) has nothing to
 * sample and is height 0 everywhere — which is exactly what it is.
 */
export async function sampleGroundHeights(
  terrainProvider: Cesium.TerrainProvider,
  cartographics: Cesium.Cartographic[],
  scene?: Cesium.Scene,
  exclude: object[] = [],
): Promise<number[]> {
  const heights = new Array<number>(cartographics.length).fill(0);

  if (terrainProvider.availability) {
    const onTerrain = cartographics.map((c) => new Cesium.Cartographic(c.longitude, c.latitude));
    const sampled = await Cesium.sampleTerrainMostDetailed(terrainProvider, onTerrain);
    sampled.forEach((c, i) => {
      if (Number.isFinite(c.height)) heights[i] = c.height;
    });
  }

  if (scene && hasVisibleTileset(scene) && scene.sampleHeightSupported) {
    const onScene = cartographics.map((c) => new Cesium.Cartographic(c.longitude, c.latitude));
    const sampled = await scene.sampleHeightMostDetailed(onScene, exclude);
    sampled.forEach((c, i) => {
      // `undefined` where no building is: the terrain height stands.
      if (c && Number.isFinite(c.height)) heights[i] = Math.max(heights[i], c.height);
    });
  }

  return heights;
}

/**
 * Whether there's any 3D Tiles content worth sampling. Skipping the scene
 * sample when there isn't saves a GPU render pass per sample point, and
 * avoids `sampleHeightMostDetailed` throwing outside 3D mode.
 */
function hasVisibleTileset(scene: Cesium.Scene): boolean {
  if (scene.mode !== Cesium.SceneMode.SCENE3D) return false;
  for (let i = 0; i < scene.primitives.length; i++) {
    const primitive: unknown = scene.primitives.get(i);
    if (primitive instanceof Cesium.Cesium3DTileset && primitive.show) return true;
  }
  return false;
}

/**
 * Works out whether `to` is visible from an observer standing at `from`.
 *
 * `exclude` should list the app's own entities, so the sight line being
 * drawn — or any other drawing — isn't sampled as an obstacle.
 */
export async function computeLineOfSight(
  viewer: Cesium.Viewer,
  from: Cesium.Cartesian3,
  to: Cesium.Cartesian3,
  exclude: object[],
): Promise<LineOfSightResult> {
  const eye = raise(from, EYE_HEIGHT);
  const target = Cesium.Cartesian3.clone(to);
  const length = Cesium.Cartesian3.distance(eye, target);
  const count = Math.min(MAX_SAMPLES, Math.max(32, Math.ceil(length / SAMPLE_SPACING)));

  // Points along the straight 3D line. Converting each to a cartographic
  // gives the line's height above the ellipsoid *at that spot*, so the
  // earth's curvature — the line rising away from a curved surface — is
  // accounted for without a separate correction.
  const along: Cesium.Cartographic[] = [];
  const scratch = new Cesium.Cartesian3();
  for (let i = 1; i < count; i++) {
    Cesium.Cartesian3.lerp(eye, target, i / count, scratch);
    along.push(Cesium.Cartographic.fromCartesian(scratch));
  }

  const ground = await sampleGroundHeights(viewer.terrainProvider, along, viewer.scene, exclude);

  // The last couple of metres before the target are ignored: the target
  // sits *on* that surface, so the samples beside it are as high as the
  // line by construction and would read as a blocker.
  const ignoreNearTarget = Math.max(2, length * 0.005);
  for (let i = 0; i < along.length; i++) {
    const distanceToTarget = length * (1 - (i + 1) / count);
    if (distanceToTarget < ignoreNearTarget) break;
    if (ground[i] > along[i].height + TOLERANCE) {
      const obstruction = Cesium.Cartesian3.fromRadians(
        along[i].longitude,
        along[i].latitude,
        ground[i],
      );
      return { eye, target, obstruction };
    }
  }
  return { eye, target, obstruction: null };
}
