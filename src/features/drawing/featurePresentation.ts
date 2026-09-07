import * as Cesium from 'cesium';
import { MAP_COLORS } from '@/cesium/theme';
import type { DrawnFeature, DrawnFeatureKind } from './types';

/**
 * How a finished feature is drawn and labelled.
 *
 * Kept out of `useDrawingTools` deliberately: these are pure functions of a
 * feature record, with no state and no input handling, and the hook is long
 * enough without them.
 */

export function colorFor(kind: DrawnFeatureKind): Cesium.Color {
  return kind === 'measure' ? MAP_COLORS.measure : MAP_COLORS.accent;
}

/** A polygon's edge is thinner than a standalone line — it has a fill backing it up. */
function baseLineWidth(kind: DrawnFeatureKind): number {
  return kind === 'polygon' ? 2 : 3;
}

/**
 * Where a feature's label sits.
 *
 * A shape's label goes in the middle of it; a line's goes at the end, where
 * a measurement readout naturally belongs.
 */
export function labelAnchorFor(feature: DrawnFeature): Cesium.Cartesian3 {
  const { positions } = feature;
  if (positions.length === 1) return positions[0];

  if (feature.kind === 'polygon') {
    // Averaged in geographic coordinates, not Cartesian: the mean of points
    // on a sphere falls *inside* it, which would bury the label under the
    // surface and hide it behind the globe on the horizon test.
    let longitude = 0;
    let latitude = 0;
    for (const position of positions) {
      const carto = Cesium.Cartographic.fromCartesian(position);
      longitude += carto.longitude;
      latitude += carto.latitude;
    }
    return Cesium.Cartesian3.fromRadians(longitude / positions.length, latitude / positions.length);
  }

  return positions[positions.length - 1];
}

/**
 * The text a feature's label should show, or `null` when it should have none.
 *
 * An attribute renders as "key: value" rather than a bare value, because a
 * number floating over a map says nothing on its own.
 */
export function labelTextFor(feature: DrawnFeature): string | null {
  // A hidden feature's label goes with it; a caption pointing at nothing is
  // worse than no caption.
  if (!feature.visible) return null;

  switch (feature.labelSource) {
    case 'none':
      return null;
    case 'name':
      return feature.name.trim() || null;
    case 'measurement':
      return feature.measurement;
    default: {
      const attribute = feature.attributes.find((entry) => entry.id === feature.labelSource);
      if (!attribute?.value.trim()) return null;
      const key = attribute.key.trim();
      return key ? `${key}: ${attribute.value}` : attribute.value;
    }
  }
}

/**
 * Applies the look for a feature's current state to its live entities.
 *
 * Selection is shown by thickening the stroke and giving it a white casing
 * rather than by recolouring: the palette only has one drawing colour and
 * one measurement colour, and swapping either for a "selected" hue would
 * make a selected line look like a different *kind* of thing.
 *
 * `PolylineOutlineMaterialProperty` is what draws that casing. It needs the
 * extra width to have somewhere to put it, which is why the two change
 * together.
 */
export function styleFeature(feature: DrawnFeature, selected: boolean): void {
  const color = colorFor(feature.kind);
  const width = baseLineWidth(feature.kind);

  for (const entity of feature.entities) {
    entity.show = feature.visible;

    if (entity.polyline) {
      entity.polyline.width = new Cesium.ConstantProperty(selected ? width + 4 : width);
      entity.polyline.material = selected
        ? new Cesium.PolylineOutlineMaterialProperty({
            color,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
          })
        : new Cesium.ColorMaterialProperty(color);
    }

    if (entity.polygon) {
      entity.polygon.material = new Cesium.ColorMaterialProperty(
        color.withAlpha(selected ? 0.4 : 0.25),
      );
    }

    if (entity.point) {
      // A label's dot is an anchor for its text, not the mark itself, so it
      // stays smaller than a point placed with the point tool.
      const base = feature.kind === 'label' ? 6 : 10;
      entity.point.pixelSize = new Cesium.ConstantProperty(selected ? base + 4 : base);
      entity.point.outlineWidth = new Cesium.ConstantProperty(selected ? 3 : 2);
    }
  }
}

/**
 * Rewrites a feature's geometry from a new set of vertices.
 *
 * Used while dragging a vertex, so it runs at input rate rather than per
 * frame — cheap enough to just replace the properties rather than route
 * them through a `CallbackProperty` that would then have to be frozen again
 * when the drag ends.
 */
export function applyGeometry(feature: DrawnFeature, positions: Cesium.Cartesian3[]): void {
  for (const entity of feature.entities) {
    if (entity.polygon) {
      entity.polygon.hierarchy = new Cesium.ConstantProperty(
        new Cesium.PolygonHierarchy(positions),
      );
    } else if (entity.polyline) {
      // A polygon's outline is the ring closed back to its first vertex; a
      // line's is just the vertices.
      entity.polyline.positions = new Cesium.ConstantProperty(
        feature.kind === 'polygon' ? [...positions, positions[0]] : positions,
      );
    } else if (entity.point) {
      entity.position = new Cesium.ConstantPositionProperty(positions[0]);
    }
  }
}
