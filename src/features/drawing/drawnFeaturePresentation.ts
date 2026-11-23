import * as Cesium from 'cesium';
import { MAP_COLORS } from '@/cesium/mapColors';
import type { DrawnFeature, DrawnFeatureKind } from './drawingTypes';
import { raise, EYE_HEIGHT } from './lineOfSight';
import {
  describeDirect,
  describeHorizontal,
  heightOf,
  heightTriangleCorner,
  horizontalDiffers,
  levelPath,
  pointAlong,
} from './measurement';
import { rimPositions } from './viewshed';

/**
 * How a finished feature is drawn and labelled.
 *
 * Kept out of `useDrawingTools` deliberately: these are pure functions of a
 * feature record, with no state and no input handling, and the hook is long
 * enough without them.
 */

/**
 * Three families, three colours: drawings in the accent orange,
 * measurements near-white, analyses in the sight cyan. A glance at the map
 * then says what each mark *is* before you read its label.
 */
const MEASURE_KINDS: ReadonlySet<DrawnFeatureKind> = new Set(['measure', 'height']);

/**
 * The kinds whose result is an analysis: the label is a computed readout,
 * and moving a vertex means recomputing, not just redrawing.
 */
export const ANALYSIS_KINDS: ReadonlySet<DrawnFeatureKind> = new Set(['line-of-sight', 'viewshed']);

/** Kinds whose default label is a computed number, drawn in the readout style. */
export function isReadoutKind(kind: DrawnFeatureKind): boolean {
  return MEASURE_KINDS.has(kind) || ANALYSIS_KINDS.has(kind);
}

export function colorFor(kind: DrawnFeatureKind): Cesium.Color {
  if (MEASURE_KINDS.has(kind)) return MAP_COLORS.measure;
  if (ANALYSIS_KINDS.has(kind)) return MAP_COLORS.sight;
  return MAP_COLORS.accent;
}

/** A polygon's edge is thinner than a standalone line — it has a fill backing it up. */
function baseLineWidth(kind: DrawnFeatureKind): number {
  return kind === 'polygon' || kind === 'viewshed' ? 2 : 3;
}

/**
 * The job one entity does within a multi-entity feature.
 *
 * A polygon is fill + outline, and every entity in it is coloured the same,
 * so a loop over `feature.entities` used to be enough. The 3D tools broke
 * that: a sight line is one colour where it's clear and another where it's
 * blocked, a height triangle has dashed legs beside a solid hypotenuse, and
 * when a vertex moves each piece moves differently. Tagging each entity
 * with its part says which is which, without depending on array order.
 */
export type EntityPart =
  | 'shape' // the feature itself: the point, the line, the polygon fill
  | 'outline' // a polygon's edge
  | 'vertical' // height triangle: the vertical leg
  | 'horizontal' // height triangle: the horizontal leg
  | 'level' // measurement: the path flattened to its lowest point, dotted
  | 'eye' // where a sight line starts; a viewshed's observer, at eye height
  | 'stand' // viewshed observer: dashed, from where they stand up to the eye
  | 'target' // line-of-sight target
  | 'clear' // line of sight: eye to the first obstruction (or the target)
  | 'blocked' // line of sight: obstruction to target
  | 'obstruction' // line of sight: where the view is blocked
  | 'overlay' // viewshed: the draped visible/hidden image
  | 'rim'; // viewshed: the edge of the analysed area

interface PartStyle {
  part: EntityPart;
  /** Overrides the feature kind's colour for this entity. */
  color?: Cesium.Color;
  /** Drawn dashed — a construction line, not the measurement itself. */
  dashed?: boolean;
}

// A WeakMap rather than a property on the entity: it can't collide with
// anything Cesium does with entity properties, and a removed entity's tag
// is collected with it.
const PARTS = new WeakMap<Cesium.Entity, PartStyle>();

/** Records what an entity is for. Returns the entity, so it can wrap `entities.add`. */
export function tagPart(
  entity: Cesium.Entity,
  part: EntityPart,
  style: Omit<PartStyle, 'part'> = {},
): Cesium.Entity {
  PARTS.set(entity, { part, ...style });
  return entity;
}

/** Changes an entity's colour override — e.g. a target turning red once found to be hidden. */
export function recolorPart(entity: Cesium.Entity, color: Cesium.Color): void {
  const style = PARTS.get(entity);
  if (style) style.color = color;
}

export function partOf(entity: Cesium.Entity): EntityPart {
  return PARTS.get(entity)?.part ?? 'shape';
}

/**
 * Where a feature's label sits.
 *
 * A shape's label goes in the middle of it; a line's goes at the end, where
 * a measurement readout naturally belongs. A viewshed's goes on its
 * observer — the end point only sets the radius, and is anywhere on the rim.
 */
