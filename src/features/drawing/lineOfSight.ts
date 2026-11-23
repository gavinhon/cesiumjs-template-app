import * as Cesium from 'cesium';

/**
 * Line-of-sight analysis: is one point visible from another?
 *
 * The line runs exactly between the two points chosen — a window, a
 * rooftop, a spot on the ground — not from a standing person's eye above
 * the first.
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
 * Terrain is checked that way, sampled from the terrain tiles at their
 * most detailed level. **3D Tiles are checked by casting the sight line
 * itself through them** (`drillPickFromRayMostDetailed`, see
 * `firstHitAlongRay`), because a model is not a heightmap: a sight line
 * through a window, under a canopy, or from one floor of a building to
 * another passes beneath geometry that a top-down height sample would
 * call solid. Where ray casting isn't available, buildings fall back to
 * top-down height samples (`scene.sampleHeightMostDetailed`), which treat
 * each building as solid up to its highest roof.
 */

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
  /** Where the sight line starts: the point chosen. */
  eye: Cesium.Cartesian3;
  target: Cesium.Cartesian3;
  /** Where the sight line first runs into something; `null` if clear. */
  obstruction: Cesium.Cartesian3 | null;
}

/**
 * Heights of the terrain — and, given a `scene`, of anything standing on
 * it — at each position. The scene is only asked when ray casting isn't
 * available (see `computeLineOfSight`).
 *
 * Terrain without tile availability (the plain ellipsoid) has nothing to
 * sample and is height 0 everywhere — which is exactly what it is.
 */
async function sampleGroundHeights(
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

  if (scene && visibleTilesets(scene).length > 0 && scene.sampleHeightSupported) {
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
 * The 3D Tiles content worth sampling: every shown tileset, including the
 * ones an I3S scene layer streams (an `I3SDataProvider` is the primitive in
 * the scene; its layers hold the tilesets). Empty outside 3D, where
 * `sampleHeightMostDetailed` throws — and an empty list lets callers skip
 * the GPU render passes scene sampling costs.
 */
function visibleTilesets(scene: Cesium.Scene): Cesium.Cesium3DTileset[] {
  if (scene.mode !== Cesium.SceneMode.SCENE3D) return [];
  const tilesets: Cesium.Cesium3DTileset[] = [];
  for (let i = 0; i < scene.primitives.length; i++) {
    const primitive: unknown = scene.primitives.get(i);
    if (primitive instanceof Cesium.Cesium3DTileset && primitive.show) tilesets.push(primitive);
    if (primitive instanceof Cesium.I3SDataProvider && primitive.show) {
      for (const layer of primitive.layers) {
        if (layer.tileset?.show) tilesets.push(layer.tileset);
      }
    }
  }
  return tilesets;
}

/** A hit from Cesium's ray picking — just the part used here. */
interface RayHit {
  position?: Cesium.Cartesian3;
}

/**
 * Cesium's ray picking, which isn't in its public typings.
 *
 * `Scene.drillPickFromRayMostDetailed` renders the scene along a ray —
 * loading 3D Tiles at full detail first — and returns what it passes
 * through, nearest first, hiding each part it hits before looking again.
 * It's marked `@private` in Cesium's source, but it is the machinery the
 * public `sampleHeightMostDetailed` is built on (a height sample is a ray
 * cast straight down), and it has kept this signature across many
 * releases. Reached through this narrow shape rather than `any`, and
 * feature-detected: if a release removes it, line of sight falls back to
 * height samples instead of breaking.
 */
interface RayPickingScene {
  drillPickFromRayMostDetailed?: (
    ray: Cesium.Ray,
    limit?: number,
    objectsToExclude?: object[],
    width?: number,
  ) => Promise<RayHit[]>;
}

/**
 * How far from the start a ray hit has to be to count. The line starts *on*
 * a surface — the floor, sill or wall you clicked — and the ray meets that
 * surface first; it's the thing you're looking from, not something in the
 * way.
 */
const START_SURFACE = 0.5;

/** Hits to look through for the first one past the start surface. */
const HIT_LIMIT = 4;

/**
 * The first surface the straight line from `eye` to `target` passes
 * through — a wall, a slab, terrain — or `null` if it meets nothing.
 * `undefined` when ray casting isn't available (2D mode, or a Cesium
 * release without it), for the caller to fall back.
 */
async function firstHitAlongRay(
  scene: Cesium.Scene,
  eye: Cesium.Cartesian3,
  target: Cesium.Cartesian3,
  exclude: object[],
): Promise<Cesium.Cartesian3 | null | undefined> {
  const picking = scene as unknown as RayPickingScene;
  // Cesium throws for ray intersections outside 3D.
  if (scene.mode !== Cesium.SceneMode.SCENE3D) return undefined;
  if (typeof picking.drillPickFromRayMostDetailed !== 'function') return undefined;
  const direction = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(target, eye, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  try {
    const hits = await picking.drillPickFromRayMostDetailed.call(
      scene,
      new Cesium.Ray(eye, direction),
      HIT_LIMIT,
      exclude,
    );
    // Nearest first: the first one clear of the surface the line starts on.
    for (const { position } of hits) {
      if (position && Cesium.Cartesian3.distance(eye, position) > START_SURFACE) {
        return Cesium.Cartesian3.clone(position);
      }
    }
    return null;
  } catch {
    return undefined;
  }
}

/**
 * Works out whether `to` is visible from `from`, along the straight line
 * between exactly those two points.
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
  const eye = Cesium.Cartesian3.clone(from);
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

  // Buildings by ray, when Cesium can cast one; otherwise by height
  // samples below, along with the terrain.
  const rayHit = await firstHitAlongRay(viewer.scene, eye, target, exclude);
  const ground = await sampleGroundHeights(
    viewer.terrainProvider,
    along,
    rayHit === undefined ? viewer.scene : undefined,
    exclude,
  );

  // The couple of metres at each end are ignored for terrain: both points
  // sit *on* the ground they were picked on, so the samples beside them
  // meet that ground by construction — plus sampling noise — and would read
  // as a blocker. (A ray arriving at the target meets its surface the same
  // way, hence the check on `rayHit` below.)
  const ignoreNearEnds = Math.max(2, length * 0.005);

  let obstruction: Cesium.Cartesian3 | null = null;
  for (let i = 0; i < along.length; i++) {
    const distanceFromEye = length * ((i + 1) / count);
    if (distanceFromEye < ignoreNearEnds) continue;
    if (length - distanceFromEye < ignoreNearEnds) break;
    if (ground[i] > along[i].height + TOLERANCE) {
      // On the sight line, where it enters the blocker — not at the
      // blocker's height. A height sample is the *top* of whatever stands
      // there (it looks straight down), so using it put the marker on a
      // building's highest roof: the clear line bent up to it, and
      // "Blocked at" measured to the roof.
      obstruction = Cesium.Cartesian3.fromRadians(
        along[i].longitude,
        along[i].latitude,
        along[i].height,
      );
      break;
    }
  }

  // Whichever blocker the line meets first: terrain or something the ray hit.
  if (rayHit && Cesium.Cartesian3.distance(eye, rayHit) < length - ignoreNearEnds) {
    const terrainFirst =
      obstruction !== null &&
      Cesium.Cartesian3.distance(eye, obstruction) < Cesium.Cartesian3.distance(eye, rayHit);
    if (!terrainFirst) obstruction = rayHit;
  }
  return { eye, target, obstruction };
}
