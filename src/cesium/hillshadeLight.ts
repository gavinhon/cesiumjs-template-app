import * as Cesium from 'cesium';

/**
 * Where the light comes from, as a cartographer would set a hillshade:
 * from the north-west (315°), 45° above the horizon.
 *
 * North-west isn't physically meaningful — the sun is never there in the
 * northern hemisphere's afternoon — but it's the convention every printed
 * relief map follows, because light from the upper left is what the eye
 * reads as "raised". Light from the lower right makes valleys look like
 * ridges.
 */
const AZIMUTH = Cesium.Math.toRadians(315);
const ALTITUDE = Cesium.Math.toRadians(45);

/** Towards the light, in a local east-north-up frame. */
const TOWARD_LIGHT_ENU = new Cesium.Cartesian3(
  Math.sin(AZIMUTH) * Math.cos(ALTITUDE),
  Math.cos(AZIMUTH) * Math.cos(ALTITUDE),
  Math.sin(ALTITUDE),
);

const enuScratch = new Cesium.Matrix4();
const directionScratch = new Cesium.Cartesian3();
const positionScratch = new Cesium.Cartesian3();

/**
 * Replaces Cesium's sun with a light pinned to a fixed angle *relative to
 * wherever the camera is*, re-aimed every frame — for the whole life of
 * the viewer.
 *
 * Cesium's default light is the sun at the clock's current time, which is
 * wrong for a map: half the time it's night where you're looking. The
 * globe is unlit by default so it doesn't show, but 3D models are always
 * lit — so a city loaded from the other side of the world (an I3S scene in
 * Frankfurt, viewed from a Singapore afternoon) renders almost black. With
 * this light, models and hillshaded terrain look the same anywhere on the
 * globe at any hour.
 *
 * Returns a function that restores the sun.
 */
export function installMapLight(scene: Cesium.Scene): () => void {
  const previousLight = scene.light;
  const previousAtmosphereFromSun = scene.globe.dynamicAtmosphereLightingFromSun;

  const light = new Cesium.DirectionalLight({
    direction: Cesium.Cartesian3.negate(Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3()),
    // The sun's intensity, which glTF materials are tuned for. The
    // `DirectionalLight` default of 1 leaves models noticeably dim.
    intensity: 2,
  });
  scene.light = light;
  // Otherwise the atmosphere still tracks the real sun, and tints the
  // ground with dusk colours whenever it happens to be evening there.
  scene.globe.dynamicAtmosphereLightingFromSun = false;

  const aim = () => {
    // From the camera's *geographic* position, not `camera.positionWC`. In
    // 3D the two agree, but in 2D and Columbus view `positionWC` is in the
    // flattened map's own coordinates rather than Earth-centred ones —
    // building an east-north-up frame from it aims the light at a
    // meaningless angle, and the whole 2D map renders dim, as if lit from
    // below the horizon. `positionCartographic` is correct in every mode.
    const below = Cesium.Cartographic.toCartesian(
      scene.camera.positionCartographic,
      scene.globe.ellipsoid,
      positionScratch,
    );
    const transform = Cesium.Transforms.eastNorthUpToFixedFrame(
      below,
      scene.globe.ellipsoid,
      enuScratch,
    );
    const towardLight = Cesium.Matrix4.multiplyByPointAsVector(
      transform,
      TOWARD_LIGHT_ENU,
      directionScratch,
    );
    // A directional light's `direction` is the way the light *travels*, so
    // it points away from the light, not toward it.
    Cesium.Cartesian3.negate(towardLight, light.direction);
    Cesium.Cartesian3.normalize(light.direction, light.direction);
  };
  aim();
  const removeListener = scene.preRender.addEventListener(aim);

  return () => {
    removeListener();
    scene.light = previousLight;
    scene.globe.dynamicAtmosphereLightingFromSun = previousAtmosphereFromSun;
  };
}

/**
 * Shades the terrain by slope, so relief is visible from above, using the
 * light `installMapLight` set up.
 *
 * Terrain on its own changes the *shape* of the globe but not its colour:
 * the draped imagery looks identical whether the ground under it is flat
 * or a 160 m hill, so from overhead you can't see the terrain at all. Lit
 * terrain fixes that — slopes facing the light brighten, slopes facing away
 * darken — using the per-vertex normals the terrain tiles carry (see
 * `requestVertexNormals` in `useTerrain`). On the smooth ellipsoid there's
 * no relief to show, and lighting would only darken the map.
 *
 * Returns a function that turns the shading off again.
 */
export function enableHillshade(scene: Cesium.Scene): () => void {
  const previousLighting = scene.globe.enableLighting;
  scene.globe.enableLighting = true;
  return () => {
    scene.globe.enableLighting = previousLighting;
  };
}
