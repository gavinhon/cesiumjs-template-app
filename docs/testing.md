# Testing

Two layers, because the app has two kinds of code:

- **Logic** — geometry, parsers, the `public/` scan, the terrain encoder —
  is plain functions of their inputs. It's covered by **automated tests**
  that run in a second or two and are part of `npm run check`.
- **Interaction** — clicking the globe, dragging vertices, camera moves,
  what a WebGL canvas actually shows — needs a real browser and a GPU.
  It's covered by the **manual test cases** at the end of this page, run
  before a release or after touching the code they name.

## Running the tests

```bash
npm test                     # every TypeScript test, once (also part of npm run check)
npm run test:watch           # re-run on save while you work
npm run test:terrain-script  # the Python terrain converter's tests
```

The Python tests need the same packages as the script itself
(`pip install rasterio numpy scipy pyproj pydelatin`). They're kept out of
`npm run check` so the template works for people who never touch terrain.

### Before every commit

`npm run check` is the gate the GitHub Pages deploy runs before building
(see `.github/workflows/deploy-pages.yml`), so a commit that fails it is a
commit that won't deploy — even if `npm run dev` looks fine, because the dev
server and `npm run build` never check formatting.

A pre-commit hook enforces this. `npm install` switches it on (the `prepare`
script runs `scripts/installGitHooks.mjs`, which sets git's `core.hooksPath`
to `.githooks/`), and from then on each `git commit` first runs:

- **Prettier on the staged files** — just those, so someone else's
  unfinished, unstaged files can't block your commit;
- **typecheck, lint and the unit tests** on the whole project.

If formatting fails, run `npm run format`, `git add` the files again and
retry. `git commit --no-verify` skips the hook for one commit, but the
deploy will still run the same checks.

## What the automated tests cover

| Test file                                               | Covers                                                                                                                                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/drawing/measurement.test.ts`              | Distance formatting, 3D vs ground distance, the measure and height readouts, the height triangle's corner                                                                                      |
| `src/features/drawing/lineOfSight.test.ts`              | Clear and blocked sight lines over drawn terrain profiles, the noise tolerance, the target's own ground not counting as a blocker                                                              |
| `src/features/drawing/viewshed.test.ts`                 | Ray visibility behind walls and past the horizon, area weighting, the rim's radius on the WGS84 ellipsoid, the readout                                                                         |
| `src/features/drawing/drawnFeaturePresentation.test.ts` | Colour per feature family, label text for every label source, label anchors, selected/hidden styling, depth-fail materials, geometry rewrites while dragging                                   |
| `src/features/map-services/capabilitiesParsing.test.ts` | WMS 1.1.1/1.3.0 and WFS 1.0/2.0 capabilities parsing, bounding boxes (including missing edges), HTTP and XML errors                                                                            |
| `src/features/map-services/layerRequests.test.ts`       | WFS GetFeature parameter names per version; the WMS, WMTS and XYZ imagery providers built from a config                                                                                        |
| `src/features/models-3d/placeTilesetOnTerrain.test.ts`  | Reading a tileset's base and footprint from region, box (through its transform) and sphere bounds; the underground rule and the `extras.placement` hint; the vertical shift                    |
| `vite-plugins/publicDatasetCatalog.test.ts`             | Recognising 3D Tiles, terrain, XYZ/TMS pyramids and GeoJSON in `public/`; skipping what isn't a dataset; base-path URLs; sort order                                                            |
| `scripts/test_build_terrain_tiles.py`                   | Decodes a generated tile exactly as Cesium does and checks every field: quantized ranges, index encoding, winding, coverage, edges, normals, and that the mesh stays within its promised error |

Each of these has already caught a real bug: a distance just under 1 km
printing as "1000.0 m", a capabilities extent with a missing edge read as
the equator, a zero-padded folder name crashing the dev server, the
viewshed drawn 0.6% too small on a spherical earth, and the terrain mesh
fitted to the north–south mirror of each tile.

## Writing a test

- **Put it next to the module**, named after it: `measurement.ts` →
  `measurement.test.ts`. A test covering a group of modules is named for
  the group, like any other file (`capabilitiesParsing.test.ts`).
- **Tests run in Node.** Cesium's maths, entities and imagery providers
  all work there without a browser. A test that needs DOM APIs opts in
  with `// @vitest-environment happy-dom` on its first line.
