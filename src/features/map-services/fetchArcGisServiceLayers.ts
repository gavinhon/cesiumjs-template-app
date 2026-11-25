import { describeUrl, parseArcGisServiceLayers, parseArcGisUrl } from './arcGisRest';
import { fetchArcGisJson } from './fetchArcGisJson';
import type { ServiceLayerOption } from './mapServiceTypes';

export async function fetchArcGisServiceLayers(
  url: string,
  token?: string,
): Promise<ServiceLayerOption[]> {
  const parsed = parseArcGisUrl(url);
  if (!parsed) throw new Error('Expected an ArcGIS FeatureServer or MapServer URL.');

  const options = parseArcGisServiceLayers(
    await fetchArcGisJson(describeUrl(parsed.serviceUrl, token)),
  );
  if (options.length === 0) throw new Error('The service lists no feature layers.');
  return options;
}
