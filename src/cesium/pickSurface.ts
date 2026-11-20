import * as Cesium from 'cesium';

const depthScratch = new Cesium.Cartesian3();

/**
 * The point on whatever is under the cursor — terrain, or a 3D Tiles
 * building — or `null` when the cursor is over space.
 *
 * Two Cesium APIs answer this, and each is right in a different case:
 *
 *  - `globe.pick` intersects the terrain mesh exactly, but only the
 *    terrain: it sees straight through buildings to the ground beneath.
 *  - `scene.pickPosition` reads the depth buffer, so it sees whatever was
 *    actually drawn — buildings included — but only to depth-buffer
 *    precision, which is several metres at an oblique angle a kilometre out.
 *
 * So both are asked. When they agree to within depth precision, the
 * cursor is on bare terrain and the exact globe answer wins. When they
 * disagree, something other than terrain was drawn there, and the depth
 * answer — what the user is actually looking at — wins. The margin scales
 * with distance because depth precision does.
 *
 * "Disagree" deliberately includes the depth hit being *behind* the
 * terrain. Cesium draws 3D Tiles over terrain by default
 * (`depthTestAgainstTerrain` is off), so a tileset georeferenced lower
 * than the terrain — a city model built for flat ground, now under a real
 * DTM — is still fully visible, yet sits beneath the surface `globe.pick`
 * finds. Trusting only hits *in front of* the ground would make its roofs
 * unclickable: every click on a visible building would land on the
 * hillside above it.
 *
 * Markers drawn with `disableDepthTestDistance` (the cursor ghost, vertex
 * handles) never reach the depth buffer, so they don't register as
 * "something else drawn here" — which is what makes this safe to call
 * under the drawing tools' own cursor marker.
 *
 * `pickPosition` only works in 3D, so 2D falls back to terrain alone.
 */
export function pickSurface(
  viewer: Cesium.Viewer,
  windowPosition: Cesium.Cartesian2,
): Cesium.Cartesian3 | null {
  const { scene, camera } = viewer;
  const ray = camera.getPickRay(windowPosition);
  const onGround = (ray && scene.globe.pick(ray, scene)) ?? undefined;

  if (scene.mode === Cesium.SceneMode.SCENE3D && scene.pickPositionSupported) {
    const inDepth = scene.pickPosition(windowPosition, depthScratch);
    if (inDepth) {
      if (!onGround) return Cesium.Cartesian3.clone(inDepth);
      const toGround = Cesium.Cartesian3.distance(camera.positionWC, onGround);
      const toDepth = Cesium.Cartesian3.distance(camera.positionWC, inDepth);
      const margin = Math.max(2, toGround * 0.01);
      if (Math.abs(toDepth - toGround) > margin) return Cesium.Cartesian3.clone(inDepth);
    }
  }

  return onGround ?? camera.pickEllipsoid(windowPosition, scene.globe.ellipsoid) ?? null;
}
