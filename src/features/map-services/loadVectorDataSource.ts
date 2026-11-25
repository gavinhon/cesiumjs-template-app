import * as Cesium from 'cesium';
import { MAP_COLORS } from '@/cesium/mapColors';
import { styleVectorEntity } from './vectorFeatureStyle';

export async function loadVectorDataSource(
  source: string | object,
  name: string,
): Promise<Cesium.GeoJsonDataSource> {
  const dataSource = await Cesium.GeoJsonDataSource.load(source, {
    clampToGround: true,
    stroke: MAP_COLORS.vector,
    fill: MAP_COLORS.vector.withAlpha(0.25),
    markerColor: MAP_COLORS.vector,
  });
  dataSource.name = name;

  for (const entity of dataSource.entities.values) {
    if (entity.billboard) {
      entity.billboard = undefined;
      entity.point = new Cesium.PointGraphics({
        color: MAP_COLORS.vector,
        outlineColor: MAP_COLORS.casing,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: 50_000,
      });
    }
    styleVectorEntity(entity, false);
  }
  return dataSource;
}
