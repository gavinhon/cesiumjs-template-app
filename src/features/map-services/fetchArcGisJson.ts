import { readArcGisError } from './arcGisRest';

/**
 * Fetches an ArcGIS REST response, and throws a readable error for each of
 * the ways it goes wrong — which differ more than you'd expect:
 *
 *  - **Network or CORS failure:** `fetch` rejects with a bare `TypeError`
 *    ("Failed to fetch") that doesn't say which. CORS is the usual one: an
 *    ArcGIS Enterprise server only sends `Access-Control-Allow-Origin` for
 *    origins its administrator allowed.
 *  - **HTTP error:** rare, mostly a wrong path (404) or a proxy in front.
 *  - **ArcGIS error:** most failures come back as HTTP 200 with an
 *    `{"error": ...}` body — see `readArcGisError`.
 */
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
