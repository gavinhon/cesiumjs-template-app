import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanPublicFolder } from './publicDatasetCatalog.ts';

let publicDir: string;

function put(relativePath: string, content = '') {
  const full = path.join(publicDir, ...relativePath.split('/'));
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

const terrainLayer = (extra: object = {}) =>
  JSON.stringify({ format: 'quantized-mesh-1.0', tiles: ['{z}/{x}/{y}.terrain'], ...extra });

beforeEach(() => {
  publicDir = mkdtempSync(path.join(tmpdir(), 'public-scan-'));
});

afterEach(() => {
  rmSync(publicDir, { recursive: true, force: true });
});

describe('scanPublicFolder', () => {
  it('returns nothing for a missing or empty folder', () => {
    expect(scanPublicFolder(path.join(publicDir, 'absent'), '/')).toEqual([]);
    expect(scanPublicFolder(publicDir, '/')).toEqual([]);
  });

  it('finds a 3D Tiles dataset and points at its tileset.json', () => {
    put('tilesets/city/tileset.json', '{}');
    expect(scanPublicFolder(publicDir, '/')).toEqual([
      {
        kind: '3d-tiles',
        id: 'public:tilesets/city',
        name: 'city',
        path: 'tilesets/city',
        url: '/tilesets/city/tileset.json',
      },
    ]);
  });

  it('finds terrain, taking its name, bounds and attribution from layer.json', () => {
    put(
      'terrain/sg/layer.json',
      terrainLayer({ name: 'Singapore DTM', bounds: [103.6, 1.2, 104.1, 1.5], attribution: 'GEM' }),
    );
    expect(scanPublicFolder(publicDir, '/')).toEqual([
      {
        kind: 'terrain',
        id: 'public:terrain/sg',
        name: 'Singapore DTM',
        path: 'terrain/sg',
        url: '/terrain/sg',
        bounds: [103.6, 1.2, 104.1, 1.5],
        attribution: 'GEM',
      },
    ]);
  });

  it('accepts legacy heightmap terrain too', () => {
    put('old/layer.json', JSON.stringify({ format: 'heightmap-1.0' }));
    expect(scanPublicFolder(publicDir, '/').map((d) => d.kind)).toEqual(['terrain']);
  });

  it('ignores a layer.json that isn’t terrain, or isn’t valid JSON', () => {
    put('other-tool/layer.json', JSON.stringify({ format: 'something-else' }));
    put('broken/layer.json', '{ not json');
    expect(scanPublicFolder(publicDir, '/')).toEqual([]);
  });

  it('recognises an XYZ tile pyramid and its deepest level', () => {
    put('imagery/1965/10/800/500.png');
    put('imagery/1965/12/3200/2000.png');
    const [dataset] = scanPublicFolder(publicDir, '/');
    expect(dataset).toMatchObject({
      kind: 'xyz',
      urlTemplate: '/imagery/1965/{z}/{x}/{y}.png',
      maximumLevel: 12,
    });
  });

  it('flips y for a TMS pyramid, which counts rows from the south', () => {
    put('imagery/tms/5/10/20.jpg');
    put('imagery/tms/tilemapresource.xml', '<TileMap/>');
    const [dataset] = scanPublicFolder(publicDir, '/');
    expect(dataset).toMatchObject({ urlTemplate: '/imagery/tms/{z}/{x}/{reverseY}.jpg' });
  });

  it('doesn’t mistake numbered folders without images for a pyramid', () => {
    put('reports/2024/01/summary.txt');
    expect(scanPublicFolder(publicDir, '/')).toEqual([]);
  });

  it('finds GeoJSON files, named without the extension', () => {
    put('vectors/Parks.GeoJSON', '{}');
    expect(scanPublicFolder(publicDir, '/')).toEqual([
      {
        kind: 'geojson',
        id: 'public:vectors/Parks.GeoJSON',
        name: 'Parks',
        path: 'vectors/Parks.GeoJSON',
        url: '/vectors/Parks.GeoJSON',
      },
    ]);
  });

  it('doesn’t look inside a recognised dataset', () => {
    put('tilesets/city/tileset.json', '{}');
    put('tilesets/city/extras/inner.geojson', '{}');
    expect(scanPublicFolder(publicDir, '/').map((d) => d.path)).toEqual(['tilesets/city']);
  });

  it('skips hidden folders and Cesium’s own runtime assets', () => {
    put('.cache/tileset.json', '{}');
    put('cesium/Assets/tileset.json', '{}');
    expect(scanPublicFolder(publicDir, '/')).toEqual([]);
  });

  it('prefixes every URL with the deploy base path', () => {
    put('tilesets/city/tileset.json', '{}');
    put('imagery/x/3/1/1.png');
    const urls = scanPublicFolder(publicDir, '/maps/').map((d) =>
      d.kind === 'xyz' ? d.urlTemplate : d.url,
    );
    expect(urls).toEqual(['/maps/imagery/x/{z}/{x}/{y}.png', '/maps/tilesets/city/tileset.json']);
  });

  it('sorts datasets by path', () => {
    put('b/tileset.json', '{}');
    put('a.geojson', '{}');
    put('c/layer.json', terrainLayer());
    expect(scanPublicFolder(publicDir, '/').map((d) => d.path)).toEqual(['a.geojson', 'b', 'c']);
  });
});
