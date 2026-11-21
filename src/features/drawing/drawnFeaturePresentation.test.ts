import * as Cesium from 'cesium';
import { describe, expect, it } from 'vitest';
import { MAP_COLORS } from '@/cesium/mapColors';
import type { DrawnFeature, DrawnFeatureKind } from './drawingTypes';
import {
  applyGeometry,
  colorFor,
  isReadoutKind,
  labelAnchorFor,
  labelTextFor,
  partOf,
  recolorPart,
  styleFeature,
  tagPart,
} from './drawnFeaturePresentation';
import { EYE_HEIGHT } from './lineOfSight';
import { heightOf } from './measurement';

const p = (lon: number, lat: number, height = 0) => Cesium.Cartesian3.fromDegrees(lon, lat, height);

function feature(overrides: Partial<DrawnFeature> & { kind: DrawnFeatureKind }): DrawnFeature {
  return {
    id: 'f1',
    name: 'Feature',
    attributes: [],
    labelSource: 'none',
    visible: true,
    positions: [p(103.8, 1.35)],
    entities: [],
    measurement: null,
    ...overrides,
  };
}

const NOW = Cesium.JulianDate.now();

/** A polyline entity's current positions; fails the test if it has none. */
function linePositions(entity: Cesium.Entity): Cesium.Cartesian3[] {
  const positions: unknown = entity.polyline?.positions?.getValue(NOW);
  if (!Array.isArray(positions)) throw new Error('entity has no polyline positions');
  return positions as Cesium.Cartesian3[];
}

describe('colorFor', () => {
  it('gives each family of feature its own colour', () => {
    expect(colorFor('line')).toBe(MAP_COLORS.accent);
    expect(colorFor('point')).toBe(MAP_COLORS.accent);
    expect(colorFor('measure')).toBe(MAP_COLORS.measure);
    expect(colorFor('height')).toBe(MAP_COLORS.measure);
    expect(colorFor('line-of-sight')).toBe(MAP_COLORS.sight);
    expect(colorFor('viewshed')).toBe(MAP_COLORS.sight);
  });
});

describe('isReadoutKind', () => {
  it('is true for measurements and analyses, false for drawings', () => {
    expect(['measure', 'height', 'line-of-sight', 'viewshed'].every(isReadoutKind as never)).toBe(
      true,
    );
    expect(['point', 'line', 'polygon', 'label'].some(isReadoutKind as never)).toBe(false);
  });
});

describe('labelTextFor', () => {
  it('shows nothing for a hidden feature, whatever its source', () => {
    expect(labelTextFor(feature({ kind: 'point', labelSource: 'name', visible: false }))).toBe(
      null,
    );
  });

  it('shows the name, or nothing when the name is blank', () => {
    expect(labelTextFor(feature({ kind: 'label', labelSource: 'name', name: ' Dock 4 ' }))).toBe(
      'Dock 4',
    );
    expect(labelTextFor(feature({ kind: 'label', labelSource: 'name', name: '  ' }))).toBe(null);
  });

  it('shows the measurement', () => {
    expect(
      labelTextFor(feature({ kind: 'measure', labelSource: 'measurement', measurement: '30.0 m' })),
    ).toBe('30.0 m');
  });

  it('shows an attribute as "key: value", or the bare value without a key', () => {
    const attributes = [
      { id: 'a1', key: 'Owner', value: 'PSA' },
      { id: 'a2', key: ' ', value: 'unlabelled' },
      { id: 'a3', key: 'Empty', value: '' },
    ];
    const withSource = (labelSource: string) =>
      labelTextFor(feature({ kind: 'polygon', attributes, labelSource }));
    expect(withSource('a1')).toBe('Owner: PSA');
    expect(withSource('a2')).toBe('unlabelled');
    expect(withSource('a3')).toBe(null);
    expect(withSource('deleted-attribute')).toBe(null);
  });
});

describe('labelAnchorFor', () => {
  it('puts a single-point feature’s label on the point', () => {
    const point = p(103.8, 1.35, 12);
    expect(labelAnchorFor(feature({ kind: 'point', positions: [point] }))).toBe(point);
  });

  it('puts a line’s label at its last vertex', () => {
    const end = p(103.81, 1.35);
    expect(labelAnchorFor(feature({ kind: 'measure', positions: [p(103.8, 1.35), end] }))).toBe(
      end,
    );
  });

  it('puts a height label on the higher end, whichever was clicked first', () => {
    const roof = p(103.8, 1.35, 40);
    const street = p(103.8001, 1.35, 5);
    expect(labelAnchorFor(feature({ kind: 'height', positions: [street, roof] }))).toBe(roof);
    expect(labelAnchorFor(feature({ kind: 'height', positions: [roof, street] }))).toBe(roof);
  });

  it('puts a viewshed label on the observer’s eye, not the rim point', () => {
    const anchor = labelAnchorFor(
      feature({ kind: 'viewshed', positions: [p(103.8, 1.35, 10), p(103.81, 1.35, 10)] }),
    );
    const carto = Cesium.Cartographic.fromCartesian(anchor);
    expect(Cesium.Math.toDegrees(carto.longitude)).toBeCloseTo(103.8, 9);
    expect(carto.height).toBeCloseTo(10 + EYE_HEIGHT, 4);
  });

  it('centres a polygon’s label in geographic coordinates, at the average height', () => {
    const anchor = labelAnchorFor(
      feature({
        kind: 'polygon',
        positions: [p(103.8, 1.3, 10), p(103.9, 1.3, 20), p(103.9, 1.4, 30), p(103.8, 1.4, 40)],
      }),
    );
    const carto = Cesium.Cartographic.fromCartesian(anchor);
    expect(Cesium.Math.toDegrees(carto.longitude)).toBeCloseTo(103.85, 9);
    expect(Cesium.Math.toDegrees(carto.latitude)).toBeCloseTo(1.35, 9);
    // On the surface, not sunk into the planet as a Cartesian mean would be.
    expect(carto.height).toBeCloseTo(25, 4);
  });
});

