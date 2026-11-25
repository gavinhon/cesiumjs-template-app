import * as Cesium from 'cesium';
import { MAP_COLORS } from '@/cesium/mapColors';

export function styleVectorEntity(entity: Cesium.Entity, selected: boolean): void {
  if (entity.point) {
    entity.point.pixelSize = new Cesium.ConstantProperty(selected ? 11 : 7);
    entity.point.outlineWidth = new Cesium.ConstantProperty(selected ? 2 : 1);
  }
  if (entity.polyline) {
    entity.polyline.width = new Cesium.ConstantProperty(selected ? 4 : 2);
  }
  if (entity.polygon) {
    entity.polygon.material = new Cesium.ColorMaterialProperty(
      MAP_COLORS.vector.withAlpha(selected ? 0.5 : 0.25),
    );
  }
}
