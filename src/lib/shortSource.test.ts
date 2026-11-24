import { describe, expect, it } from 'vitest';
import { shortSource } from './shortSource';

describe('shortSource', () => {
  it('keeps the host and the service name of an ArcGIS URL', () => {
    expect(
      shortSource(
        'tiles.arcgis.com/tiles/nGt4QxSblgDfeJn9/arcgis/rest/services/Population_Density/MapServer',
      ),
    ).toBe('tiles.arcgis.com/…/Population_Density/MapServer');
    expect(
      shortSource('services2.arcgis.com/j80Jz/arcgis/rest/services/Rail_Lines/FeatureServer/0'),
    ).toBe('services2.arcgis.com/…/Rail_Lines/FeatureServer/0');
  });

  it('leaves short sources alone', () => {
    expect(shortSource('public/tilesets/sg1965')).toBe('public/tilesets/sg1965');
    expect(shortSource('buildings.reearth.land/tileset.json')).toBe(
      'buildings.reearth.land/tileset.json',
    );
  });
});
