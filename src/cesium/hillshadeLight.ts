import * as Cesium from 'cesium';

const AZIMUTH = Cesium.Math.toRadians(315);
const ALTITUDE = Cesium.Math.toRadians(45);

const TOWARD_LIGHT_ENU = new Cesium.Cartesian3(
  Math.sin(AZIMUTH) * Math.cos(ALTITUDE),
  Math.cos(AZIMUTH) * Math.cos(ALTITUDE),
  Math.sin(ALTITUDE),
);

const enuScratch = new Cesium.Matrix4();
const directionScratch = new Cesium.Cartesian3();
const positionScratch = new Cesium.Cartesian3();

export function installMapLight(scene: Cesium.Scene): () => void {
  const previousLight = scene.light;
  const previousAtmosphereFromSun = scene.globe.dynamicAtmosphereLightingFromSun;

  const light = new Cesium.DirectionalLight({
    direction: Cesium.Cartesian3.negate(Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3()),
    intensity: 2,
  });
  scene.light = light;
  scene.globe.dynamicAtmosphereLightingFromSun = false;

  const aim = () => {
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

export function enableHillshade(scene: Cesium.Scene): () => void {
  const previousLighting = scene.globe.enableLighting;
  scene.globe.enableLighting = true;
  return () => {
    scene.globe.enableLighting = previousLighting;
  };
}
