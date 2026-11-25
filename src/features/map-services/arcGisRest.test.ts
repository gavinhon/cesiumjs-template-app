import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildFeatureQueryUrl,
  describeUrl,
  extentToBoundingBox,
  featureLayerUrl,
  mapServiceUrl,
  parseArcGisServiceLayers,
  parseArcGisUrl,
  readArcGisError,
  urlNamesLayer,
} from './arcGisRest';
import { fetchArcGisJson } from './fetchArcGisJson';

const SERVICES = 'https://example.com/arcgis/rest/services';

describe('parseArcGisUrl', () => {
  it('reads a service URL', () => {
    expect(parseArcGisUrl(`${SERVICES}/USA/MapServer`)).toEqual({
      serviceUrl: `${SERVICES}/USA/MapServer`,
      serviceType: 'MapServer',
    });
  });

  it('splits off a layer id, trailing slash and query string', () => {
    expect(parseArcGisUrl(`${SERVICES}/Parks/FeatureServer/3/?f=pjson`)).toEqual({
      serviceUrl: `${SERVICES}/Parks/FeatureServer`,
      serviceType: 'FeatureServer',
      layerId: 3,
    });
  });

  it('accepts any capitalisation, and normalises it', () => {
    expect(parseArcGisUrl(`${SERVICES}/Parks/featureserver`)?.serviceUrl).toBe(
      `${SERVICES}/Parks/FeatureServer`,
    );
  });

  it('rejects what is not an ArcGIS service', () => {
    expect(parseArcGisUrl('https://ahocevar.com/geoserver/wms')).toBeUndefined();
    expect(parseArcGisUrl(`${SERVICES}/Images/ImageServer`)).toBeUndefined();
    expect(parseArcGisUrl(`${SERVICES}/USA/MapServer/query`)).toBeUndefined();
    expect(parseArcGisUrl('not a url')).toBeUndefined();
  });
});

describe('mapServiceUrl', () => {
  it('returns the MapServer', () => {
    expect(mapServiceUrl(`${SERVICES}/USA/MapServer/`)).toBe(`${SERVICES}/USA/MapServer`);
  });

  it('refuses a FeatureServer and a single layer, which Cesium would draw blank', () => {
    expect(() => mapServiceUrl(`${SERVICES}/Parks/FeatureServer`)).toThrow(/MapServer/);
    expect(() => mapServiceUrl(`${SERVICES}/USA/MapServer/2`)).toThrow(/one layer/);
  });
});

describe('featureLayerUrl', () => {
  it('keeps a layer id already in the URL, ignoring the layer field', () => {
    expect(featureLayerUrl(`${SERVICES}/Parks/FeatureServer/0`, '5')).toBe(
      `${SERVICES}/Parks/FeatureServer/0`,
    );
  });

  it('appends the picked layer to a service URL', () => {
    expect(featureLayerUrl(`${SERVICES}/USA/MapServer`, ' 2 ')).toBe(`${SERVICES}/USA/MapServer/2`);
  });

  it('asks for a layer when there is none', () => {
    expect(() => featureLayerUrl(`${SERVICES}/Parks/FeatureServer`, '')).toThrow(/layer/);
    expect(() => featureLayerUrl(`${SERVICES}/Parks/FeatureServer`, 'parks')).toThrow(/layer/);
  });

  it('knows whether the URL already names one', () => {
    expect(urlNamesLayer(`${SERVICES}/Parks/FeatureServer/0`)).toBe(true);
    expect(urlNamesLayer(`${SERVICES}/Parks/FeatureServer`)).toBe(false);
  });
});

