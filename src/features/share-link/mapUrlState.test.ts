import { describe, expect, it } from 'vitest';
import {
  decodeMapUrlState,
  encodeMapUrlState,
  terrainForLink,
  type MapUrlState,
} from './mapUrlState';

describe('encodeMapUrlState / decodeMapUrlState', () => {
  const state: MapUrlState = {
    camera: { longitude: 103.8608, latitude: 1.283454, height: 1500, heading: 12.5, pitch: -45 },
    basemap: 'esri-imagery',
    terrain: 'public:terrain/singapore',
    mode: '3d',
    layers: ['example:sg-rail-lines', 'example:https://tiles.arcgis.com/a/b/SceneServer'],
  };

  it('round-trips everything', () => {
    expect(decodeMapUrlState(encodeMapUrlState(state))).toEqual(state);
  });

  it('accepts the fragment with or without its #', () => {
    expect(decodeMapUrlState(`#${encodeMapUrlState(state)}`)).toEqual(state);
  });

  it('writes a readable fragment: literal commas, colons and slashes', () => {
    const fragment = encodeMapUrlState(state);
    expect(fragment).toContain('camera=103.860800,1.283454,1500.0,12.5,-45.0');
    expect(fragment).toContain('layer=example:https://tiles.arcgis.com/a/b/SceneServer');
  });

  it('writes a heading that rounds up to a full turn as north', () => {
    const fragment = encodeMapUrlState({
      camera: { longitude: 0, latitude: 0, height: 1, heading: 359.97, pitch: -90 },
    });
    expect(fragment).toBe('camera=0.000000,0.000000,1.0,0.0,-90.0');
  });

  it('keeps ids containing URL characters intact', () => {
    const [, url] = decodeMapUrlState(encodeMapUrlState(state)).layers ?? [];
    expect(url).toBe('example:https://tiles.arcgis.com/a/b/SceneServer');
  });

  it('writes "no terrain" explicitly, and leaves out what is absent', () => {
    expect(encodeMapUrlState({ terrain: null })).toBe('terrain=none');
    expect(decodeMapUrlState('terrain=none')).toEqual({ terrain: null });
    expect(encodeMapUrlState({})).toBe('');
  });

  it('leaves the default terrain out of a link, and writes any change from it', () => {
    const singapore = 'public:terrain/singapore';
    expect(terrainForLink(singapore, singapore)).toBeUndefined();
    expect(terrainForLink(null, null)).toBeUndefined();
    expect(terrainForLink(null, singapore)).toBeNull();
    expect(terrainForLink('public:terrain/other', singapore)).toBe('public:terrain/other');
    expect(encodeMapUrlState({ terrain: terrainForLink(singapore, singapore) })).toBe('');
  });

  it('drops malformed fields one by one instead of rejecting the link', () => {
    expect(
      decodeMapUrlState('camera=1,2,three,4,5&basemap=osm&mode=4d&layer=a&layer=a&layer='),
    ).toEqual({ basemap: 'osm', layers: ['a'] });
    expect(decodeMapUrlState('camera=200,1,100,0,-90')).toEqual({});
    expect(decodeMapUrlState('camera=103,1,-5,0,-90')).toEqual({});
  });

  it('ignores fragments that are not ours', () => {
    expect(decodeMapUrlState('#section-2')).toEqual({});
  });
});
