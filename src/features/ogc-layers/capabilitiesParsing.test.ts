// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCapabilities } from './capabilitiesXml';
import { parseWfsFeatureTypes } from './fetchWfsFeatureTypes';
import { parseWmsLayers } from './fetchWmsLayers';

const xml = (text: string) => new DOMParser().parseFromString(text, 'text/xml');

describe('parseWmsLayers (WMS 1.3.0)', () => {
  const doc = xml(`
    <WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms">
      <Capability>
        <Layer>
          <Title>Group with no name</Title>
          <Layer>
            <Name>topp:states</Name>
            <Title>USA Population</Title>
            <EX_GeographicBoundingBox>
              <westBoundLongitude>-124.7</westBoundLongitude>
              <eastBoundLongitude>-66.9</eastBoundLongitude>
              <southBoundLatitude>24.9</southBoundLatitude>
              <northBoundLatitude>49.3</northBoundLatitude>
            </EX_GeographicBoundingBox>
            <Layer>
              <Name>nested:untitled</Name>
            </Layer>
          </Layer>
        </Layer>
      </Capability>
    </WMS_Capabilities>`);

  it('lists named layers at any depth and skips unnamed group layers', () => {
    expect(parseWmsLayers(doc).map((layer) => layer.name)).toEqual([
      'topp:states',
      'nested:untitled',
    ]);
  });

  it('reads the title, falling back to the name', () => {
    const [states, untitled] = parseWmsLayers(doc);
    expect(states.title).toBe('USA Population');
    expect(untitled.title).toBe('nested:untitled');
  });

  it('reads an EX_GeographicBoundingBox, and doesn’t inherit one from a parent', () => {
    const [states, untitled] = parseWmsLayers(doc);
    expect(states.boundingBox).toEqual({ west: -124.7, east: -66.9, south: 24.9, north: 49.3 });
    expect(untitled.boundingBox).toBeUndefined();
  });
});

describe('parseWmsLayers (WMS 1.1.1)', () => {
  it('reads a LatLonBoundingBox from its attributes', () => {
    const [layer] = parseWmsLayers(
      xml(`<WMT_MS_Capabilities><Capability><Layer>
             <Name>roads</Name>
             <LatLonBoundingBox minx="103.6" miny="1.2" maxx="104.1" maxy="1.5"/>
           </Layer></Capability></WMT_MS_Capabilities>`),
    );
    expect(layer.boundingBox).toEqual({ west: 103.6, south: 1.2, east: 104.1, north: 1.5 });
  });

  it('drops a bounding box with a missing edge rather than flying somewhere wrong', () => {
    const [layer] = parseWmsLayers(
      xml(`<WMT_MS_Capabilities><Capability><Layer>
             <Name>roads</Name>
             <LatLonBoundingBox minx="103.6" miny="1.2" maxx="104.1"/>
           </Layer></Capability></WMT_MS_Capabilities>`),
    );
    expect(layer.boundingBox).toBeUndefined();
  });

  it('drops an EX_GeographicBoundingBox with a missing edge, too', () => {
    const [layer] = parseWmsLayers(
      xml(`<WMS_Capabilities><Capability><Layer>
             <Name>roads</Name>
             <EX_GeographicBoundingBox>
               <westBoundLongitude>103.6</westBoundLongitude>
               <eastBoundLongitude>104.1</eastBoundLongitude>
               <southBoundLatitude>1.2</southBoundLatitude>
             </EX_GeographicBoundingBox>
           </Layer></Capability></WMS_Capabilities>`),
    );
    expect(layer.boundingBox).toBeUndefined();
  });

  it('throws when the server lists nothing requestable', () => {
    expect(() => parseWmsLayers(xml('<WMS_Capabilities/>'))).toThrow(/no named layers/);
  });
});

describe('parseWfsFeatureTypes', () => {
  it('reads namespaced WFS 2.0 feature types with OWS corner-pair extents', () => {
    const [type] = parseWfsFeatureTypes(
      xml(`
        <wfs:WFS_Capabilities xmlns:wfs="http://www.opengis.net/wfs/2.0"
                              xmlns:ows="http://www.opengis.net/ows/1.1">
          <wfs:FeatureTypeList>
            <wfs:FeatureType>
              <wfs:Name>sg:buildings</wfs:Name>
              <wfs:Title>Buildings</wfs:Title>
              <ows:WGS84BoundingBox>
                <ows:LowerCorner>103.6 1.2</ows:LowerCorner>
                <ows:UpperCorner>104.1 1.5</ows:UpperCorner>
              </ows:WGS84BoundingBox>
            </wfs:FeatureType>
          </wfs:FeatureTypeList>
        </wfs:WFS_Capabilities>`),
    );
    expect(type).toEqual({
      name: 'sg:buildings',
      title: 'Buildings',
      boundingBox: { west: 103.6, south: 1.2, east: 104.1, north: 1.5 },
    });
  });

  it('reads the WFS 1.0 LatLongBoundingBox attribute form', () => {
    const [type] = parseWfsFeatureTypes(
      xml(`<WFS_Capabilities><FeatureTypeList><FeatureType>
             <Name>parks</Name>
             <LatLongBoundingBox minx="1" miny="2" maxx="3" maxy="4"/>
           </FeatureType></FeatureTypeList></WFS_Capabilities>`),
    );
    expect(type.boundingBox).toEqual({ west: 1, south: 2, east: 3, north: 4 });
  });

  it('throws when the server lists no feature types', () => {
    expect(() => parseWfsFeatureTypes(xml('<WFS_Capabilities/>'))).toThrow(/no feature types/);
  });
});

describe('fetchCapabilities', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function respondWith(body: string, init: ResponseInit = {}) {
    const fetchMock = vi.fn(async () => new Response(body, init));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('adds the service parameters to the URL, keeping the ones already there', async () => {
    const fetchMock = respondWith('<WMS_Capabilities/>');
    await fetchCapabilities('https://example.com/geoserver/wms?map=base', {
      SERVICE: 'WMS',
      REQUEST: 'GetCapabilities',
    });
    const requested = new URL(String(fetchMock.mock.calls[0]?.[0 as never]));
    expect(requested.searchParams.get('map')).toBe('base');
    expect(requested.searchParams.get('SERVICE')).toBe('WMS');
    expect(requested.searchParams.get('REQUEST')).toBe('GetCapabilities');
  });

  it('rejects something that isn’t a URL before making any request', async () => {
    const fetchMock = respondWith('');
    await expect(fetchCapabilities('not a url', {})).rejects.toThrow(/valid URL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports an HTTP error with its status', async () => {
    respondWith('nope', { status: 404, statusText: 'Not Found' });
    await expect(fetchCapabilities('https://example.com/wms', {})).rejects.toThrow(/404 Not Found/);
  });

  it('reports a response that isn’t XML', async () => {
    respondWith('<html><body>Login required');
    await expect(fetchCapabilities('https://example.com/wms', {})).rejects.toThrow(
      /Could not parse/,
    );
  });
});
