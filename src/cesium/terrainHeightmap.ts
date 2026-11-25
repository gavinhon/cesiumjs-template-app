import * as Cesium from 'cesium';

export interface TerrainHeightmap {
  west: number;
  south: number;
  texelWidth: number;
  texelHeight: number;
  width: number;
  height: number;
  pixels: Uint8Array;
}

const HEIGHT_FLOOR = -1000;
const HEIGHT_STEP = 0.1;

export function encodeHeight(height: number): number {
  return Math.max(0, Math.min(65535, Math.round((height - HEIGHT_FLOOR) / HEIGHT_STEP)));
}

export function decodeHeight(value: number): number {
  return value * HEIGHT_STEP + HEIGHT_FLOOR;
}

export const DECODE_HEIGHT_GLSL = `(c.r * 65280.0 + c.g * 255.0) * ${HEIGHT_STEP.toFixed(1)} + ${HEIGHT_FLOOR.toFixed(1)}`;

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

interface QuantizedMeshArrays {
  _uValues?: Uint16Array;
  _vValues?: Uint16Array;
  _heightValues?: Uint16Array;
  _indices?: Uint16Array | Uint32Array;
  _minimumHeight?: number;
  _maximumHeight?: number;
}

const QUANTIZED_MAX = 32767;

const TEXELS_PER_TILE = 64;

const MAX_TILES = 1200;

const MAX_TEXELS = 4_000_000;

const MAX_LEVEL = 13;

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
  return best && best.level >= 6 ? best : null;
}

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

  const toTexel = (longitude: number, latitude: number): [number, number] => [
    (longitude - bounds.west) / texelWidth - 0.5,
    (latitude - bounds.south) / texelHeight - 0.5,
  ];

  let readable = 0;
  const read = async (index: number) => {
    const { x, y } = tiles[index];
    const data = (await provider.requestTileGeometry(x, y, level)) as
      (Cesium.TerrainData & QuantizedMeshArrays) | undefined;
    // Private decoded arrays: feature-detected; without them nothing is draped.
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
