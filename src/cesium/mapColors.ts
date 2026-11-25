import * as Cesium from 'cesium';

/**
 * The design tokens Cesium needs as JavaScript values.
 *
 * Cesium renders the scene with WebGL, not the DOM, so nothing it draws can
 * read a CSS custom property — a colour used on both sides has to exist
 * twice. This module is the single place where that duplication lives, so
 * "change it in two files" is a rule with one known second file rather than
 * a hunt through every feature.
 *
 * Only colours appear here. Text is not Cesium's job in this app: labels are
 * HTML (see ./mapLabels.ts), so fonts are styled in CSS like everything else
 * and never need mirroring.
 *
 * Keep these in step with `src/styles/designTokens.css`.
 */
export const MAP_COLORS = {
  /** --accent: the user's own drawn points, lines, and polygons. */
  accent: Cesium.Color.fromCssColorString('#ff8a3d'),
  /**
   * --measure: distance measurements.
   *
   * Deliberately neutral rather than another warm hue. Measurements sit on
   * top of drawings made in --accent, and two oranges a few degrees apart
   * would be indistinguishable at a 3px line width; a near-white reads as a
   * different *kind* of thing at a glance, not a different shade.
   */
  measure: Cesium.Color.fromCssColorString('#f5f1ea'),
  /**
   * --vector: WFS, ArcGIS and GeoJSON features.
   *
   * Blue is roughly complementary to the orange accent, so server data
   * never reads as something you drew — the single most important
   * distinction on a busy map.
   */
  vector: Cesium.Color.fromCssColorString('#5b9dff'),
  /**
   * --sight: what an observer can see — the clear part of a line of sight.
   *
   * Its own hue rather than the accent, because an analysis result is a
   * different *kind* of thing from a shape you drew, and the two often sit
   * on top of each other. Cyan is greener and brighter than --vector's
   * blue, so it doesn't read as server data either; it isn't green, so it
   * keeps the UI's no-green rule; and it pairs with --danger for "blocked"
   * as clearly as the GIS-traditional green and red do.
   */
  sight: Cesium.Color.fromCssColorString('#22d3ee'),
  /**
   * --bg: the dark casing around measurement lines.
   *
   * Measurements are near-white so they read as not-a-drawing — which also
   * makes them vanish on the light streets and plazas of a street map. A
   * thin dark edge keeps a near-white line legible on any ground, the way
   * map labels get a halo.
   */
  casing: Cesium.Color.fromCssColorString('#0a0a0b'),
  /**
   * --location: a place the app marked rather than the user drew — your
   * position, a search result. Pure white with a dark casing, a step
   * brighter than --measure, so it reads as a pin dropped on the map
   * rather than as part of any measurement or dataset.
   */
  location: Cesium.Color.fromCssColorString('#ffffff'),
  /**
   * --danger: the blocked half of a line of sight, and its obstruction.
   *
   * The same pink-red the UI uses for "remove", and for the same reason:
   * it reads as "stop" at a glance against the cyan of the line's clear
   * half.
   */
  obstructed: Cesium.Color.fromCssColorString('#f2555f'),
  /** --incident: a live traffic incident, amber-yellow so it stands out on red and green roads. */
  incident: Cesium.Color.fromCssColorString('#ffd23f'),
  /**
   * --traffic-none, --traffic-1 … --traffic-8: live congestion by LTA speed
   * band, indexed by band (0 = no reading). Red-slow to green-free, the
   * scale every traffic map uses — the one exception to keeping green off
   * the map, made so nobody has to learn a new one.
   */
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