describe('request URLs', () => {
  it('describes a service as JSON, with a token only when given', () => {
    expect(describeUrl(`${SERVICES}/USA/MapServer`)).toBe(`${SERVICES}/USA/MapServer?f=json`);
    expect(new URL(describeUrl(`${SERVICES}/USA/MapServer`, 'abc')).searchParams.get('token')).toBe(
      'abc',
    );
  });

  it('queries every feature as GeoJSON in lon/lat, capped', () => {
    const url = new URL(buildFeatureQueryUrl(`${SERVICES}/Parks/FeatureServer/0`, 500));
    expect(url.pathname).toBe('/arcgis/rest/services/Parks/FeatureServer/0/query');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      where: '1=1',
      outFields: '*',
      outSR: '4326',
      f: 'geojson',
      resultRecordCount: '500',
    });
  });
});

describe('readArcGisError', () => {
  it('reads an error body, with its details and code', () => {
    expect(readArcGisError({ error: { code: 499, message: 'Token Required', details: [] } })).toBe(
      'Token Required (ArcGIS error 499)',
    );
    expect(
      readArcGisError({
        error: { code: 400, message: 'Invalid query', details: ["'f' must be json"] },
      }),
    ).toBe("Invalid query 'f' must be json (ArcGIS error 400)");
  });

  it('passes a normal response', () => {
    expect(readArcGisError({ type: 'FeatureCollection', features: [] })).toBeUndefined();
    expect(readArcGisError(null)).toBeUndefined();
  });
});

describe('parseArcGisServiceLayers', () => {
  it('lists layers by id, leaving out group layers', () => {
    const json = {
      layers: [
        { id: 0, name: 'Cities', subLayerIds: null },
        { id: 1, name: 'Transport', subLayerIds: [2] },
        { id: 2, name: 'Highways', parentLayerId: 1 },
        { id: 'bad', name: 'Ignored' },
      ],
    };
    expect(parseArcGisServiceLayers(json)).toEqual([
      { name: '0', title: 'Cities' },
      { name: '2', title: 'Highways' },
    ]);
  });

  it('returns nothing for a response without layers', () => {
    expect(parseArcGisServiceLayers({ currentVersion: 11 })).toEqual([]);
  });
});

describe('extentToBoundingBox', () => {
  it('passes through a lon/lat extent', () => {
    expect(
      extentToBoundingBox({
        fullExtent: { xmin: -178, ymin: 18, xmax: -66, ymax: 72, spatialReference: { wkid: 4326 } },
      }),
    ).toEqual({ west: -178, south: 18, east: -66, north: 72 });
  });

  it('unprojects a Web Mercator extent, under either of its ids', () => {
    const box = extentToBoundingBox({
      fullExtent: {
        xmin: 0,
        ymin: 0,
        xmax: 111319.49,
        ymax: 111325.14,
        spatialReference: { wkid: 102100, latestWkid: 3857 },
      },
    });
    expect(box?.west).toBe(0);
    expect(box?.south).toBe(0);
    expect(box?.east).toBeCloseTo(1, 6);
    expect(box?.north).toBeCloseTo(1, 4);
  });

  it('gives up on a projection it cannot convert', () => {
    expect(
      extentToBoundingBox({
        fullExtent: { xmin: 0, ymin: 0, xmax: 1, ymax: 1, spatialReference: { wkid: 3414 } },
      }),
    ).toBeUndefined();
    expect(extentToBoundingBox({})).toBeUndefined();
  });
});

describe('fetchArcGisJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function respondWith(body: unknown, status = 200) {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))),
    );
  }

  it('returns a normal response', async () => {
    respondWith({ layers: [] });
    await expect(fetchArcGisJson('https://example.com')).resolves.toEqual({ layers: [] });
  });

  it('turns an error body sent with HTTP 200 into a thrown error', async () => {
    respondWith({ error: { code: 499, message: 'Token Required' } });
    await expect(fetchArcGisJson('https://example.com')).rejects.toThrow('Token Required');
  });

  it('reports an HTTP failure', async () => {
    respondWith({}, 404);
    await expect(fetchArcGisJson('https://example.com')).rejects.toThrow('HTTP 404');
  });

  it('names CORS when the request never gets an answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(fetchArcGisJson('https://example.com')).rejects.toThrow(/CORS/);
  });
});
