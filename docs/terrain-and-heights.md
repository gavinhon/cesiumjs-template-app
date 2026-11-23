# Terrain and heights

How every kind of data the app shows meets the terrain: where its heights
come from, how it's placed on the ground, what you can change, and what
happens when the terrain changes or there is none. If you add a new kind
of data, find its row here first. If it has none, add one in the same
change.

## The rules everything follows

- **One vertical reference: the WGS84 ellipsoid.** Cesium measures every
  height from it. Most source data doesn't. National DTMs and I3S scenes
  use mean sea level, which around Singapore is about 8 m above the
  ellipsoid. Anything left in sea-level heights sits 8 m low. Each row
  below says where that conversion happens.
- **The terrain hides what's under it.** `CesiumMap.tsx` sets
  `globe.depthTestAgainstTerrain`, which Cesium leaves off by default.
  With it off, models are drawn on top of the terrain wherever they are,
  so a building's buried storeys show through the hillside and slide
  across it as the camera tilts. The exceptions are deliberate: markers
  set `disableDepthTestDistance`, and 3D lines draw the stretch behind the
  ground faintly (`depthFailMaterial`).
- **Clicks land on what's drawn.** `pickSurface` returns the terrain, or
  the roof of a 3D model where one is in the way, and that includes
  draped models. Drawings, measurements and the status bar's Elev readout
  all go through it.
- **"None" means the ellipsoid.** Choosing no terrain swaps in
  `EllipsoidTerrainProvider`, which is height 0 everywhere. Everything
  that follows the ground then follows height 0.

## The terrain itself

| Terrain                                                                 | Heights                                                                                                         | Notes                                                                                                                                                             |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A quantized-mesh folder under `public/terrain/` (e.g. the GEM 15 m DTM) | Ellipsoidal. `scripts/build_terrain_tiles.py` converts sea-level DTMs through EGM2008 when it builds the tiles. | The first one found loads at startup. It's a single slot (`useTerrain`), and switching it fires `scene.terrainProviderChanged`, which the 3D model rows react to. |
| None                                                                    | 0 everywhere (the ellipsoid)                                                                                    | The terrain row's eye switches to this and back.                                                                                                                  |

## Map layers

| Data                                                            | Heights it carries                   | How it meets the terrain                                                                                                                                                                                                                        | Default | You can           | Terrain changed or none                |
| --------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------- | -------------------------------------- |
| Basemaps and imagery layers (WMS, WMTS, XYZ, ArcGIS MapServer)  | None: they're pictures               | Cesium drapes them onto the terrain surface as textures.                                                                                                                                                                                        | Draped  | Nothing to change | They follow the surface automatically. |
| Vector lines and polygons (WFS, ArcGIS feature layers, GeoJSON) | Any z values in the data are ignored | `clampToGround`: drawn as ground primitives, draped over the terrain _and_ 3D models.                                                                                                                                                           | Draped  | Nothing to change | They follow the surface automatically. |
| Vector points (same sources)                                    | Ignored                              | `CLAMP_TO_GROUND` onto the terrain. It doesn't reach 3D models: Cesium clamps to a tileset only when its `enableCollision` is on, and the app leaves that off. Drawn without depth testing within 50 km, so a hill doesn't cut a point in half. | Clamped | Nothing to change | They follow the surface automatically. |

## 3D models

