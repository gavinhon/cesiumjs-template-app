import * as Cesium from 'cesium';
import { APP_CONFIG } from '@/lib/appConfig';

const GEOID_URL =
  'https://tiles.arcgis.com/tiles/z2tnIkrLQ2BRzr6P/arcgis/rest/services/EGM2008/ImageServer';

let geoid: Promise<Cesium.ArcGISTiledElevationTerrainProvider | undefined> | undefined;

export interface LoadedSceneLayer {
  provider: Cesium.I3SDataProvider;
  tilesets: Cesium.Cesium3DTileset[];
  groundRelative: boolean;
  geoidConverted: boolean;
}

export async function loadI3sSceneLayer(url: string, name: string): Promise<LoadedSceneLayer> {
  geoid ??= APP_CONFIG.offline
    ? Promise.resolve(undefined)
    : Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(GEOID_URL).catch(() => undefined);

  let provider: Cesium.I3SDataProvider;
  try {
    provider = await Cesium.I3SDataProvider.fromUrl(url, {
      name,
      // Must be awaited: a promise silently skips the sea-level conversion.
      geoidTiledTerrainProvider: await geoid,
    });
  } catch (error) {
    throw new Error(describeLoadError(error));
  }

  const tilesets = provider.layers.flatMap((layer) => (layer.tileset ? [layer.tileset] : []));
  if (tilesets.length === 0) {
    provider.destroy();
    throw new Error(
      'The scene has no layers Cesium can draw — it reads meshes, 3D objects and ' +
        'building layers, not points or point clouds.',
    );
  }
  const groundRelative = provider.layers.some(
    (layer) =>
      (layer.data as { elevationInfo?: { mode?: unknown } } | undefined)?.elevationInfo?.mode ===
      'relativeToGround',
  );
  return { provider, tilesets, groundRelative, geoidConverted: wasGeoidConverted(provider) };
}

// A geoid provider is not proof: Cesium skips conversion when the geoid fetch fails (worldwide extents).
function wasGeoidConverted(provider: Cesium.I3SDataProvider): boolean {
  if (provider.geoidTiledTerrainProvider === undefined) return false;
  if (!('_geoidDataList' in provider)) return true;
  const tiles = (provider as { _geoidDataList?: unknown })._geoidDataList;
  return Array.isArray(tiles) && tiles.length > 0;
}

export async function geoidHeightAt(position: Cesium.Cartographic): Promise<number> {
  const provider = await geoid;
  if (!provider) return 0;
  try {
    const [sampled] = await Cesium.sampleTerrainMostDetailed(provider, [
      Cesium.Cartographic.clone(position),
    ]);
    return Number.isFinite(sampled.height) ? sampled.height : 0;
  } catch {
    return 0;
  }
}

function describeLoadError(error: unknown): string {
  const message: unknown = error instanceof Error ? error.message : undefined;
  if (typeof message === 'string' && message) return message;
  if (typeof message === 'object' && message !== null && 'message' in message) {
    return `The server answered: ${String(message.message)}`;
  }
  return (
    "Couldn't load the scene layer. Check the URL — if it opens in a browser tab, the " +
    "server isn't allowing requests from this site (CORS)."
  );
}
