# Local data and local-network servers

How to replace every internet service the app uses with datasets on disk
or servers on your own network — an ArcGIS Enterprise, a GeoServer, a tile
server — so it works on a network with no internet access, using your
organisation's authoritative data.

[deployment-docker.md](deployment-docker.md) covers running the app
air-gapped in Docker: building and carrying the images, mounting the data
folder, and the `APP_OFFLINE` switch that hides everything needing the
internet. This document is the other half: putting **your own** services
where the internet ones were.

## Three ways to bring data in

| Route                                                      | Needs a server? | Rebuild? | Survives offline mode? | Use it for                                                  |
| ---------------------------------------------------------- | --------------- | -------- | ---------------------- | ----------------------------------------------------------- |
| [A. Files in the data folder](#a-files-in-the-data-folder) | No              | No       | Yes                    | Terrain, 3D Tiles, tile pyramids, GeoJSON you can copy      |
| [B. Connect by URL](#b-connect-by-url-at-runtime)          | Yes, on the LAN | No       | Yes                    | One-off or occasional services; trying a server out         |
| [C. Built into the app](#c-built-into-the-app)             | Yes, on the LAN | Yes      | Yes, if you say so     | Services everyone should see: basemaps, catalogue, geocoder |

Start with A wherever you can copy the data: a folder of static files has
nothing to configure, nothing to keep running, and no CORS. Use C for the
services your users should find without typing a URL.

## What the app fetches from the internet

Everything else — Cesium's own code, workers and textures, the fonts, the
app itself — is bundled, and is served by the same server as the page.

| What                           | Where in the code                                                                                              | With `APP_OFFLINE=true`       | Local replacement                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------- |
| Basemaps and their thumbnails  | `ONLINE_BASEMAPS` in [`src/cesium/basemaps.ts`](../src/cesium/basemaps.ts)                                     | Hidden; Natural Earth instead | Tile pyramid in `basemaps/` (A), or a network basemap (C1)                    |
| Example map services           | `EXAMPLE_MAP_SERVICES_ONLINE` in [`exampleMapServices.ts`](../src/features/map-services/exampleMapServices.ts) | Hidden                        | Your services in the catalogue (C2)                                           |
| Example 3D models              | `EXAMPLE_MODELS_ONLINE` in [`exampleModels.ts`](../src/features/models-3d/exampleModels.ts)                    | Hidden                        | Tilesets in the data folder (A), or your scene services in the catalogue (C3) |
| Geoid for I3S heights          | `GEOID_URL` in [`loadI3sSceneLayer.ts`](../src/features/models-3d/loadI3sSceneLayer.ts)                        | Not asked; I3S loads ~8 m low | EGM2008 published on your ArcGIS Enterprise (C4)                              |
| Place search                   | `AS_YOU_TYPE_SERVICE` in [`searchPlaces.ts`](../src/features/search/searchPlaces.ts)                           | Hidden                        | Your own Nominatim — a setting, no rebuild — or another geocoder (C5)         |
| PROJ geoid grid (terrain tool) | `scripts/build_terrain_tiles.py`                                                                               | Baked into the terrain image  | See [deployment-docker.md § 5](deployment-docker.md#5-making-terrain-offline) |

The add form's placeholder text (`https://ahocevar.com/geoserver/wms`) is
only a hint and is never fetched.

To confirm nothing else slipped in, search the code — anything printed
that isn't a comment or a credit link is a dependency:

```powershell
git grep -n "https://" -- src
```

## A. Files in the data folder

Copy the data into the data folder — `public/` in development, the folder
`DATA_DIR` points at in Docker — and the app finds it at startup:

| Put this in the folder                          | It becomes                                    |
| ----------------------------------------------- | --------------------------------------------- |
| a folder with a terrain `layer.json`            | a terrain choice (the first loads at startup) |
| a folder with `tileset.json` (3D Tiles)         | a 3D model in Add data                        |
| a `{z}/{x}/{y}` image pyramid under `basemaps/` | a basemap                                     |
| any other `{z}/{x}/{y}` image pyramid           | an imagery layer in Add data                  |
| a `.geojson` file                               | a vector layer in Add data                    |

Most of an agency's data can be exported to one of these:

- **Elevation** (GeoTIFF DTM) → terrain, with
  [`scripts/build_terrain_tiles.py`](../scripts/build_terrain_tiles.py).
- **Orthophotos and scanned maps** → an image pyramid, with
  `gdal2tiles.py --xyz` or QGIS's _Generate XYZ tiles (Directory)_. Start at
  zoom 0.
- **City models, BIM, photogrammetry** → 3D Tiles, from the tool that made
  them (most export it directly), or with an open converter.
- **Vector data** (shapefile, file geodatabase) → GeoJSON in WGS84:
  `ogr2ogr -f GeoJSON -t_srs EPSG:4326 parks.geojson parks.shp`. Keep it to
  thousands of features, not millions: GeoJSON loads whole into the browser.

In Docker, `docker compose restart app` picks up new folders. I3S scene
layers can't be dropped in as files: they need a server (C3).

## B. Connect by URL at runtime

Add data's **Map service** tab takes WMS, WMTS, WFS, ArcGIS MapServer and
FeatureServer, and XYZ templates; the **3D service** tab takes 3D Tiles
and I3S. Paste a server's URL, the same way as an internet one:

```
https://gis.agency.lan/arcgis/rest/services/LandUse/MapServer
http://10.0.0.20:8080/geoserver/wms
http://tiles.agency.lan/ortho/{z}/{x}/{y}.png
```

This needs no rebuild and works in offline mode. Three things decide
whether a server works, and each fails silently, so check them first when
a layer doesn't appear:

1. **CORS.** The browser only lets the page read from another server if
   that server sends `Access-Control-Allow-Origin`. Allow the app's origin
   (`http://gis-viewer.agency.lan:8080`, say) on the server:
   - **ArcGIS Enterprise / Server:** Administrator Directory → `system` →
     `handlers` → `rest` → `servicesdirectory` → edit → `allowedOrigins`.
   - **GeoServer:** enable the CORS filter in `WEB-INF/web.xml` (it's in
     the file, commented out).
   - **nginx or IIS in front of a tile folder:** add the
     `Access-Control-Allow-Origin` response header.

   Or skip CORS by proxying the server through the app (see
   [Proxying a server through the app](#proxying-a-server-through-the-app)).

2. **Mixed content.** A page served over `https://` can't load from
   `http://`; the browser blocks it before any request is made. Serve both
   the same way, or proxy the `http` server through the app.

3. **Certificates.** A server using your organisation's own certificate
   authority works only if the browser trusts that CA. Install the root
   certificate on the clients. Open the service's URL in a tab: if the
   browser warns there, it will block the app's requests too.

A layer connected this way isn't saved in shared links: links carry only
datasets from the catalogue, so they never contain arbitrary service URLs
or ArcGIS tokens. Put a service in the catalogue (C2, C3) to make it
shareable.

## C. Built into the app

Edits to the source, so the services appear without typing a URL. Each
needs `npm run build` (or a new Docker image) afterwards. Keep your
network services in lists of their own, as below, rather than editing the
internet ones in place: the internet lists are hidden in offline mode, and
yours shouldn't be.

### C1. A basemap from a network server

In [`src/cesium/basemaps.ts`](../src/cesium/basemaps.ts), add a list for
your basemaps and include it in both branches of `BASEMAPS`:

```ts
const NETWORK_BASEMAPS: readonly Basemap[] = [
  {
    id: 'agency-ortho',
    name: 'Agency orthophoto 2025',
    kind: 'ARCGIS MAP',
    thumbnail: {
      url: `https://gis.agency.lan/arcgis/rest/services/Ortho2025/MapServer/tile/${THUMB.z}/${THUMB.y}/${THUMB.x}`,
    },
    createLayer: () =>
      Cesium.ImageryLayer.fromProviderAsync(
        Cesium.ArcGisMapServerImageryProvider.fromUrl(
          'https://gis.agency.lan/arcgis/rest/services/Ortho2025/MapServer',
          { credit: new Cesium.Credit('Imagery: Agency Survey Department', true) },
        ),
      ),
  },
];

export const BASEMAPS: readonly Basemap[] = APP_CONFIG.offline
  ? [...NETWORK_BASEMAPS, ...LOCAL_BASEMAPS, NATURAL_EARTH]
  : [...ONLINE_BASEMAPS, ...NETWORK_BASEMAPS, ...LOCAL_BASEMAPS];
```

For other server types, swap `createLayer` and the thumbnail URL:

| Server     | `createLayer` returns                                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| WMS        | `wmsLayer('http://10.0.0.20:8080/geoserver/wms', 'agency:ortho', 'Imagery: …')`, the helper already in the file                              |
| WMTS       | `new Cesium.ImageryLayer(new Cesium.WebMapTileServiceImageryProvider({ url, layer, style, format, tileMatrixSetID }))`                       |
| XYZ server | `new Cesium.ImageryLayer(new Cesium.UrlTemplateImageryProvider({ url: 'http://tiles.agency.lan/ortho/{z}/{x}/{y}.png', maximumLevel: 19 }))` |

The thumbnail is one ordinary image URL, so any single tile or WMS
`GetMap` of the area works; the existing entries show both. To start on
your basemap, set `DEFAULT_BASEMAP=agency-ortho` in `.env` (Docker), or
move it to the front of the list.

The same CORS, mixed-content and certificate rules as route B apply.

### C2. Map services in the Add data catalogue

In [`exampleMapServices.ts`](../src/features/map-services/exampleMapServices.ts),
add a list that stays in offline mode:

```ts
const EXAMPLE_MAP_SERVICES_NETWORK: readonly ExampleMapService[] = [
  {
    id: 'agency-landuse',
    type: 'arcgis-map',
    name: 'Land use (agency)',
    url: 'https://gis.agency.lan/arcgis/rest/services/LandUse/MapServer',
  },
  {
    id: 'agency-parcels',
    type: 'arcgis-feature',
    name: 'Land parcels (agency)',
    url: 'https://gis.agency.lan/arcgis/rest/services/Parcels/FeatureServer/0',
    maxFeatures: 2000,
  },
];

export const EXAMPLE_MAP_SERVICES: readonly ExampleMapService[] = APP_CONFIG.offline
  ? EXAMPLE_MAP_SERVICES_NETWORK
  : [...EXAMPLE_MAP_SERVICES_ONLINE, ...EXAMPLE_MAP_SERVICES_NETWORK];
```

**Only ArcGIS entries work here today.** The catalogue turns each entry
into a layer in `mapServiceQuickAdd.ts`, and it knows two kinds: an
`arcgis-feature` entry becomes a feature layer, an `arcgis-map` entry an
ArcGIS MapServer. `ExampleMapService.type` accepts only those two, so a
`wms`, `wmts`, `wfs` or `xyz` entry is a type error rather than a layer
that fails when added. To list one, widen that type and extend the
conversion to build the matching config (`WmsLayerConfig` and the others
in [`mapServiceTypes.ts`](../src/features/map-services/mapServiceTypes.ts)),
or connect it by URL (B).

Catalogue entries are listed under "Maps and imagery" or "Features" by
type, can be found by name in search, and are restored by shared links
(their id is `example:<id>`).

### C3. 3D models in the catalogue

In [`exampleModels.ts`](../src/features/models-3d/exampleModels.ts), the
same pattern; both formats work:

```ts
const EXAMPLE_MODELS_NETWORK: readonly ExampleModel[] = [
  {
    format: 'i3s',
    name: 'Buildings LoD2 (agency)',
    url: 'https://gis.agency.lan/server/rest/services/Hosted/Buildings/SceneServer/layers/0',
  },
  {
    format: '3d-tiles',
    name: 'City mesh (agency)',
    url: 'http://tiles.agency.lan/city-mesh/tileset.json',
  },
];

export const EXAMPLE_MODELS: readonly ExampleModel[] = APP_CONFIG.offline
  ? EXAMPLE_MODELS_NETWORK
  : [...EXAMPLE_MODELS_ONLINE, ...EXAMPLE_MODELS_NETWORK];
```

A 3D Tiles dataset you can copy is simpler as files (route A). I3S needs
a server: ArcGIS Enterprise publishes scene layers, or a scene layer
package (`.slpk`) can be served by a tool that understands the format.

### C4. The geoid for I3S heights

I3S scene layers are georeferenced to mean sea level; Cesium draws on the
WGS84 ellipsoid. The app converts with Esri's public EGM2008 service and,
offline, skips it — scenes then sit about 8 m low around Singapore.

To convert on your own network, publish EGM2008 as a tiled elevation
image service on your ArcGIS Enterprise, then in
[`loadI3sSceneLayer.ts`](../src/features/models-3d/loadI3sSceneLayer.ts)
point `GEOID_URL` at it and drop the offline check, since the service is
now reachable offline:

```ts
const GEOID_URL = 'https://gis.agency.lan/arcgis/rest/services/EGM2008/ImageServer';
// …
geoid ??= Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(GEOID_URL).catch(() => undefined);
```

3D Tiles and terrain don't use this: the terrain tool converts heights
when it builds the tiles, and 3D Tiles are placed on the terrain.

### C5. Place search on your network

**A Nominatim server needs no code change.** Set `NOMINATIM_URL` and the
search box uses it as you type, offline or not, through a proxy in the
app's nginx — see
[deployment-docker.md § 6](deployment-docker.md#6-place-search-with-your-own-nominatim).

**Another geocoder** (an ArcGIS Enterprise geocode service, say) is a
`PlaceService` in [`searchPlaces.ts`](../src/features/search/searchPlaces.ts):
a `search(query, signal)` that returns `PlaceResult`s, plus a name and the
credit to show. Write one beside `searchOneMap`, and make
`AS_YOU_TYPE_SERVICE` return it. For an ArcGIS locator the request is
`…/GeocodeServer/findAddressCandidates?SingleLine=<query>&outSR=4326&maxLocations=6&f=json`,
and each of the response's `candidates` has an `address` and a
`location.x` / `location.y` in degrees. Keep the parsing in its own
function so it can be unit-tested against a saved response, as
`parseOneMapResults` is.

Coordinate search (degrees and SVY21) needs no server at all.

## Proxying a server through the app

Route B and C both need CORS on the server. When you can't change the
server, have the app's nginx forward to it, so the browser sees one
origin. In [`docker/nginx.conf`](../docker/nginx.conf), inside the
`server` block:

```nginx
location /lan/geoserver/ {
  proxy_pass http://10.0.0.20:8080/geoserver/;
}
```

then rebuild the image, and use the app's own address in Add data or in
your lists: `http://gis-viewer.agency.lan:8080/lan/geoserver/wms`, or just
`lan/geoserver/wms` in a list, relative to the page. The trailing slashes
on both lines matter: they map `/lan/geoserver/x` to `/geoserver/x`. This
also fixes mixed content, since everything then comes from the app's
origin.

The Nominatim proxy works the same way, but is written at container start
from `NOMINATIM_URL` rather than baked in.

## Checking that nothing reaches the internet

1. Run the app as it will be deployed: in Docker, `APP_OFFLINE=true`.
2. Open it and use it: switch basemaps, add data, search, draw.
3. In the browser console, list every host the page has fetched from:

   ```js
   [...new Set(performance.getEntriesByType('resource').map((e) => new URL(e.name).host))];
   ```

   It should print only the app's own address and your network servers.

A tested image run with `APP_OFFLINE=true` and only a data folder fetches
from nothing but itself.