Every model has an **On terrain** switch on its row in the layer list (the
row's "…"). What the switch does depends on the model, as the rows below
say. The note beside it explains an automatic choice: "Raised 12.9 m",
"Underground, hidden by terrain", "Ground-relative layer" and so on.

| Data                                                                                                        | Heights it carries                                                                                                                                              | How it meets the terrain                                                                                                                                                                                                                             | Default                               | Switch off                              | Terrain changed or none                                                                                       |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **3D Tiles, a building or site** (a BIM export, the 1965 tilesets: bounds smaller than a city)              | As authored, usually flat ground at height 0                                                                                                                    | **Moved as one piece** (`placeTilesetOnTerrain.ts`). `tileset.modelMatrix` shifts the model so the lowest point of its `tileset.json` bounding volume meets the ground sampled under its footprint. A tileset with padded bounds lands that far off. | On: "Raised / Lowered … m"            | Back to its authored height             | Re-seated on the new terrain; with none, its base goes to height 0.                                           |
| **3D Tiles lying entirely below the surface** (tunnels, utilities)                                          | As authored                                                                                                                                                     | Left at its authored depth, and so hidden by the terrain.                                                                                                                                                                                            | Off: "Underground, hidden by terrain" | (Switch on: lifted to the ground)       | Stays put.                                                                                                    |
| **3D Tiles too large to move, or without usable bounds** (Re:Earth Buildings, any worldwide tileset)        | As authored. Re:Earth already stands on EGM2008-converted ground, so it matches this terrain.                                                                   | Left as authored. Switching it on **drapes** it: each vertex is lifted by the ground beneath it (see [Draping](#draping)).                                                                                                                           | Off: "Too large to move"              | Authored heights                        | When draped, re-draped on the new terrain. With none, not draped.                                             |
| **3D Tiles that say how they stand**                                                                        | As authored                                                                                                                                                     | `"extras": { "placement": "on-terrain" \| "draped" \| "as-authored" }` at the top of `tileset.json` overrides everything above.                                                                                                                      | As declared: "Set in tileset.json"    | Either way                              | As for the placement chosen.                                                                                  |
| **I3S with absolute heights** (`heightModelInfo` is sea level; the building shells, Commonwealth Towers)    | Sea level. Cesium converts I3S layers to ellipsoidal heights through Esri's EGM2008 service (`loadI3sSceneLayer`), but only regional ones (see the note below). | Left at its georeferenced heights. Never moved as one piece: its declared bounds are padded by hundreds of metres. Switching it on drapes it.                                                                                                        | Off: "Georeferenced (I3S)"            | Georeferenced heights                   | When draped, re-draped. Offline, or for a worldwide layer, there's no conversion, so the layer sits ~8 m low. |
| **I3S that's ground-relative** (`elevationInfo.mode` is `relativeToGround`: Esri's OpenStreetMap buildings) | Metres above the ground. ArcGIS adds the ground when it draws; Cesium ignores the setting. Worldwide, so not converted.                                         | **Draped**: the ground height added as it is, since there's no geoid to take back off.                                                                                                                                                               | On: "Ground-relative layer"           | Stands on sea level, buried in any hill | Re-draped. With none, left as is: base on the ellipsoid, height 0.                                            |
| **I3S built on flat ground that doesn't say so** (HDB LoD2: absolute heights, every base at sea level)      | Sea level, at 0                                                                                                                                                 | **Draped**, because the catalogue entry says `placement: 'draped'`.                                                                                                                                                                                  | On: "Each building on the ground"     | Sunk into every hill                    | Re-draped. With none, left as is: it stands on the geoid, about 8 m up.                                       |

A URL you connect yourself gets the default its format and metadata give.
Only catalogue entries can preset `placement`. Shared links don't carry the
switch either: a layer reopened from a link comes back at its default.

### Draping

Cesium can't clamp a mesh to terrain. In tilesets, only points and lines
take a `heightReference`. And a whole city layer can't be moved by one
amount when the ground under it varies by 160 m. So draping happens in a
vertex shader (`terrainDrape.ts`):

1. **The terrain is read once into a heightmap** (`src/cesium/terrainHeightmap.ts`).
   Its tiles at the deepest level with at most 1,200 of them (level 13 for
   the GEM DTM, a texel every ~38 m, about 3 MB of tiles) are rasterised
   into a texture, once per terrain and area. It reads Cesium's private
   decoded tile arrays. They're checked for first, and if they're missing
   nothing is draped.
2. **Each vertex is lifted** by the bilinear ground height beneath it,
   minus the layer's own zero: the geoid for an I3S scene Cesium
   converted from sea level, and the ellipsoid for everything else.

**Which I3S scenes Cesium converts.** Given a geoid service, Cesium
converts every layer, whatever its `heightModelInfo` says, but first it
fetches the geoid tiles covering the scene's whole extent at the
service's deepest level. For a worldwide layer like Esri's OSM buildings
that's thousands of Web Mercator tiles reaching the poles. The fetch
fails, Cesium logs "no geoid conversion will be performed", and the scene
loads unconverted. `wasGeoidConverted` (`loadI3sSceneLayer.ts`) reads
what actually happened from Cesium's private `_geoidDataList`, so the
drape subtracts the geoid only when it was added. Assuming it always was
sank every draped OSM building about 8 m, hiding most of the low ones.

Consequences to know about:

- A roof follows the slope under its own building, by however much the
  ground changes across the footprint: a metre or two for a block on a
  hillside. ArcGIS drapes ground-relative layers the same way.
- Cesium decides which tiles to draw from their original bounds, which
  the shader doesn't move. A tile lifted far above them can blink out at
  the edge of the screen. Across Singapore lifts are tens of metres
  against tiles hundreds of metres across, so it's rare.
- Picking, measuring and line of sight all see the draped buildings,
  because Cesium's pick passes use the same shader.
- Outside the heightmap (beyond the terrain's coverage) vertices are left
  where they are.

## Drawings, measurements and analysis

| Data                                                   | Heights it carries                                              | How it meets the terrain                                                                                                                                                                                 | Terrain changed or none                                                                                                       |
| ------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Points and labels                                      | The 3D position clicked (`pickSurface`): the terrain, or a roof | Stored as absolute positions, drawn where they were placed. Markers ignore depth, so they never disappear into the ground.                                                                               | They **stay at the stored height**, so they can float above or sink below a different terrain. Redraw them, or drag a vertex. |
| Lines, distance and height measurements                | Clicked 3D positions                                            | Straight 3D segments between the vertices, not draped, which is what makes a roof-to-street measurement true. Where a segment passes behind or under the ground, it draws faintly (`depthFailMaterial`). | Stay at the stored heights.                                                                                                   |
| Polygons                                               | Clicked positions, used only for their outline                  | Fill and outline are **draped** over the surface as it's drawn now, terrain and models both. A polyline at the stored heights floated off its own fill when seen at an angle.                            | They follow the new surface automatically.                                                                                    |
| Line of sight                                          | From exactly the point placed, to the target                    | Cast as a ray through what's drawn: terrain, 3D Tiles and I3S, draped buildings included (`firstHitAlongRay` in `lineOfSight.ts`). It's blocked at the first thing it meets.                             | The result isn't recomputed. Drag a vertex to rerun it.                                                                       |
| Ground profile (selected line or distance measurement) | 128 samples along the geodesic                                  | **Terrain only** (`sampleTerrainMostDetailed`). It shows the ground, not the roofs the line was clicked on.                                                                                              | Re-sampled when the terrain changes. With no terrain it says so instead of drawing a flat line.                               |

## Markers and readouts

| Data                                                | How it meets the terrain                                                          |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| Place marker (your location, a search result)       | `CLAMP_TO_GROUND` onto the terrain, always drawn on top (`createPlaceMarker`).    |
| Status bar **Elev**                                 | `pickSurface` under the cursor: the terrain, or the roof of the model in the way. |
| Cursor ghost, vertex handles, ground-profile marker | Placed at `pickSurface` positions and drawn on top, never hidden by terrain.      |
