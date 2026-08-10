/**
 * Looks up the layers a WMS server actually offers, by fetching and
 * parsing its GetCapabilities document — the standard "what do you have?"
 * request every WMS server must answer. This is what lets the panel show
 * a picklist of real layer names instead of asking the user to already
 * know the server's internal identifier for one.
 *
 * Caveat worth knowing: this uses `fetch`, which the browser blocks unless
 * the server's response includes a permissive CORS header
 * (`Access-Control-Allow-Origin`). Public demo servers often allow this;
 * many private/internal WMS servers don't. Note that this isn't a new
 * limitation this feature introduces — Cesium's `WebMapServiceImageryProvider`
 * has the exact same requirement for the map *tiles* themselves (WebGL
 * refuses to use a cross-origin image as a texture without CORS either).
 * If a lookup fails, the form just falls back to typing the layer name
 * manually — the tiles may still work fine even when the lookup doesn't.
 */

/** A geographic extent in degrees, the shape `Cesium.Rectangle.fromDegrees` expects. */
export interface GeographicBoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface WmsLayerOption {
  /** The identifier you pass as the WMS `LAYERS` parameter. */
  name: string;
  /** Human-readable title from the capabilities document, for display. */
  title: string;
  /** Where this layer actually is, if the server declared it — see `parseBoundingBox`. */
  boundingBox?: GeographicBoundingBox;
}

/** Reads the text of a direct child element, e.g. <Name> under <Layer>. */
function directChildText(parent: Element, tagName: string): string | null {
  for (const child of parent.children) {
    if (child.tagName === tagName) {
      return child.textContent?.trim() || null;
    }
  }
  return null;
}

/**
 * Reads a layer's geographic extent, in whichever of the two formats WMS
 * uses depending on version: <EX_GeographicBoundingBox> (1.3.0, child
 * elements in degrees) or <LatLonBoundingBox> (1.1.1, minx/miny/maxx/maxy
 * attributes). This only looks at the layer's own element — WMS lets a
 * layer inherit its bounding box from a parent group instead of declaring
 * one directly, but following that chain is more complexity than a
 * "zoom to this layer" button needs; layers that rely on inheritance just
 * won't get a precise zoom target.
 */
function parseBoundingBox(layerEl: Element): GeographicBoundingBox | undefined {
  for (const child of layerEl.children) {
    if (child.tagName === 'EX_GeographicBoundingBox') {
      const box = {
        west: Number(directChildText(child, 'westBoundLongitude')),
        east: Number(directChildText(child, 'eastBoundLongitude')),
        south: Number(directChildText(child, 'southBoundLatitude')),
        north: Number(directChildText(child, 'northBoundLatitude')),
      };
      if (Object.values(box).every(Number.isFinite)) return box;
    }
    if (child.tagName === 'LatLonBoundingBox') {
      const box = {
        west: Number(child.getAttribute('minx')),
        south: Number(child.getAttribute('miny')),
        east: Number(child.getAttribute('maxx')),
        north: Number(child.getAttribute('maxy')),
      };
      if (Object.values(box).every(Number.isFinite)) return box;
    }
  }
  return undefined;
}

export async function fetchWmsLayers(serviceUrl: string): Promise<WmsLayerOption[]> {
  let capabilitiesUrl: URL;
  try {
    capabilitiesUrl = new URL(serviceUrl);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }
  capabilitiesUrl.searchParams.set('SERVICE', 'WMS');
  capabilitiesUrl.searchParams.set('REQUEST', 'GetCapabilities');

  const response = await fetch(capabilitiesUrl.toString());
  if (!response.ok) {
    throw new Error(`Server responded with ${response.status} ${response.statusText}`);
  }

  const xml = new DOMParser().parseFromString(await response.text(), 'text/xml');
  if (xml.querySelector('parsererror')) {
    throw new Error("Could not parse the server's response as WMS capabilities XML.");
  }

  // A capabilities document nests <Layer> elements in a tree — a top-level
  // "group" layer containing sub-layers, which may themselves contain more
  // sub-layers. Only "leaf" layers that declare a <Name> are actually
  // requestable; group layers exist purely to organize the tree and have
  // no Name of their own, so we skip those.
  const layers: WmsLayerOption[] = [];
  for (const layerEl of Array.from(xml.getElementsByTagName('Layer'))) {
    const name = directChildText(layerEl, 'Name');
    if (!name) continue;
    layers.push({
      name,
      title: directChildText(layerEl, 'Title') || name,
      boundingBox: parseBoundingBox(layerEl),
    });
  }

  if (layers.length === 0) {
    throw new Error('The server responded, but listed no named layers.');
  }

  return layers;
}
