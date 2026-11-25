import * as Cesium from 'cesium';

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
