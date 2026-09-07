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
 * Keep these in step with `src/styles/tokens.css`.
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
   * --vector: WFS features.
   *
   * Blue is roughly complementary to the orange accent, so server data
   * never reads as something you drew — the single most important
   * distinction on a busy map.
   */
  vector: Cesium.Color.fromCssColorString('#5b9dff'),
};
