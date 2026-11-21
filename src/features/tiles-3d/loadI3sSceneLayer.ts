import * as Cesium from 'cesium';

/**
 * Esri's EGM2008 geoid, served as a tiled elevation service: at each
 * location, how far mean sea level sits above the WGS84 ellipsoid. It is
 * the service Cesium's own I3S examples use, and answers without a key.
 */
const GEOID_URL =
  'https://tiles.arcgis.com/tiles/z2tnIkrLQ2BRzr6P/arcgis/rest/services/EGM2008/ImageServer';

/**
 * One geoid provider for every scene layer, created on first use. Resolves
 * to undefined if the service can't be reached, so scenes still load —
 * just unconverted, the geoid height off.
 */
let geoid: Promise<Cesium.ArcGISTiledElevationTerrainProvider | undefined> | undefined;

/** An I3S scene, loaded: the provider to add to the scene, and the tilesets it streams. */
export interface LoadedSceneLayer {
  provider: Cesium.I3SDataProvider;
  /** One per layer Cesium could read (a building scene layer has several). */
  tilesets: Cesium.Cesium3DTileset[];
}

/**
 * Loads an I3S scene layer or scene service.
 *
 * **Heights.** I3S data almost always stores heights above mean sea level
 * (its `heightModelInfo` says "gravity_related_height"), while Cesium
 * measures from the WGS84 ellipsoid — the same mismatch the terrain script
 * converts for. Passing a geoid provider makes Cesium shift every vertex by
 * the local geoid height as it decodes, so a scene lands at its true
 * position, on terrain that has also been converted (as this app's is).
 * Without one it would sit the geoid height off: 47 m too low in
 * Frankfurt, 32 m too high in San Francisco.
 *
 * **What Cesium can read.** Integrated meshes, 3D objects and building
 * scene layers, in lon/lat (WKID 4326) — the form most published scene
 * layers take. Point and point-cloud layers are skipped (Cesium logs them
 * to the console), and a scene layer in a projected system throws.
 */
export async function loadI3sSceneLayer(url: string, name: string): Promise<LoadedSceneLayer> {
  geoid ??= Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(GEOID_URL).catch(() => undefined);

  let provider: Cesium.I3SDataProvider;
  try {
    provider = await Cesium.I3SDataProvider.fromUrl(url, {
      name,
      // Awaited here, though Cesium's docs say a promise is accepted: the
      // provider is used as-is when the first layer loads, so a promise has
      // no `tilingScheme`, the lookup throws, and Cesium logs "no geoid
      // conversion will be performed" — silently leaving the scene the
      // geoid height off.
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
  return { provider, tilesets };
}

/**
 * A readable message for whatever `I3SDataProvider.fromUrl` rejected with,
 * which is rarely a plain `Error`:
 *
 *  - a failed request rejects with Cesium's `RequestErrorEvent`, not an
 *    `Error` at all;
 *  - an ArcGIS error body (a missing service, a missing token) becomes a
 *    `RuntimeError` whose `message` is that body's `{code, message}`
 *    *object* — which, put on screen as-is, crashes React.
 */
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
