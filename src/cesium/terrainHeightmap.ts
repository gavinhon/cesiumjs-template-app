import * as Cesium from 'cesium';

/**
 * The terrain's heights over an area as a grid — what a shader needs to
 * stand each vertex of a building on the ground (see `terrainDrape.ts`).
 *
 * Cesium has no way to give a shader the terrain: the globe is drawn from
 * its own tiles, and a vertex shader can't ask where the ground is. So the
 * heights are read once from the terrain tiles themselves and packed into
 * a texture. Two bytes per texel, red the high byte and green the low,
 * tenths of a metre from -1000 m (see `encodeHeight`) — plain RGBA8, so
 * no float-texture extension is needed. Blue is 255 where the terrain had
 * data; the shader reads gaps as the ellipsoid, as the globe draws them.
 */
export interface TerrainHeightmap {
  /** South-west corner and size of one texel, in radians. */
  west: number;
  south: number;
  texelWidth: number;
  texelHeight: number;
  /** Texels across and up. Row 0 is the southern edge (WebGL's y-up). */
  width: number;
  height: number;
  /** RGBA8, `width * height * 4` bytes, rows from south to north. */
  pixels: Uint8Array;
}

/** Tenths of a metre, from -1000 m: two bytes cover -1000 m to +5553.5 m. */
const HEIGHT_FLOOR = -1000;
const HEIGHT_STEP = 0.1;

/** A height as the 16-bit value the texture stores; out-of-range heights clamp. */
export function encodeHeight(height: number): number {
  return Math.max(0, Math.min(65535, Math.round((height - HEIGHT_FLOOR) / HEIGHT_STEP)));
}

/** The inverse of `encodeHeight` — what the shader computes from red and green. */
export function decodeHeight(value: number): number {
  return value * HEIGHT_STEP + HEIGHT_FLOOR;
}

/** The GLSL that matches `decodeHeight`, for a texel read as normalised floats. */
export const DECODE_HEIGHT_GLSL = `(c.r * 65280.0 + c.g * 255.0) * ${HEIGHT_STEP.toFixed(1)} + ${HEIGHT_FLOOR.toFixed(1)}`;

/**
 * Writes one triangle's heights into a grid, interpolating across it —
 * every texel whose centre lies inside (edges included, so neighbouring
 * triangles leave no cracks).
 *
 * Coordinates are in texels, with texel (i, j)'s centre at (i, j).
 */
export function rasterizeTriangle(
  grid: { width: number; height: number; heights: Float32Array; filled: Uint8Array },
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
): void {
  const [ax, ay, ah] = a;
  const [bx, by, bh] = b;
  const [cx, cy, ch] = c;
  const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  if (area === 0) return;
  const minX = Math.max(0, Math.ceil(Math.min(ax, bx, cx)));
  const maxX = Math.min(grid.width - 1, Math.floor(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.ceil(Math.min(ay, by, cy)));
  const maxY = Math.min(grid.height - 1, Math.floor(Math.max(ay, by, cy)));
  // A texel centre exactly on a shared edge belongs to both triangles; the
  // tolerance keeps rounding from dropping it from either.
  const epsilon = -1e-9;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const wa = ((bx - x) * (cy - y) - (cx - x) * (by - y)) / area;
      const wb = ((cx - x) * (ay - y) - (ax - x) * (cy - y)) / area;
      const wc = 1 - wa - wb;
      if (wa < epsilon || wb < epsilon || wc < epsilon) continue;
      const index = y * grid.width + x;
      grid.heights[index] = wa * ah + wb * bh + wc * ch;
      grid.filled[index] = 1;
    }
  }
}

/** The private arrays of a decoded quantized-mesh tile, which Cesium doesn't expose. */
interface QuantizedMeshArrays {
  _uValues?: Uint16Array;
  _vValues?: Uint16Array;
  _heightValues?: Uint16Array;
  _indices?: Uint16Array | Uint32Array;
  _minimumHeight?: number;
  _maximumHeight?: number;
}

/** Quantized-mesh coordinates run 0–32767 across a tile. */
const QUANTIZED_MAX = 32767;

/** Texels across one tile: the 65-vertex grid Cesium assumes for a tile, less one. */
const TEXELS_PER_TILE = 64;

/** More terrain tiles than this, and a coarser level is read instead. */
const MAX_TILES = 1200;

/** A texture any larger costs more GPU memory than draping is worth. */
const MAX_TEXELS = 4_000_000;

/** The deepest level read: ~38 m texels, finer than buildings need to stand level. */
const MAX_LEVEL = 13;

/**
 * The terrain tiles covering `area` at the deepest level that has at most
 * `MAX_TILES` of them, walking down from level 0 through the provider's
 * availability — which skips the parts of the world a local terrain
 * doesn't cover without ever listing them.
 */
function tilesCovering(
  provider: Cesium.TerrainProvider,
  area: Cesium.Rectangle,
): { level: number; tiles: { x: number; y: number }[] } | null {
  const { availability, tilingScheme } = provider;
  if (!availability) return null;
  const overlaps = (x: number, y: number, level: number) =>
    Cesium.Rectangle.intersection(tilingScheme.tileXYToRectangle(x, y, level), area) !== undefined;

  let current: { x: number; y: number }[] = [];
  for (let x = 0; x < tilingScheme.getNumberOfXTilesAtLevel(0); x++) {
    for (let y = 0; y < tilingScheme.getNumberOfYTilesAtLevel(0); y++) {
      if (availability.isTileAvailable(0, x, y) && overlaps(x, y, 0)) current.push({ x, y });
    }
  }
  let best: { level: number; tiles: { x: number; y: number }[] } | null = null;
  for (let level = 0; level <= MAX_LEVEL && current.length > 0; level++) {
    if (current.length > MAX_TILES) break;
    best = { level, tiles: current };
    const next: { x: number; y: number }[] = [];
    for (const { x, y } of current) {
      for (const [cx, cy] of [
        [2 * x, 2 * y],
        [2 * x + 1, 2 * y],
        [2 * x, 2 * y + 1],
        [2 * x + 1, 2 * y + 1],
      ] as const) {
        if (availability.isTileAvailable(level + 1, cx, cy) && overlaps(cx, cy, level + 1)) {
          next.push({ x: cx, y: cy });
        }
      }
    }
    current = next;
  }
  // Level 0 alone is the whole hemisphere at a few hundred metres a vertex
  // — that's no terrain to stand a building on.
  return best && best.level >= 6 ? best : null;
}

