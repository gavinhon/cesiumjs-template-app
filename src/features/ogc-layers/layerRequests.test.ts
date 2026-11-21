import * as Cesium from 'cesium';
import { describe, expect, it } from 'vitest';
import { createImageryProvider } from './createImageryProvider';
import { buildGetFeatureUrl } from './createWfsDataSource';
import type { WfsLayerConfig } from './ogcLayerTypes';

describe('buildGetFeatureUrl', () => {
  const base: WfsLayerConfig = {
    type: 'wfs',
    id: 'w1',
    name: 'States',
    url: 'https://example.com/geoserver/wfs?tenant=demo',
    typeName: 'topp:states',
    version: '2.0.0',
    maxFeatures: 500,
  };
  const paramsOf = (config: WfsLayerConfig) => new URL(buildGetFeatureUrl(config)).searchParams;

  it('uses the WFS 2.0 parameter names', () => {
    const params = paramsOf(base);
    expect(params.get('typeNames')).toBe('topp:states');
    expect(params.get('count')).toBe('500');
    expect(params.has('typeName')).toBe(false);
    expect(params.has('maxFeatures')).toBe(false);
  });

  it('uses the WFS 1.1 parameter names', () => {
    const params = paramsOf({ ...base, version: '1.1.0' });
    expect(params.get('typeName')).toBe('topp:states');
    expect(params.get('maxFeatures')).toBe('500');
    expect(params.has('typeNames')).toBe(false);
    expect(params.has('count')).toBe(false);
  });

  it('asks for GeoJSON in lon/lat degrees and keeps existing parameters', () => {
    const params = paramsOf(base);
    expect(params.get('request')).toBe('GetFeature');
    expect(params.get('outputFormat')).toBe('application/json');
    expect(params.get('srsName')).toBe('EPSG:4326');
    expect(params.get('tenant')).toBe('demo');
  });
});

describe('createImageryProvider', () => {
  it('builds a WMS provider whose extent is the looked-up bounding box', async () => {
    const provider = await createImageryProvider({
      type: 'wms',
      id: 'a',
      name: 'A',
      url: 'https://example.com/wms',
      layers: 'roads',
      boundingBox: { west: 103.6, south: 1.2, east: 104.1, north: 1.5 },
    });
    expect(provider).toBeInstanceOf(Cesium.WebMapServiceImageryProvider);
    expect(
      Cesium.Rectangle.equalsEpsilon(
        provider.rectangle,
        Cesium.Rectangle.fromDegrees(103.6, 1.2, 104.1, 1.5),
        1e-12,
      ),
    ).toBe(true);
  });

  it('leaves a WMS provider without a bounding box at the whole world', async () => {
    const provider = await createImageryProvider({
      type: 'wms',
      id: 'a',
      name: 'A',
      url: 'https://example.com/wms',
      layers: 'roads',
    });
    expect(Cesium.Rectangle.equals(provider.rectangle, Cesium.Rectangle.MAX_VALUE)).toBe(true);
  });

  it('builds a WMTS provider', async () => {
    const provider = await createImageryProvider({
      type: 'wmts',
      id: 'b',
      name: 'B',
      url: 'https://example.com/wmts',
      layer: 'base',
      style: '',
      format: '',
      tileMatrixSetID: 'GoogleMapsCompatible',
    });
    expect(provider).toBeInstanceOf(Cesium.WebMapTileServiceImageryProvider);
  });

  it('builds an XYZ provider from the template, capped at the known deepest level', async () => {
    const provider = await createImageryProvider({
      type: 'xyz',
      id: 'c',
      name: 'C',
      url: '/tiles/{z}/{x}/{reverseY}.png',
      maximumLevel: 14,
    });
    expect(provider).toBeInstanceOf(Cesium.UrlTemplateImageryProvider);
    expect(provider.maximumLevel).toBe(14);
  });
});
