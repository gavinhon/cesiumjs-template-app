import { describe, expect, it } from 'vitest';
import { fetchPropertyNames, propertyNamesFromSchema } from './tilesetPropertyNames';

const schema = {
  classes: {
    merged: {
      properties: {
        className: { name: 'Class Name', type: 'STRING' },
        psetWallCommonIsExternal: { name: 'Pset_WallCommon_IsExternal', type: 'STRING' },
        unnamed: { type: 'STRING' },
      },
    },
  },
};

describe('propertyNamesFromSchema', () => {
  it('maps each property id to its name, leaving out the unnamed', () => {
    expect(propertyNamesFromSchema(schema)).toEqual({
      className: 'Class Name',
      psetWallCommonIsExternal: 'Pset_WallCommon_IsExternal',
    });
  });

  it('returns nothing for something that isn’t a schema', () => {
    expect(propertyNamesFromSchema(null)).toEqual({});
    expect(propertyNamesFromSchema({ classes: 'nope' })).toEqual({});
  });
});

describe('fetchPropertyNames', () => {
  it('reads a schema written inline in tileset.json without fetching', async () => {
    expect(await fetchPropertyNames({ schema }, 'tileset.json')).toEqual({
      className: 'Class Name',
      psetWallCommonIsExternal: 'Pset_WallCommon_IsExternal',
    });
  });

  it('returns nothing for a tileset without a schema', async () => {
    expect(await fetchPropertyNames({ asset: { version: '1.1' } }, 'tileset.json')).toEqual({});
  });
});
