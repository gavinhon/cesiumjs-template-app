/**
 * Where the camera starts when the app loads.
 *
 * This is usually the first thing you change when forking this template.
 *
 * Cesium's camera can be positioned either by a `Cartesian3` (a 3D point in
 * space the camera sits *at*, looking straight down by default) or by a
 * `Rectangle` (a lon/lat bounding box the camera frames automatically).
 * We use the Cartesian3 + `Camera.setView` approach in `CesiumMap.tsx`
 * because it gives direct control over height (zoom level) as well as
 * position.
 */
export const INITIAL_VIEW = {
  /** Degrees. Currently central Singapore. */
  longitude: 103.8198,
  /** Degrees. Currently central Singapore. */
  latitude: 1.3521,
  /**
   * Metres above the ellipsoid surface. ~120km comfortably frames the whole
   * island and the surrounding strait.
   */
  height: 120_000,
};