- **Separate the logic from the I/O to test it.** `parseWmsLayers` is split
  from `fetchWmsLayers` and `traceVisibility` from `computeViewshed` for
  exactly this reason: the parser and the maths are tested directly, with
  no network and no canvas.
- **Mock at the edge, not in the middle.** `lineOfSight.test.ts` replaces
  one function — Cesium's terrain sampler — so each test can draw the
  ground profile it needs, and everything else runs for real.
- **Test what the user would notice.** "A hill blocks the view, at the
  hill" is worth a test; "this function calls that one" isn't.

## Manual test cases

Run these with `npm run dev`. Each line is one check: do the action, expect
the result. Unless a case says otherwise, start from a fresh page load with
the Singapore terrain in `public/`.

### Startup and layout

| #   | Do                                           | Expect                                                                                         |
| --- | -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| S1  | Load the page                                | OpenStreetMap globe over Singapore; terrain loads without moving the camera; no console errors |
| S2  | Tilt the camera near Bukit Timah             | Relief is visible and hillshaded (lit from the north-west)                                     |
| S3  | Shrink the window to about 400 px tall       | The right rail wraps into a second column; no button is off-screen                             |
| S4  | With the rail wrapped, open the Layers panel | The panel sits 16 px clear of both rail columns                                                |

### Navigation, status bar, search and links

| #   | Do                                                                        | Expect                                                                                       |
| --- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| N1  | Move the mouse over Bukit Timah                                           | Status bar shows its coordinate and a ground height of a few tens of metres                  |
| N2  | Click WGS84 in the status bar                                             | Switches to SVY21 (E … N …); clicking the coordinate copies it                               |
| N3  | Zoom in and out with the mouse                                            | The scale bar keeps a round length (1, 2 or 5 × 10ⁿ) and the camera altitude follows         |
| N4  | Tilt and rotate the view, then press the compass                          | Turns back to north about the centre of the screen, keeping the tilt                         |
| N5  | Search `E 31059.5 N 29543.4` and press Enter                              | Flies to Marina Bay Sands and drops a white pin                                              |
| N6  | Search `rail`                                                             | Rail lines and Rail stations under Datasets; OneMap places below; Search worldwide last      |
| N7  | Choose Search worldwide for `eiffel tower`                                | OpenStreetMap results, credited in the heading; choosing one flies to Paris                  |
| N8  | Add a dataset, move the camera, copy the share link, open it in a new tab | Same view, basemap and layers; the camera doesn't fly off to the layer                       |
| N9  | Open the Layers panel with Population density added                       | Its classes (Highest … Lowest) appear under the row; a vector layer shows Points/Lines/Areas |

### Layers, Add data, tools and profile

| #   | Do                                                            | Expect                                                                                         |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| T1  | Toolbar → Layers, then its Add data button                    | Add data opens right beside Layers; adding from the catalogue lists it in Layers next to it    |
| T1b | Close Layers with Add data still open                         | Add data slides back to the left edge; reopening Layers pushes it aside again                  |
| T2  | Add data → type `rail` in the filter                          | Only the rail layers remain, under "Features — points, lines and areas"                        |
| T3  | Add data → 3D service → choose I3S                            | The URL field asks for a scene layer and the button reads "Add scene layer"                    |
| T4  | Right rail → Measure and analyse                              | A menu of four named tools with hints; picking one arms it and its icon lights the menu button |
| T5  | Bottom-left basemap tile → pick OpenStreetMap (grey)          | The map switches; the tile shows the grey thumbnail; it hides while a left panel is open       |
| T6  | Draw a line across Bukit Timah, finish, select it in Drawings | "Ground profile" shows the hill (~150 m peak); hovering moves a marker along the line          |
| T7  | Layers → Terrain → None, then reselect the line               | The profile says to choose a terrain instead of drawing a flat line                            |

