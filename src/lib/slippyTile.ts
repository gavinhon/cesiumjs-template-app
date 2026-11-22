/**
 * The Web Mercator ("slippy map") tile containing a point — the {z}/{x}/{y}
 * scheme OpenStreetMap, Esri and every XYZ tile server share — and that
 * tile's extent in EPSG:3857 metres, for asking a WMS server for the same
 * square.
 *
 * Used to give each basemap a thumbnail: one real tile of the area the app
 * opens on, from that basemap's own service, rather than a stock picture
 * that may not match what you get.
 */

const EARTH_HALF_CIRCUMFERENCE = 20037508.342789244; // metres, EPSG:3857

export interface SlippyTile {
  z: number;
  x: number;
  y: number;
}

/** The tile at `zoom` containing `longitude`/`latitude` (degrees). */
export function tileAt(longitude: number, latitude: number, zoom: number): SlippyTile {
  const n = 2 ** zoom;
  const lat = (latitude * Math.PI) / 180;
  const x = Math.floor(((longitude + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n);
  return { z: zoom, x: Math.min(Math.max(x, 0), n - 1), y: Math.min(Math.max(y, 0), n - 1) };
}

/** The tile's extent in EPSG:3857 metres, as `minX,minY,maxX,maxY` for a WMS `BBOX`. */
export function tileBbox3857({ z, x, y }: SlippyTile): [number, number, number, number] {
  const size = (2 * EARTH_HALF_CIRCUMFERENCE) / 2 ** z;
  const minX = -EARTH_HALF_CIRCUMFERENCE + x * size;
  const maxY = EARTH_HALF_CIRCUMFERENCE - y * size;
  return [minX, maxY - size, minX + size, maxY];
}
