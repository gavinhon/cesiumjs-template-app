import type { GeographicBoundingBox, ServiceLayerOption, WfsVersion } from './mapServiceTypes';
import {
  boxFromMinMaxAttributes,
  childByLocalName,
  childText,
  descendantsByLocalName,
  fetchCapabilities,
  finiteBox,
} from './capabilitiesXml';

/**
 * Looks up the feature types a WFS server offers — the WFS counterpart of
 * `fetchWmsLayers`, and subject to the same CORS caveat.
 *
 * The document shape differs from WMS in two ways worth knowing:
 *
 *  - Feature types are a flat `<FeatureType>` list, not a nested tree, so
 *    there are no "group" entries to skip.
 *  - Everything is namespaced (`wfs:FeatureType`, `ows:WGS84BoundingBox`),
 *    which is why the parsing helpers in ./capabilitiesXml.ts match on `localName`.
 */

/**
 * Reads a feature type's extent. WFS 1.1.0+ uses OWS's corner-pair format
 * (`<ows:WGS84BoundingBox>` with "west south" / "east north" as
 * space-separated text), while WFS 1.0.0 used WMS-style
 * `<LatLongBoundingBox>` attributes. We read either.
 */
function parseBoundingBox(featureTypeEl: Element): GeographicBoundingBox | undefined {
  const wgs84 = childByLocalName(featureTypeEl, 'WGS84BoundingBox');
  if (wgs84) {
    const lower = childText(wgs84, 'LowerCorner')?.split(/\s+/).map(Number);
    const upper = childText(wgs84, 'UpperCorner')?.split(/\s+/).map(Number);
    if (lower?.length === 2 && upper?.length === 2) {
      const box = finiteBox({ west: lower[0], south: lower[1], east: upper[0], north: upper[1] });
      if (box) return box;
    }
  }
  const latLon = childByLocalName(featureTypeEl, 'LatLongBoundingBox');
  return latLon ? boxFromMinMaxAttributes(latLon) : undefined;
}

export async function fetchWfsFeatureTypes(
  serviceUrl: string,
  version: WfsVersion,
): Promise<ServiceLayerOption[]> {
  const xml = await fetchCapabilities(serviceUrl, {
    SERVICE: 'WFS',
    REQUEST: 'GetCapabilities',
    VERSION: version,
  });
  return parseWfsFeatureTypes(xml);
}

/** The feature types in a WFS capabilities document. Separate from the fetch so it can be tested. */
export function parseWfsFeatureTypes(xml: Document): ServiceLayerOption[] {
  const featureTypes: ServiceLayerOption[] = [];
  for (const el of descendantsByLocalName(xml, 'FeatureType')) {
    const name = childText(el, 'Name');
    if (!name) continue;
    featureTypes.push({
      name,
      title: childText(el, 'Title') || name,
      boundingBox: parseBoundingBox(el),
    });
  }

  if (featureTypes.length === 0) {
    throw new Error('The server responded, but listed no feature types.');
  }

  return featureTypes;
}
