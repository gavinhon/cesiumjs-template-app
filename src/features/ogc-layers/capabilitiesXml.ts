import type { GeographicBoundingBox } from './ogcLayerTypes';

/**
 * Helpers for reading OGC capabilities documents.
 *
 * Everything here matches on `localName` rather than `tagName`, because
 * capabilities documents are namespaced and servers disagree about
 * prefixes. A WMS 1.3.0 document usually writes `<Layer><Name>`, but a WFS
 * 2.0.0 document writes `<wfs:FeatureType><wfs:Name>` and an ArcGIS server
 * may pick yet another prefix. `tagName` includes the prefix, so matching
 * on it silently finds nothing; `localName` is the prefix-stripped name and
 * works regardless.
 */

/** Every descendant element with the given local name, at any depth. */
export function descendantsByLocalName(root: Document | Element, localName: string): Element[] {
  return Array.from(root.getElementsByTagName('*')).filter((el) => el.localName === localName);
}

/** The first direct child element with the given local name, if any. */
export function childByLocalName(parent: Element, localName: string): Element | undefined {
  for (const child of parent.children) {
    if (child.localName === localName) return child;
  }
  return undefined;
}

/** Trimmed text of the first direct child with the given local name. */
export function childText(parent: Element, localName: string): string | null {
  return childByLocalName(parent, localName)?.textContent?.trim() || null;
}

/**
 * A number from capabilities text or an attribute, or `NaN` when it's
 * missing. Not plain `Number()`: `Number(null)` and `Number('')` are both
 * `0`, so a missing edge would read as the equator or the prime meridian
 * and pass every finiteness check.
 */
export function parseNumber(value: string | null | undefined): number {
  return value == null || value.trim() === '' ? NaN : Number(value);
}

/** The box, if all four edges are real numbers — see `parseNumber` for missing ones. */
export function finiteBox(box: GeographicBoundingBox): GeographicBoundingBox | undefined {
  return Object.values(box).every(Number.isFinite) ? box : undefined;
}

/**
 * Reads the older `minx`/`miny`/`maxx`/`maxy` attribute form of an extent —
 * WMS 1.1.1's `<LatLonBoundingBox>` and WFS 1.0.0's `<LatLongBoundingBox>`,
 * which spell the element differently but share the attributes.
 */
export function boxFromMinMaxAttributes(element: Element): GeographicBoundingBox | undefined {
  return finiteBox({
    west: parseNumber(element.getAttribute('minx')),
    south: parseNumber(element.getAttribute('miny')),
    east: parseNumber(element.getAttribute('maxx')),
    north: parseNumber(element.getAttribute('maxy')),
  });
}

/**
 * Fetches a capabilities document and parses it as XML.
 *
 * The caller passes the service-specific query parameters; everything else
 * (URL validation, HTTP errors, XML parse errors) is identical between WMS
 * and WFS and lives here.
 */
export async function fetchCapabilities(
  serviceUrl: string,
  params: Record<string, string>,
): Promise<Document> {
  let url: URL;
  try {
    url = new URL(serviceUrl);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Server responded with ${response.status} ${response.statusText}`);
  }

  const xml = new DOMParser().parseFromString(await response.text(), 'text/xml');
  // DOMParser reports malformed XML by *returning a document* describing the
  // failure rather than throwing, so this check is the only way to notice.
  if (xml.querySelector('parsererror')) {
    throw new Error("Could not parse the server's response as capabilities XML.");
  }
  return xml;
}
