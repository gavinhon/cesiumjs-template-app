import * as Cesium from 'cesium';
import { MAP_COLORS } from '@/cesium/mapColors';
import type { DrawnFeature, DrawnFeatureKind } from './drawingTypes';
import {
  describeDirect,
  describeHorizontal,
  heightOf,
  heightTriangleCorner,
  horizontalDiffers,
  isDiagonal,
  describeRise,
  levelPath,
  pointAlong,
} from './measurement';

const MEASURE_KINDS: ReadonlySet<DrawnFeatureKind> = new Set(['measure', 'height']);

export const ANALYSIS_KINDS: ReadonlySet<DrawnFeatureKind> = new Set(['line-of-sight']);

export function isReadoutKind(kind: DrawnFeatureKind): boolean {
  return MEASURE_KINDS.has(kind) || ANALYSIS_KINDS.has(kind);
}

export function colorFor(kind: DrawnFeatureKind): Cesium.Color {
  if (MEASURE_KINDS.has(kind)) return MAP_COLORS.measure;
  if (ANALYSIS_KINDS.has(kind)) return MAP_COLORS.sight;
  return MAP_COLORS.accent;
}

function baseLineWidth(kind: DrawnFeatureKind): number {
  return kind === 'polygon' ? 2 : 3;
}

export type EntityPart =
  | 'shape'
  | 'outline'
  | 'vertical'
  | 'horizontal'
  | 'level'
  | 'eye'
  | 'target'
  | 'clear'
  | 'blocked'
  | 'obstruction';

interface PartStyle {
  part: EntityPart;
  color?: Cesium.Color;
  dashed?: boolean;
}

const PARTS = new WeakMap<Cesium.Entity, PartStyle>();

export function tagPart(
  entity: Cesium.Entity,
  part: EntityPart,
  style: Omit<PartStyle, 'part'> = {},
): Cesium.Entity {
  PARTS.set(entity, { part, ...style });
  return entity;
}

export function recolorPart(entity: Cesium.Entity, color: Cesium.Color): void {
  const style = PARTS.get(entity);
  if (style) style.color = color;
}

export function partOf(entity: Cesium.Entity): EntityPart {
  return PARTS.get(entity)?.part ?? 'shape';
}

export function labelAnchorFor(feature: DrawnFeature): Cesium.Cartesian3 {
  const { positions } = feature;
  if (positions.length === 1) return positions[0];
  if (feature.kind === 'height') {
    const [a, b] = [positions[0], positions[positions.length - 1]];
    return heightOf(a) >= heightOf(b) ? a : b;
  }

  if (feature.kind === 'measure') return pointAlong(positions, 0.5);

  if (feature.kind === 'polygon') {
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

export function labelTextFor(feature: DrawnFeature): string | null {
  if (!feature.visible) return null;

  switch (feature.labelSource) {
    case 'none':
      return null;
    case 'name':
      return feature.name.trim() || null;
    case 'measurement':
      return feature.kind === 'measure' ? describeDirect(feature.positions) : feature.measurement;
    default: {
      const attribute = feature.attributes.find((entry) => entry.id === feature.labelSource);
      if (!attribute?.value.trim()) return null;
      const key = attribute.key.trim();
      return key ? `${key}: ${attribute.value}` : attribute.value;
    }
  }
}

export function secondaryLabelsFor(
  feature: DrawnFeature,
  selected: boolean,
): { anchor: Cesium.Cartesian3; text: string }[] {
  if (!feature.visible || feature.labelSource !== 'measurement') return [];
  const { positions } = feature;
  if (feature.kind === 'measure') {
    if (!horizontalDiffers(positions)) return [];
    return [{ anchor: pointAlong(levelPath(positions), 0.5), text: describeHorizontal(positions) }];
  }
  if (feature.kind === 'height' && selected) {
    const [from, to] = [positions[0], positions[positions.length - 1]];
    if (!isDiagonal(from, to)) return [];
    const corner = heightTriangleCorner(from, to);
    return [
      { anchor: pointAlong([from, corner], 0.5), text: describeRise(from, to) },
      { anchor: pointAlong([corner, to], 0.5), text: describeHorizontal([from, to]) },
    ];
  }
  return [];
}

function legsShown(feature: DrawnFeature, selected: boolean): boolean {
  const { positions } = feature;
  return selected && isDiagonal(positions[0], positions[positions.length - 1]);
}

export function levelLineFor(positions: Cesium.Cartesian3[]): Cesium.Cartesian3[] {
  return horizontalDiffers(positions) ? levelPath(positions) : [];
}

export function hiddenLineMaterial(color: Cesium.Color): Cesium.MaterialProperty {
  return new Cesium.ColorMaterialProperty(color.withAlpha(0.35));
}

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

export function casedDashMaterial(color: Cesium.Color): Cesium.MaterialProperty {
  return new Cesium.PolylineDashMaterialProperty({
    color,
    gapColor: MAP_COLORS.casing.withAlpha(0.6),
    dashLength: 10,
  });
}

export function styleFeature(feature: DrawnFeature, selected: boolean): void {
  const kindColor = colorFor(feature.kind);
  const width = baseLineWidth(feature.kind);

  for (const entity of feature.entities) {
    const part = partOf(entity);
    entity.show =
      feature.visible &&
      (part === 'vertical' || part === 'horizontal' ? legsShown(feature, selected) : true);
    const style = PARTS.get(entity);
    const color = style?.color ?? kindColor;

    if (entity.polyline) {
      const isMeasurement = MEASURE_KINDS.has(feature.kind);
      if (style?.dashed) {
        entity.polyline.width = new Cesium.ConstantProperty(selected ? 3 : 2);
        entity.polyline.material = casedDashMaterial(color);
      } else if (isMeasurement) {
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
      const small = feature.kind === 'label' || style?.part === 'obstruction';
      const base = small ? 7 : 10;
      entity.point.pixelSize = new Cesium.ConstantProperty(selected ? base + 4 : base);
      entity.point.outlineWidth = new Cesium.ConstantProperty(selected ? 3 : 2);
      entity.point.color = new Cesium.ConstantProperty(color);
    }
  }
}

export function applyGeometry(feature: DrawnFeature, positions: Cesium.Cartesian3[]): void {
  const [first, last] = [positions[0], positions[positions.length - 1]];
  const eye = first;

  for (const entity of feature.entities) {
    const part = partOf(entity);
    switch (part) {
      case 'outline':
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