### Phone layout

Use the browser's device emulation (a phone preset, which also makes the
pointer coarse) or a real phone on the same network (`npm run dev -- --host`).

| #   | Do                                                                 | Expect                                                                                   |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| M1  | Load the page at 375 × 812                                         | Search and a Menu button top-left, the rail top-right; every control 44 px tall          |
| M2  | Tap Menu, then Layers                                              | The menu closes; the panel rises as a half-height sheet with a grab handle and a ×       |
| M3  | Tap the sheet's ×                                                  | The sheet slides down; the map does not scroll or jump                                   |
| M4  | Open Layers, then tap Add data in it                               | Layers closes; Add data takes the sheet                                                  |
| M5  | Arm the line tool and tap two points                               | The hint shows Undo and Finish instead of key hints; Finish keeps the line               |
| M6  | Add Rail stations and tap a station                                | Its attribute card docks to the bottom, full width, instead of floating over the station |
| M6b | Drag a sheet's grab bar down, then tap it twice                    | It snaps to peek; taps step it to half, then full                                        |
| M7  | Widen the window past 640 px with a mouse                          | Side panels and the full toolbar return; controls go back to 34 px                       |
| M7b | Turn the phone on its side (812 × 375), open Layers, then Add data | Layers closes: one side panel at a time on a short screen                                |

### Drawing

| #   | Do                                                             | Expect                                                                              |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| D1  | Arm Point; click the map                                       | An orange point with its elevation, labelled "(WGS84)"                              |
| D2  | Arm Line; click three times; double-click                      | The line finishes with exactly three vertices; the camera doesn't dive              |
| D3  | Arm Polygon; click twice                                       | An edge is visible after the first click and fills from the third                   |
| D4  | Mid-line, press Backspace                                      | The last vertex is removed                                                          |
| D5  | Mid-line, press Enter                                          | The line finishes without adding a vertex                                           |
| D6  | Mid-line, press Escape; then Escape again                      | First press discards the line; second exits the tool (crosshair and hint disappear) |
| D7  | Mid-line with two vertices, click another tool                 | The line is kept, not discarded                                                     |
| D8  | With no tool armed, click a finished line                      | It's selected, the Drawings panel opens, and white vertex handles appear            |
| D9  | Drag a vertex handle; release                                  | The shape follows; the globe doesn't spin or glide on release                       |
| D10 | Rename a drawing, add an attribute, label it by that attribute | The map label reads "key: value"                                                    |
| D11 | Hide a drawing in the panel                                    | It and its label disappear                                                          |
| D12 | Click the discard button                                       | Every drawing is removed, including one in progress                                 |

### Measurement and analysis

| #   | Do                                                                  | Expect                                                                                          |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| M1  | Measure along a flat street                                         | One number, e.g. "30.1 m"                                                                       |
| M2  | Load a 3D Tiles city; measure from a roof to the street             | Two numbers: the 3D length and "… m horizontal"; the line shows faintly through walls           |
| M3  | Height tool: click a roof, then the street                          | "… m down · … m horizontal" and a right triangle; label on the higher end                       |
| M4  | Line of sight across Bukit Timah                                    | "Blocked at … of …"; cyan up to the hill, red beyond it                                         |
| M5  | Line of sight across flat ground                                    | "Visible · …", all cyan                                                                         |
| M6  | Viewshed on a hilltop, radius about 1 km                            | Cyan where visible, dark where hidden, inside a ring; "N% visible · … radius" in about a second |
| M7  | Drag a line-of-sight or viewshed vertex                             | Shows "Analysing…", then the new result                                                         |
| M8  | Start a measurement; switch to 2D; keep clicking; switch back to 3D | The measurement keeps working in both modes                                                     |

