import { describe, expect, it } from 'vitest';
import { readModelPart } from './modelPartAttributes';

// Shaped like a wall in the BIM tileset in public/: one merged class, so
// the wall carries empty slots for the slab and beam property sets too.
const wall = [
  { id: 'psetWallCommonIsExternal', value: 'True' },
  { id: 'psetSlabCommonIsExternal', value: undefined },
  { id: 'psetBeamCommonSlope', value: undefined },
  { id: 'globalId', value: '2O2Fr$t4X7Zf8NOew3FLOH' },
  { id: 'className', value: 'IfcWall' },
  { id: 'objectType', value: 'Basic Wall:Generic 200mm' },
  { id: 'objectType_1', value: 'Basic Wall:Generic 200mm' },
  { id: 'name', value: 'Basic Wall:Generic 200mm:310455' },
  { id: 'name_1', value: 'Basic Wall:Generic 200mm:310455' },
  { id: 'expressId', value: 1234 },
  { id: 'ownerHistory', value: 42 },
  { id: 'description', value: '' },
];
const names = {
  psetWallCommonIsExternal: 'Pset_WallCommon_IsExternal',
  globalId: 'GlobalId',
  className: 'Class Name',
  objectType: 'Object Type',
  objectType_1: 'ObjectType',
  name: 'Name',
};

describe('readModelPart', () => {
  it('titles the part with its name', () => {
    expect(readModelPart(wall, names).title).toBe('Basic Wall:Generic 200mm:310455');
  });

  it('lists identity first, then the property sets, under the schema’s names', () => {
    expect(readModelPart(wall, names).rows).toEqual([
      { key: 'Name', value: 'Basic Wall:Generic 200mm:310455' },
      { key: 'Class Name', value: 'IfcWall' },
      { key: 'Object Type', value: 'Basic Wall:Generic 200mm' },
      { key: 'GlobalId', value: '2O2Fr$t4X7Zf8NOew3FLOH' },
      { key: 'Pset_WallCommon_IsExternal', value: 'True' },
    ]);
  });

  it('falls back to the class, then to nothing, for the title', () => {
    expect(readModelPart([{ id: 'className', value: 'IfcSlab' }], {}).title).toBe('IfcSlab');
    expect(readModelPart([{ id: 'height', value: 31 }], {}).title).toBeNull();
  });

  it('labels properties without a schema name by their id', () => {
    expect(readModelPart([{ id: 'height', value: 31.25 }], {}).rows).toEqual([
      { key: 'height', value: '31.25' },
    ]);
  });
});