export function labelAnchorFor(feature: DrawnFeature): Cesium.Cartesian3 {
  const { positions } = feature;
  if (positions.length === 1) return positions[0];
  if (feature.kind === 'viewshed') return raise(positions[0], EYE_HEIGHT);
  if (feature.kind === 'height') {
    // Above the triangle, not on it: the higher end is its top corner, so
    // a label there sits clear of the lines it describes.
    const [a, b] = [positions[0], positions[positions.length - 1]];
    return heightOf(a) >= heightOf(b) ? a : b;
  }

  // On the measured line, halfway along, so the number reads as that
  // line's length rather than as something about its last point.
  if (feature.kind === 'measure') return pointAlong(positions, 0.5);

  if (feature.kind === 'polygon') {
    // Averaged in geographic coordinates, not Cartesian: the mean of points
    // on a sphere falls *inside* it, which would bury the label under the
    // surface and hide it behind the globe on the horizon test.
    // Height is averaged too: with terrain loaded the vertices sit on the
    // ground, and a label pinned to the bare ellipsoid beneath them would
    // drift away from its shape as the camera tilts.
    let longitude = 0;
    let latitude = 0;
    let height = 0;
    for (const position of positions) {
      const carto = Cesium.Cartographic.fromCartesian(position);
      longitude += carto.longitude;
      latitude += carto.latitude;
      height += carto.height;
    }
    const count = positions.length;
    return Cesium.Cartesian3.fromRadians(longitude / count, latitude / count, height / count);
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
      // A measurement's map label is just the measured line's length; the
      // horizontal distance gets its own label on its own dotted line
      // (`horizontalLabelFor`). The panel still shows both together.
      return feature.kind === 'measure' ? describeDirect(feature.positions) : feature.measurement;
    default: {
      const attribute = feature.attributes.find((entry) => entry.id === feature.labelSource);
      if (!attribute?.value.trim()) return null;
      const key = attribute.key.trim();
      return key ? `${key}: ${attribute.value}` : attribute.value;
    }
  }
}

/**
 * The second label a measurement carries: the horizontal distance, halfway
 * along the dotted level line it describes. `null` when the path barely
 * climbs (the two distances would print the same), or when the feature's
 * label isn't showing the measurement at all.
 */
export function horizontalLabelFor(
  feature: DrawnFeature,
): { anchor: Cesium.Cartesian3; text: string } | null {
  if (feature.kind !== 'measure' || !feature.visible || feature.labelSource !== 'measurement') {
    return null;
  }
  if (!horizontalDiffers(feature.positions)) return null;
  return {
    anchor: pointAlong(levelPath(feature.positions), 0.5),
    text: describeHorizontal(feature.positions),
  };
}

/**
 * The dotted level line's vertices — or none at all on flat ground, where
 * it would sit on top of the measured line and say nothing.
 */
export function levelLineFor(positions: Cesium.Cartesian3[]): Cesium.Cartesian3[] {
  return horizontalDiffers(positions) ? levelPath(positions) : [];
}

/**
 * How a line looks where something stands in front of it.
 *
 * Lines in 3D are depth-tested: a measurement from a rooftop down to the
 * street runs through the building's own walls, and a sight line crosses
 * the hill that blocks it. By default Cesium simply doesn't draw those
 * stretches, so the measurement you just made vanishes. A depth-fail
 * material draws them anyway, fainter — still clearly the same line, and
 * clearly *behind* something, which for a line of sight is the point.
 */
export function hiddenLineMaterial(color: Cesium.Color): Cesium.MaterialProperty {
  return new Cesium.ColorMaterialProperty(color.withAlpha(0.35));
}

/** A near-white measurement line with a dark edge, so it reads on light ground too. */
export function casedLineMaterial(
  color: Cesium.Color,
  outlineWidth = 1.5,
): Cesium.MaterialProperty {
  return new Cesium.PolylineOutlineMaterialProperty({
    color,
    outlineColor: MAP_COLORS.casing,
    outlineWidth,
  });
}