### Layers and data

| #   | Do                                                                                   | Expect                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | Add data → Catalogue → add a 3D model from public/                                   | It loads, the camera flies to it, and the button reads "Added"                                                                                                               |
| L2  | Add data → Map service → WMS → `https://ahocevar.com/geoserver/wms` → Look up layers | A picklist of layers; choosing one fills the display name                                                                                                                    |
| L3  | Add that WMS layer                                                                   | It draws over the base map and the camera flies to its extent                                                                                                                |
| L4  | Layers panel → move the WMS layer down below the basemap                             | It disappears under the base map; moving it up brings it back                                                                                                                |
| L5  | Layers panel → Terrain → None                                                        | Terrain flattens and the hillshade turns off; choosing the DTM again restores both                                                                                           |
| L6  | Switch to 2D                                                                         | The map stays over the same place and is as bright as in 3D                                                                                                                  |
| L7  | Drop a new `.geojson` into `public/` while the dev server runs                       | The page reloads and the file is offered in the Add data catalogue                                                                                                           |
| L8  | Add the BIM model from the public/ list                                              | Its row reads "On terrain · Raised … m"; zoomed in, its ground floor meets the street                                                                                        |
| L9  | With a model on terrain, set Terrain to None, then back                              | The row's offset changes with each switch and the model follows the surface                                                                                                  |
| L10 | Layers panel → untick "On terrain" on a model                                        | It returns to its authored height; the row reads "Authored height"                                                                                                           |
| L11 | Layers panel → Basemap → grey, then satellite, then back                             | Each map replaces the last; the credit line at bottom left changes to match                                                                                                  |
| L12 | Add an XYZ layer, then change the basemap                                            | The added layer stays on top of the new basemap                                                                                                                              |
| L13 | Add data → each ArcGIS example in the catalogue → Add                                | Each one draws over Singapore; the camera flies to each                                                                                                                      |
| L14 | Type an ArcGIS FeatureServer URL with type "ArcGIS MapServer" → Add                  | An error asking for a URL ending in /MapServer; nothing is added                                                                                                             |
| L15 | Type "ArcGIS FeatureServer / layer" + a FeatureServer URL → Look up                  | A picklist of the service's layers                                                                                                                                           |
| L16 | Layers panel → Basemap → Esri World Imagery, then Esri Dark Gray Canvas              | Each draws, with "Powered by Esri" and its sources in the credit line                                                                                                        |
| L17 | 3D Tiles → each I3S example in the list → Add                                        | Each loads lit (not black, at any hour), the camera flies to it, its row reads "I3S · Georeferenced (I3S)"                                                                   |
| L18 | 3D Tiles → paste any `…/SceneServer/layers/0` URL                                    | Format switches to I3S by itself                                                                                                                                             |
| L19 | Add an I3S URL for a service that doesn't exist                                      | "The server answered: …" under the form; the app keeps running                                                                                                               |
| L20 | 3D Tiles → Re:Earth Buildings in the examples list → Add                             | Buildings appear across Singapore with grey (not black) shaded walls; the camera doesn't move; the row reads "Too large to move"; its credit shows bottom left until removed |
| L21 | Add an ArcGIS point or line example, then click one of its features                  | It's highlighted and a card shows its name and attributes; `OBJECTID` / `Shape__…` fields aren't listed                                                                      |
| L22 | With the card open, click empty map; then reopen it and press Escape                 | The card closes each time                                                                                                                                                    |
| L23 | With the card open, arm a drawing tool or hide the feature's layer                   | The card closes; with a tool armed, clicking a feature draws instead of opening a card                                                                                       |
| L24 | With a data panel open, add anything from it                                         | The Layers panel opens beside it, with the new layer listed; the data panel stays open                                                                                       |
| L25 | Layers panel → drag a layer's opacity, then × to remove it                           | The layer fades, then leaves the map; its quick-add button reads "Add" again                                                                                                 |
