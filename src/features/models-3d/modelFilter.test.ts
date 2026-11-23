import { describe, expect, it } from 'vitest';
import {
  filterableAttributes,
  isFloorAttribute,
  sectionRange,
  showExpression,
} from './modelFilter';

describe('isFloorAttribute', () => {
  it('recognises the ways BIM exports name a part’s floor', () => {
    expect(isFloorAttribute('buildingStorey', 'IfcBuildingStorey')).toBe(true);
    expect(isFloorAttribute('level', 'Level')).toBe(true);
    expect(isFloorAttribute('baseConstraint', 'Base Constraint')).toBe(true);
  });

  it('ignores measurements that merely mention a floor', () => {
    expect(isFloorAttribute('floorArea', 'Floor Area')).toBe(false);
    expect(isFloorAttribute('levelOffset', 'Level Offset')).toBe(false);
    expect(isFloorAttribute('className', 'Class Name')).toBe(false);
  });
});

describe('filterableAttributes', () => {
  const seen = new Map<string, Set<string>>([
    ['className', new Set(['IfcWall', 'IfcSlab', 'IfcDoor'])],
    ['level', new Set(['Level 2', 'Level 10', 'Level 1'])],
    ['globalId', new Set(['a', 'b', 'c'])],
    ['status', new Set(['Proposed', ''])],
  ]);
  const names = { className: 'Class Name', level: 'Level' };

  it('offers categories, floor first, values in natural order', () => {
    expect(filterableAttributes(seen, names)).toEqual([
      { id: 'level', label: 'Level', values: ['Level 1', 'Level 2', 'Level 10'], isFloor: true },
      {
        id: 'className',
        label: 'Class Name',
        values: ['IfcDoor', 'IfcSlab', 'IfcWall'],
        isFloor: false,
      },
    ]);
  });

  it('leaves out identifiers and anything with fewer than two real values', () => {
    const ids = filterableAttributes(seen, names).map((attribute) => attribute.id);
    expect(ids).not.toContain('globalId');
    expect(ids).not.toContain('status');
  });
});

describe('showExpression', () => {
  it('shows only the chosen values', () => {
    expect(showExpression('className', ['IfcWall', 'IfcSlab'])).toBe(
      '${feature["className"]} === "IfcWall" || ${feature["className"]} === "IfcSlab"',
    );
  });

  it('escapes quotes in values', () => {
    expect(showExpression('name', ['12" pipe'])).toBe('${feature["name"]} === "12\\" pipe"');
  });

  it('is null with nothing chosen', () => {
    expect(showExpression('className', [])).toBeNull();
    expect(showExpression(null, ['IfcWall'])).toBeNull();
  });
});

describe('sectionRange', () => {
  it('reads the vertical extent of a transformed root box', () => {
    const tileset = {
      root: {
        transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        boundingVolume: { box: [4.6, 1.7, 4.05, 5.4, 0, 0, 0, 4.4, 0, 0, 0, 5.5] },
      },
    };
    const range = sectionRange(tileset);
    expect(range?.min).toBeCloseTo(-1.45, 6);
    expect(range?.max).toBeCloseTo(9.55, 6);
  });

  it('is null where the clipping frame isn’t known', () => {
    expect(sectionRange({ root: { boundingVolume: { region: [0, 0, 1, 1, 0, 10] } } })).toBeNull();
    expect(sectionRange({ root: { boundingVolume: { box: [0, 0, 0] } } })).toBeNull();
    expect(sectionRange(null)).toBeNull();
  });
});
