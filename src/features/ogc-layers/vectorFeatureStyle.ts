import * as Cesium from 'cesium';
import { MAP_COLORS } from '@/cesium/mapColors';

/**
 * How a vector feature looks, plain or selected — the one place those
 * numbers live, used when a layer loads and when a feature is clicked.
 *
 * Selected is the same blue, heavier: a thicker line, a stronger fill, a
 * bigger dot. Not a different hue, for the same reason drawings don't use
 * one: on the map, colour says what a mark *is* (`--vector` blue: data from
 * a service), and a selected feature is still that.
 */
export function styleVectorEntity(entity: Cesium.Entity, selected: boolean): void {
  if (entity.point) {
    entity.point.pixelSize = new Cesium.ConstantProperty(selected ? 11 : 7);
    entity.point.outlineWidth = new Cesium.ConstantProperty(selected ? 2 : 1);
  }
  if (entity.polyline) {
    entity.polyline.width = new Cesium.ConstantProperty(selected ? 4 : 2);
  }
  if (entity.polygon) {
    // Draped polygons have no outline — Cesium can't stroke a polygon that
    // follows the terrain — so the fill is the only thing to strengthen.
    entity.polygon.material = new Cesium.ColorMaterialProperty(
      MAP_COLORS.vector.withAlpha(selected ? 0.5 : 0.25),
    );
  }
}