/** A dashed construction line whose gaps are dark rather than empty, for the same reason. */
export function casedDashMaterial(color: Cesium.Color): Cesium.MaterialProperty {
  return new Cesium.PolylineDashMaterialProperty({
    color,
    gapColor: MAP_COLORS.casing.withAlpha(0.6),
    dashLength: 10,
  });
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
  const kindColor = colorFor(feature.kind);
  const width = baseLineWidth(feature.kind);

  for (const entity of feature.entities) {
    entity.show = feature.visible;
    const style = PARTS.get(entity);
    const color = style?.color ?? kindColor;

    if (entity.polyline) {
      const isMeasurement = MEASURE_KINDS.has(feature.kind);
      if (style?.dashed) {
        // Construction lines stay thin and dashed even when selected — the
        // casing belongs on the measured line, not on its scaffolding.
        entity.polyline.width = new Cesium.ConstantProperty(selected ? 3 : 2);
        entity.polyline.material = casedDashMaterial(color);
      } else if (isMeasurement) {
        // Measurements are always cased (see `MAP_COLORS.casing`), so
        // selection widens the line and its casing instead of adding one.
        entity.polyline.width = new Cesium.ConstantProperty(selected ? 8 : 5);
        entity.polyline.material = casedLineMaterial(color, selected ? 2.5 : 1.5);
      } else {
        entity.polyline.width = new Cesium.ConstantProperty(selected ? width + 4 : width);
        entity.polyline.material = selected
          ? new Cesium.PolylineOutlineMaterialProperty({
              color,
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
            })
          : new Cesium.ColorMaterialProperty(color);
      }
      // Draped lines (a viewshed's rim) follow the surface and can't be
      // hidden by it — and Cesium doesn't support a depth-fail material on
      // them anyway.
      if (!entity.polyline.clampToGround?.getValue(Cesium.JulianDate.now())) {
        entity.polyline.depthFailMaterial = hiddenLineMaterial(color);
      }
    }

    if (entity.polygon) {
      entity.polygon.material = new Cesium.ColorMaterialProperty(
        color.withAlpha(selected ? 0.4 : 0.25),
      );
    }

    if (entity.point) {
      // A label's dot is an anchor for its text, not the mark itself, and an
      // obstruction marker is a detail on a line — both stay smaller than a
      // point placed with the point tool.
      const small = feature.kind === 'label' || style?.part === 'obstruction';
      const base = small ? 7 : 10;
      entity.point.pixelSize = new Cesium.ConstantProperty(selected ? base + 4 : base);
      entity.point.outlineWidth = new Cesium.ConstantProperty(selected ? 3 : 2);
      entity.point.color = new Cesium.ConstantProperty(color);
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
 *
 * For the analysis kinds this only moves the *geometry*: a dragged sight
 * line is drawn as unobstructed and a dragged viewshed keeps its old image
 * until the drag ends and the hook recomputes them. Re-running an analysis
 * on every mouse move would mean dozens of terrain queries a second.
 */
export function applyGeometry(feature: DrawnFeature, positions: Cesium.Cartesian3[]): void {
  const [first, last] = [positions[0], positions[positions.length - 1]];
  // Only the viewshed's observer stands at eye height; a sight line runs
  // from exactly the point chosen.
  const eye = feature.kind === 'viewshed' ? raise(first, EYE_HEIGHT) : first;

  for (const entity of feature.entities) {
    const part = partOf(entity);
    switch (part) {
      case 'outline':
        // A polygon's edge is the ring closed back to its first vertex.
        setPolyline(entity, [...positions, first]);
        break;
      case 'vertical':
        setPolyline(entity, [first, heightTriangleCorner(first, last)]);
        break;
      case 'horizontal':
        setPolyline(entity, [heightTriangleCorner(first, last), last]);
        break;
      case 'level':
        setPolyline(entity, levelLineFor(positions));
        break;
      case 'eye':
        entity.position = new Cesium.ConstantPositionProperty(eye);
        break;
      case 'stand':
        setPolyline(entity, [first, eye]);
        break;
      case 'target':
        entity.position = new Cesium.ConstantPositionProperty(last);
        break;
      case 'clear':
        setPolyline(entity, [eye, last]);
        break;
      case 'blocked':
        setPolyline(entity, []);
        break;
      case 'obstruction':
        entity.position = undefined;
        break;
      case 'rim':
        setPolyline(entity, rimPositions(first, Cesium.Cartesian3.distance(first, last)));
        break;
      case 'overlay':
        break;
      case 'shape':
        if (entity.polygon) {
          entity.polygon.hierarchy = new Cesium.ConstantProperty(
            new Cesium.PolygonHierarchy(positions),
          );
        } else if (entity.polyline) {
          setPolyline(entity, positions);
        } else if (entity.point) {
          entity.position = new Cesium.ConstantPositionProperty(first);
        }
        break;
      default: {
        const exhaustive: never = part;
        throw new Error(`Unhandled entity part: ${String(exhaustive)}`);
      }
    }
  }
}

function setPolyline(entity: Cesium.Entity, positions: Cesium.Cartesian3[]) {
  if (entity.polyline) entity.polyline.positions = new Cesium.ConstantProperty(positions);
}
