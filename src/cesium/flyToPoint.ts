import * as Cesium from 'cesium';

/**
 * Flies to look straight down at a point from `height` metres, north up —
 * a street at ~1,500 m, a town at ~10 km. Shared by "my location" and
 * search, which both take you to a place rather than to a dataset.
 */
export function flyToPoint(
  viewer: Cesium.Viewer,
  longitude: number,
  latitude: number,
  height = 1500,
): void {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
    orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
    duration: 1.2,
  });
}
