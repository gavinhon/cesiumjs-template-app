import type { GeographicBoundingBox } from './mapServiceTypes';

export function descendantsByLocalName(root: Document | Element, localName: string): Element[] {
  return Array.from(root.getElementsByTagName('*')).filter((el) => el.localName === localName);
}

export function childByLocalName(parent: Element, localName: string): Element | undefined {
  for (const child of parent.children) {
    if (child.localName === localName) return child;
  }
  return undefined;
}

export function childText(parent: Element, localName: string): string | null {
  return childByLocalName(parent, localName)?.textContent?.trim() || null;
}

export function parseNumber(value: string | null | undefined): number {
  return value == null || value.trim() === '' ? NaN : Number(value);
}

export function finiteBox(box: GeographicBoundingBox): GeographicBoundingBox | undefined {
  return Object.values(box).every(Number.isFinite) ? box : undefined;
}

export function boxFromMinMaxAttributes(element: Element): GeographicBoundingBox | undefined {
  return finiteBox({
    west: parseNumber(element.getAttribute('minx')),
    south: parseNumber(element.getAttribute('miny')),
    east: parseNumber(element.getAttribute('maxx')),
    north: parseNumber(element.getAttribute('maxy')),
  });
}

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
  if (xml.querySelector('parsererror')) {
    throw new Error("Could not parse the server's response as capabilities XML.");
  }
  return xml;
}
