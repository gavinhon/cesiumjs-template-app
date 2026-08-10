/**
 * The initial camera position for the app: Singapore.
 *
 * Cesium's camera can be positioned either by a `Cartesian3` (a 3D point in
 * space the camera sits *at*, looking straight down by default) or by a
 * `Rectangle` (a lon/lat bounding box the camera frames automatically).
 * We use the Cartesian3 + `Camera.setView` approach here because it gives
 * us direct control over height (zoom level) as well as position.
 */

// Longitude/latitude of central Singapore, in degrees.
export const SINGAPORE_LONGITUDE = 103.8198;
export const SINGAPORE_LATITUDE = 1.3521;

// Camera height in meters above the ellipsoid surface. ~120km gives a view
// that comfortably frames the whole island and the surrounding strait.
export const SINGAPORE_VIEW_HEIGHT = 120_000;
