import { describe, expect, it } from 'vitest';
import { legendLoaderFor, parseArcGisLegend, wmsLegendUrl } from './layerLegend';

describe('wmsLegendUrl', () => {
  it('builds a GetLegendGraphic request', () => {
    const url = new URL(wmsLegendUrl('https://example.com/geoserver/wms', 'topp:states'));
    expect(url.origin + url.pathname).toBe('https://example.com/geoserver/wms');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      SERVICE: 'WMS',
      REQUEST: 'GetLegendGraphic',
      VERSION: '1.3.0',
      FORMAT: 'image/png',
      SLD_VERSION: '1.1.0',
      LAYER: 'topp:states',
    });
  });

  it("keeps the service URL's own query", () => {
    const url = new URL(
      wmsLegendUrl('https://example.com/cgi-bin/mapserv?map=/maps/a.map', 'roads'),
    );
    expect(url.searchParams.get('map')).toBe('/maps/a.map');
    expect(url.searchParams.get('LAYER')).toBe('roads');
  });
});

describe('parseArcGisLegend', () => {
  it('reads symbols as data URIs, labelled, grouped when there are several sublayers', () => {
    expect(
      parseArcGisLegend({
        layers: [
          {
            layerName: 'Density',
            legend: [
              { label: '0 - 100', imageData: 'AAA', contentType: 'image/png' },
              { label: '', imageData: 'BBB' },
            ],
          },
          { layerName: 'Roads', legend: [{ label: 'Expressway', imageData: 'CCC' }] },
        ],
      }),
    ).toEqual([
      { label: '0 - 100', imageSrc: 'data:image/png;base64,AAA', group: 'Density' },
      { label: 'Density', imageSrc: 'data:image/png;base64,BBB', group: 'Density' },
      { label: 'Expressway', imageSrc: 'data:image/png;base64,CCC', group: 'Roads' },
    ]);
  });

  it('leaves groups off for a single sublayer, and skips symbols without an image', () => {
    expect(
      parseArcGisLegend({
        layers: [{ layerName: 'Only', legend: [{ label: 'A', imageData: 'X' }, { label: 'B' }] }],
      }),
    ).toEqual([{ label: 'A', imageSrc: 'data:image/png;base64,X' }]);
  });

  it('copes with an unexpected shape', () => {
    expect(parseArcGisLegend(null)).toEqual([]);
    expect(parseArcGisLegend({ layers: 'x' })).toEqual([]);
  });
});

describe('legendLoaderFor', () => {
  it('gives each WMS layer its own legend image', async () => {
    const load = legendLoaderFor({
      type: 'wms',
      id: 'a',
      name: 'A',
      url: 'https://example.com/wms',
      layers: 'roads, rivers',
    });
    const legend = await load?.();
    expect(legend?.kind).toBe('items');
    expect(legend?.kind === 'items' && legend.items.map((item) => item.label)).toEqual([
      'roads',
      'rivers',
    ]);
  });

  it('offers nothing for pre-rendered tiles', () => {
    expect(
      legendLoaderFor({ type: 'xyz', id: 'x', name: 'X', url: 'https://t/{z}/{x}/{y}.png' }),
    ).toBeUndefined();
  });
});
