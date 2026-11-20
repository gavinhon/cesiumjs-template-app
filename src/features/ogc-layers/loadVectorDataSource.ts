import * as Cesium from 'cesium';
import { MAP_COLORS } from '@/cesium/mapColors';

/**
 * Loads GeoJSON from a URL as a styled Cesium data source — the shared tail
 * end of every vector layer this feature adds, whether the GeoJSON came
 * from a WFS server or a static file.
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
  url: string,
  name: string,
): Promise<Cesium.GeoJsonDataSource> {
  const dataSource = await Cesium.GeoJsonDataSource.load(url, {
    clampToGround: true,
    stroke: MAP_COLORS.vector,
    fill: MAP_COLORS.vector.withAlpha(0.25),
    markerColor: MAP_COLORS.vector,
  });
  dataSource.name = name;
  return dataSource;
}
