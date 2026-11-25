import * as Cesium from 'cesium';

const SAMPLE_SPACING = 2;
const MAX_SAMPLES = 600;

const TOLERANCE = 0.3;

export interface LineOfSightResult {
  eye: Cesium.Cartesian3;
  target: Cesium.Cartesian3;
  obstruction: Cesium.Cartesian3 | null;
}

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
      if (c && Number.isFinite(c.height)) heights[i] = Math.max(heights[i], c.height);
    });
  }

  return heights;
}

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

interface RayHit {
  position?: Cesium.Cartesian3;
}

interface RayPickingScene {
  drillPickFromRayMostDetailed?: (
    ray: Cesium.Ray,
    limit?: number,
    objectsToExclude?: object[],
    width?: number,
  ) => Promise<RayHit[]>;
}

const START_SURFACE = 0.5;

const HIT_LIMIT = 4;

async function firstHitAlongRay(
  scene: Cesium.Scene,
  eye: Cesium.Cartesian3,
  target: Cesium.Cartesian3,
  exclude: object[],
): Promise<Cesium.Cartesian3 | null | undefined> {
  const picking = scene as unknown as RayPickingScene;
  if (scene.mode !== Cesium.SceneMode.SCENE3D) return undefined;
  // Private Cesium API: feature-detected.
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

  const along: Cesium.Cartographic[] = [];
  const scratch = new Cesium.Cartesian3();
  for (let i = 1; i < count; i++) {
    Cesium.Cartesian3.lerp(eye, target, i / count, scratch);
    along.push(Cesium.Cartographic.fromCartesian(scratch));
  }

  const rayHit = await firstHitAlongRay(viewer.scene, eye, target, exclude);
  const ground = await sampleGroundHeights(
    viewer.terrainProvider,
    along,
    rayHit === undefined ? viewer.scene : undefined,
    exclude,
  );

  const ignoreNearEnds = Math.max(2, length * 0.005);

  let obstruction: Cesium.Cartesian3 | null = null;
  for (let i = 0; i < along.length; i++) {
    const distanceFromEye = length * ((i + 1) / count);
    if (distanceFromEye < ignoreNearEnds) continue;
    if (length - distanceFromEye < ignoreNearEnds) break;
    if (ground[i] > along[i].height + TOLERANCE) {
      obstruction = Cesium.Cartesian3.fromRadians(
        along[i].longitude,
        along[i].latitude,
        along[i].height,
      );
      break;
    }
  }

  if (rayHit && Cesium.Cartesian3.distance(eye, rayHit) < length - ignoreNearEnds) {
    const terrainFirst =
      obstruction !== null &&
      Cesium.Cartesian3.distance(eye, obstruction) < Cesium.Cartesian3.distance(eye, rayHit);
    if (!terrainFirst) obstruction = rayHit;
  }
  return { eye, target, obstruction };
}