describe('entity parts', () => {
  it('defaults an untagged entity to the shape itself', () => {
    expect(partOf(new Cesium.Entity())).toBe('shape');
  });

  it('remembers the part an entity was tagged with', () => {
    const entity = tagPart(new Cesium.Entity(), 'blocked');
    expect(partOf(entity)).toBe('blocked');
  });
});

describe('styleFeature', () => {
  it('hides every entity of a hidden feature', () => {
    const entities = [new Cesium.Entity({ point: {} }), new Cesium.Entity({ polyline: {} })];
    styleFeature(feature({ kind: 'line', entities, visible: false }), false);
    expect(entities.every((entity) => !entity.show)).toBe(true);
  });

  it('enlarges a selected point', () => {
    const entity = new Cesium.Entity({ point: {} });
    const target = feature({ kind: 'point', entities: [entity] });
    styleFeature(target, false);
    const normal = entity.point?.pixelSize?.getValue(NOW) as number;
    styleFeature(target, true);
    expect(entity.point?.pixelSize?.getValue(NOW)).toBeGreaterThan(normal);
  });

  it('honours a recoloured part over the kind’s colour', () => {
    const target = tagPart(new Cesium.Entity({ point: {} }), 'target');
    recolorPart(target, MAP_COLORS.obstructed);
    styleFeature(feature({ kind: 'line-of-sight', entities: [target] }), false);
    expect(target.point?.color?.getValue(NOW)).toEqual(MAP_COLORS.obstructed);
  });

  it('gives a 3D line a faint depth-fail material, but not a draped one', () => {
    const line = new Cesium.Entity({ polyline: { positions: [] } });
    const draped = new Cesium.Entity({ polyline: { positions: [], clampToGround: true } });
    styleFeature(feature({ kind: 'line', entities: [line, draped] }), false);
    expect(line.polyline?.depthFailMaterial).toBeDefined();
    expect(draped.polyline?.depthFailMaterial).toBeUndefined();
  });
});

describe('applyGeometry', () => {
  it('rebuilds a height triangle around the moved vertices', () => {
    const shape = tagPart(new Cesium.Entity({ polyline: {} }), 'shape');
    const vertical = tagPart(new Cesium.Entity({ polyline: {} }), 'vertical');
    const horizontal = tagPart(new Cesium.Entity({ polyline: {} }), 'horizontal');
    const target = feature({ kind: 'height', entities: [shape, vertical, horizontal] });
    const from = p(103.8, 1.35, 0);
    const to = p(103.8003, 1.35, 30);

    applyGeometry(target, [from, to]);

    const [top, end] = linePositions(horizontal);
    expect(heightOf(top)).toBeCloseTo(30, 4); // the corner is level with the end…
    expect(end).toEqual(to);
    const [start, corner] = linePositions(vertical);
    expect(start).toEqual(from); // …and directly above the start
    expect(Cesium.Cartesian3.equalsEpsilon(corner, top, 0, 1e-6)).toBe(true);
  });

  it('closes a polygon’s outline back to its first vertex', () => {
    const outline = tagPart(new Cesium.Entity({ polyline: {} }), 'outline');
    const ring = [p(103.8, 1.3), p(103.9, 1.3), p(103.9, 1.4)];
    applyGeometry(feature({ kind: 'polygon', entities: [outline] }), ring);
    const drawn = linePositions(outline);
    expect(drawn).toHaveLength(4);
    expect(drawn[3]).toEqual(ring[0]);
  });

  it('clears a stale obstruction while a sight line is dragged', () => {
    const blocked = tagPart(
      new Cesium.Entity({ polyline: { positions: [p(0, 0), p(1, 1)] } }),
      'blocked',
    );
    const marker = tagPart(new Cesium.Entity({ position: p(0, 0), point: {} }), 'obstruction');
    applyGeometry(feature({ kind: 'line-of-sight', entities: [blocked, marker] }), [
      p(103.8, 1.35),
      p(103.81, 1.35),
    ]);
    expect(linePositions(blocked)).toEqual([]);
    expect(marker.position).toBeUndefined();
  });
});