/**
 * Reads the terrain over `area` into a `TerrainHeightmap`, or `null` where
 * there's nothing to read: the ellipsoid, a provider without tile
 * availability, a terrain that doesn't reach the area, or tiles that
 * aren't quantized mesh.
 *
 * The tiles are requested straight from the provider — the same requests
 * the globe makes, so they usually come from the browser cache — and each
 * triangle is rasterised into the grid. That reads Cesium's private
 * decoded arrays (`_uValues` and friends), feature-detected: the public
 * `interpolateHeight` searches every triangle per point, minutes for a
 * whole island. Without them this returns `null` and nothing is draped.
 */
export async function buildTerrainHeightmap(
  provider: Cesium.TerrainProvider,
  area: Cesium.Rectangle,
): Promise<TerrainHeightmap | null> {
  if (provider instanceof Cesium.EllipsoidTerrainProvider) return null;
  const covering = tilesCovering(provider, area);
  if (!covering) return null;
  const { level, tiles } = covering;
  const { tilingScheme } = provider;

  const rectangles = tiles.map(({ x, y }) => tilingScheme.tileXYToRectangle(x, y, level));
  const bounds = rectangles.reduce((union, rectangle) => Cesium.Rectangle.union(union, rectangle));
  const tileWidth = rectangles[0].width;
  const tileHeight = rectangles[0].height;
  let texelWidth = tileWidth / TEXELS_PER_TILE;
  let texelHeight = tileHeight / TEXELS_PER_TILE;
  const texels = (bounds.width / texelWidth) * (bounds.height / texelHeight);
  if (texels > MAX_TEXELS) {
    const scale = Math.sqrt(texels / MAX_TEXELS);
    texelWidth *= scale;
    texelHeight *= scale;
  }
  const width = Math.max(2, Math.ceil(bounds.width / texelWidth));
  const height = Math.max(2, Math.ceil(bounds.height / texelHeight));
  const grid = {
    width,
    height,
    heights: new Float32Array(width * height),
    filled: new Uint8Array(width * height),
  };

  // Texel (i, j)'s centre sits at (i, j): half a texel in from the corner.
  const toTexel = (longitude: number, latitude: number): [number, number] => [
    (longitude - bounds.west) / texelWidth - 0.5,
    (latitude - bounds.south) / texelHeight - 0.5,
  ];

  let readable = 0;
  const read = async (index: number) => {
    const { x, y } = tiles[index];
    const data = (await provider.requestTileGeometry(x, y, level)) as
      (Cesium.TerrainData & QuantizedMeshArrays) | undefined;
    const u = data?._uValues;
    const v = data?._vValues;
    const h = data?._heightValues;
    const indices = data?._indices;
    const minimum = data?._minimumHeight;
    const maximum = data?._maximumHeight;
    if (!u || !v || !h || !indices || minimum === undefined || maximum === undefined) return;
    readable++;
    const rectangle = rectangles[index];
    const vertex = (k: number): [number, number, number] => [
      ...toTexel(
        rectangle.west + (u[k] / QUANTIZED_MAX) * rectangle.width,
        rectangle.south + (v[k] / QUANTIZED_MAX) * rectangle.height,
      ),
      minimum + (h[k] / QUANTIZED_MAX) * (maximum - minimum),
    ];
    for (let t = 0; t + 2 < indices.length; t += 3) {
      rasterizeTriangle(grid, vertex(indices[t]), vertex(indices[t + 1]), vertex(indices[t + 2]));
    }
  };

  // A few requests at a time: hundreds at once would queue behind each
  // other anyway and starve the globe's own tile loads.
  let next = 0;
  const worker = async () => {
    while (next < tiles.length) await read(next++).catch(() => undefined);
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  if (readable === 0) return null;

  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const value = encodeHeight(grid.filled[i] ? grid.heights[i] : 0);
    pixels[i * 4] = value >> 8;
    pixels[i * 4 + 1] = value & 255;
    pixels[i * 4 + 2] = grid.filled[i] ? 255 : 0;
    pixels[i * 4 + 3] = 255;
  }
  return {
    west: bounds.west,
    south: bounds.south,
    texelWidth,
    texelHeight,
    width,
    height,
    pixels,
  };
}

const cache = new WeakMap<Cesium.TerrainProvider, Map<string, Promise<TerrainHeightmap | null>>>();

/**
 * `buildTerrainHeightmap`, once per terrain and area: draping two layers
 * over the same terrain reads it once, and switching terrain back and
 * forth doesn't read it again.
 */
export function terrainHeightmap(
  provider: Cesium.TerrainProvider,
  area: Cesium.Rectangle,
): Promise<TerrainHeightmap | null> {
  let byArea = cache.get(provider);
  if (!byArea) cache.set(provider, (byArea = new Map()));
  const key = [area.west, area.south, area.east, area.north].map((v) => v.toFixed(6)).join(',');
  let heightmap = byArea.get(key);
  if (!heightmap) byArea.set(key, (heightmap = buildTerrainHeightmap(provider, area)));
  return heightmap;
}
