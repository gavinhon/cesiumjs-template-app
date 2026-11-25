import { readArcGisError } from './arcGisRest';

export async function fetchArcGisJson(url: string): Promise<object> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error(
      'Could not reach the service. Check the URL — if it opens in a browser tab, the ' +
        "server isn't allowing requests from this site (CORS).",
    );
  }
  if (!response.ok) {
    throw new Error(`The service answered HTTP ${response.status}.`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error("The service didn't return JSON. Is this an ArcGIS REST URL?");
  }
  if (typeof json !== 'object' || json === null) {
    throw new Error("The service didn't return a JSON object. Is this an ArcGIS REST URL?");
  }
  const error = readArcGisError(json);
  if (error) throw new Error(error);
  return json;
}
