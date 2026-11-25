import * as Cesium from 'cesium';

export const MAP_COLORS = {
  accent: Cesium.Color.fromCssColorString('#ff8a3d'),
  measure: Cesium.Color.fromCssColorString('#f5f1ea'),
  vector: Cesium.Color.fromCssColorString('#5b9dff'),
  sight: Cesium.Color.fromCssColorString('#22d3ee'),
  casing: Cesium.Color.fromCssColorString('#0a0a0b'),
  location: Cesium.Color.fromCssColorString('#ffffff'),
  obstructed: Cesium.Color.fromCssColorString('#f2555f'),
  incident: Cesium.Color.fromCssColorString('#ffd23f'),
  trafficBands: [
    '#6b6b6b',
    '#a50026',
    '#d73027',
    '#f46d43',
    '#fdae61',
    '#fee08b',
    '#d9ef8b',
    '#66bd63',
    '#1a9850',
  ].map((css) => Cesium.Color.fromCssColorString(css)),
};
