import * as Cesium from 'cesium';
import { MAP_COLORS } from '@/cesium/mapColors';
import { styleVectorEntity } from './vectorFeatureStyle';

/**
 * Loads GeoJSON — a URL, or an object already fetched — as a styled Cesium
 * data source: the shared tail end of every vector layer this feature adds,
 * whether the GeoJSON came from a WFS server, an ArcGIS feature layer or a
 * static file.
 *
 * The result is a `GeoJsonDataSource` (a collection of entities) for
 * `viewer.dataSources`, not an `ImageryProvider` for `viewer.imageryLayers`:
 * vector data is geometry, so it can be styled and picked, but it has no
 * place in the imagery draw order.
 *
 * `clampToGround` drapes the features over whatever terrain is loaded.
 * GeoJSON is usually 2D, so without it every feature would sit at height
 * 0 — z-fighting with the bare ellipsoid, or buried under real terrain.
 */
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

  // Cesium draws GeoJSON points as 48px map-pin billboards, which turn a
  // layer of a few thousand cities or earthquakes into a solid wall of
  // pins. A small dot reads as data rather than as a set of bookmarks, and
  // stays legible at density. There's no loader option for this — the pins
  // are swapped for points after loading.
  for (const entity of dataSource.entities.values) {
    if (entity.billboard) {
      entity.billboard = undefined;
      entity.point = new Cesium.PointGraphics({
        color: MAP_COLORS.vector,
        outlineColor: MAP_COLORS.casing,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        // A clamped point sits exactly on the surface, so nearby terrain cuts
        // it in half. Skipping the depth test draws it whole — but only up
        // close: with no limit, points on the far side of the globe would
        // show through it from space.
        disableDepthTestDistance: 50_000,
      });
    }
    // Sizes and fill strength come from one place, shared with the
    // selected look a click gives a feature.
    styleVectorEntity(entity, false);
  }
  return dataSource;
}
