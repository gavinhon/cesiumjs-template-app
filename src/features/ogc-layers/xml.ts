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
