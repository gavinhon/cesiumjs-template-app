import type { GeographicBoundingBox, ServiceLayerOption } from './mapServiceTypes';
import {
  boxFromMinMaxAttributes,
  childByLocalName,
  childText,
  descendantsByLocalName,
  fetchCapabilities,
  finiteBox,
  parseNumber,
} from './capabilitiesXml';

function parseBoundingBox(layerEl: Element): GeographicBoundingBox | undefined {
  const exBox = childByLocalName(layerEl, 'EX_GeographicBoundingBox');
  if (exBox) {
    const box = finiteBox({
      west: parseNumber(childText(exBox, 'westBoundLongitude')),
      east: parseNumber(childText(exBox, 'eastBoundLongitude')),
      south: parseNumber(childText(exBox, 'southBoundLatitude')),
      north: parseNumber(childText(exBox, 'northBoundLatitude')),
    });
    if (box) return box;
  }
  const latLon = childByLocalName(layerEl, 'LatLonBoundingBox');
  return latLon ? boxFromMinMaxAttributes(latLon) : undefined;
}

export async function fetchWmsLayers(serviceUrl: string): Promise<ServiceLayerOption[]> {
  const xml = await fetchCapabilities(serviceUrl, {
    SERVICE: 'WMS',
    REQUEST: 'GetCapabilities',
  });
  return parseWmsLayers(xml);
}

export function parseWmsLayers(xml: Document): ServiceLayerOption[] {
  const layers: ServiceLayerOption[] = [];
  for (const layerEl of descendantsByLocalName(xml, 'Layer')) {
    const name = childText(layerEl, 'Name');
    if (!name) continue;
    layers.push({
      name,
      title: childText(layerEl, 'Title') || name,
      boundingBox: parseBoundingBox(layerEl),
    });
  }

  if (layers.length === 0) {
    throw new Error('The server responded, but listed no named layers.');
  }

  return layers;
}
