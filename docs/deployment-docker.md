# Deploying with Docker (air-gapped)

How to run the app on a machine with no internet access, in Docker Desktop
on Windows, with its datasets kept in an ordinary folder on the host
(`C:\gis\data`, say) rather than baked into the image.

You build the images once, on a machine with internet access, and carry
them across as files. On the air-gapped machine nothing is downloaded,
ever: the app's fonts, Cesium's assets and a fallback basemap ship inside
the image, and everything that would need the internet is switched off by
one setting.

| File                                                                | What it is                                                                             |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [`Dockerfile`](../Dockerfile)                                       | The app: built with Node, served by nginx                                              |
| [`Dockerfile.terrain`](../Dockerfile.terrain)                       | `build_terrain_tiles.py` with Python, its packages and the EGM2008 geoid grid baked in |
| [`docker-compose.yml`](../docker-compose.yml)                       | Runs both, mounting your folders. Settings come from `.env`                            |
| [`.env.example`](../.env.example)                                   | Every setting, explained. Copy it to `.env`                                            |
| [`docker/`](../docker)                                              | nginx config and the container's start script                                          |
| [`scripts/writeRuntimeConfig.ts`](../scripts/writeRuntimeConfig.ts) | Runs at container start: scans the data folder, writes the app's settings              |

## 1. Build the images (connected machine)

Any machine with Docker and internet access — it needn't be Windows. From
the repo root:

```powershell
docker compose build app
docker compose --profile tools build terrain
```

`docker compose` reads `.env` even to build, and `DATA_DIR` is required,
so copy `.env.example` to `.env` first (its example path doesn't need to
exist on this machine).

Then save them to files:

```powershell
docker save -o cesiumjs-template-app.tar cesiumjs-template-app:latest
```

```powershell
docker save -o cesiumjs-terrain.tar cesiumjs-terrain:latest
```

The app image is about 270 MB (70 MB compressed); the terrain image about
850 MB, mostly scientific Python and the 80 MB geoid grid. If you'll use
the optional geocoder (section 6), save it too:

```powershell
docker pull mediagis/nominatim:5.1
```

```powershell
docker save -o nominatim.tar mediagis/nominatim:5.1
```

Carry across the `.tar` files plus `docker-compose.yml` and `.env.example`
— that's all the air-gapped machine needs from the repo.

Build for the air-gapped machine's CPU: images built on an Apple Silicon
Mac are ARM and won't run on an x86 Windows PC. Add
`--platform linux/amd64` to `docker compose build` (or set
`DOCKER_DEFAULT_PLATFORM=linux/amd64`) when the two differ.

## 2. Install on the air-gapped machine

Docker Desktop for Windows needs the **WSL 2 backend** (Settings → General
→ "Use the WSL 2 based engine"; the default on current versions). Install
Docker Desktop and WSL from offline installers — `wsl --install` downloads
from the internet. The images are Linux images, so Docker Desktop must be
in Linux-containers mode (the default).

Load the images:

```powershell
docker load -i cesiumjs-template-app.tar
```

```powershell
docker load -i cesiumjs-terrain.tar
```

## 3. Lay out the data folder

The data folder is laid out exactly like `public/` in development; the
same scan reads it. For example:

```
C:\gis\data\
  terrain\singapore-gem15-dtm\layer.json   + {z}\{x}\{y}.terrain
  tilesets\city-model\tileset.json         + its tiles
  basemaps\singapore-ortho\{z}\{x}\{y}.png  ← a basemap (see below)
  imagery\flood-extent\{z}\{x}\{y}.png      ← an overlay layer
  vector\parks.geojson
```

| Found                                | Becomes                                                       |
| ------------------------------------ | ------------------------------------------------------------- |
| a folder with `tileset.json`         | a 3D model in Add data                                        |
| a folder with a terrain `layer.json` | a terrain choice; the first one loads at startup              |
| a `{z}/{x}/{y}` image pyramid        | an XYZ layer in Add data — or a basemap, if under `basemaps/` |
| a `.geojson` file                    | a vector layer in Add data                                    |

**Basemaps.** Every built-in basemap is someone else's server, so offline
the app offers only the pyramids in `basemaps/` — the first is the
default — plus Natural Earth II, a coarse world image that ships with
Cesium, so the globe is never blank. Make a pyramid from imagery you're
licensed to copy: `gdal2tiles.py --xyz -z 0-18 ortho.tif basemaps/ortho`,
or QGIS's _Generate XYZ tiles (Directory)_. Start at zoom 0, because
Cesium loads the top levels first and shows nothing until they arrive.
Don't scrape tiles from OpenStreetMap's or Esri's servers to build one;
their terms forbid bulk downloading.

Copy the data across however suits you; the folder never goes into an
image.

## 4. Configure and run

Next to `docker-compose.yml`, copy `.env.example` to `.env` and set at
least:

```ini
DATA_DIR=C:/gis/data
HTTP_PORT=8080
APP_OFFLINE=true
```

**Windows paths:** write them with forward slashes, `C:/gis/data`.
Backslashes work unquoted but are escape characters inside double quotes.
The drive must be shared with Docker (with the WSL 2 backend, all drives
are by default). A folder inside the WSL filesystem
(`\\wsl$\Ubuntu\home\…`) reads faster than one on `C:`, but `C:` is fine
for this — the app reads one directory listing per dataset at startup and
then individual tiles.

Then:

```powershell
docker compose up -d app
```

and open <http://localhost:8080>. Other machines on the network can use
`http://<this-pc>:8080` if Windows Firewall allows the port.

The startup log says what it found:

```powershell
docker compose logs app
```

```
Datasets in /data: 1 xyz, 2 terrain, 3 3d-tiles. Offline mode: on.
```

The data is mounted **read-only**, and the container's own filesystem is
read-only too: nothing in it can change your data.

### What offline mode turns off

`APP_OFFLINE=true` is the one setting. It's read in one place for each
internet dependency (`APP_CONFIG.offline`, from
[`src/lib/appConfig.ts`](../src/lib/appConfig.ts)):

| Needs the internet                       | Offline                                               |
| ---------------------------------------- | ----------------------------------------------------- |
| Esri, OpenStreetMap, Sentinel-2 basemaps | Replaced by `basemaps/` pyramids and Natural Earth    |
| Place search (OneMap, Nominatim)         | Hidden, unless you run your own Nominatim (section 6) |
| Example services in Add data             | Hidden; your datasets are listed instead              |
| Esri's EGM2008 service for I3S heights   | Not asked; I3S scenes load ~8 m low around Singapore  |
| Google Fonts                             | Never used: the fonts are bundled, online or not      |

Coordinate search (degrees and SVY21), drawing, measuring, analysis, the
elevation profile and shared links all work offline. You can still connect
services by URL in Add data — say, a WMS on your own network — as long as
it sends CORS headers.

### Updating datasets without rebuilding

Add, replace or remove folders under `DATA_DIR`, then

```powershell
docker compose restart app
```

The catalogue is rebuilt from the folder on every start; reload the page
to see it. Replacing a tileset's files in place shows up on reload even
without a restart — the app checks for changes on each request — but a new
or removed dataset needs the rescan.

To upgrade the app itself, build and `docker save` a new image, `docker
load` it, and `docker compose up -d app` again. The data folder is
untouched.

## 5. Making terrain offline

`scripts/build_terrain_tiles.py` turns an elevation GeoTIFF into terrain.
Its default `--vertical-datum egm2008` converts heights from mean sea
level to the ellipsoid Cesium uses, which needs PROJ's EGM2008 grid —
normally downloaded on first use. The terrain image has it built in and
networking off (`PROJ_NETWORK=OFF`).

Put source GeoTIFFs in a folder, set it in `.env`:

```ini
TERRAIN_INPUT_DIR=C:/gis/terrain-sources
```

and run (one line in PowerShell; the paths are inside the container —
`/input` is `TERRAIN_INPUT_DIR`, `/output` is `DATA_DIR`):

```powershell
docker compose run --rm terrain /input/dtm.tif /output/terrain/my-dtm --name "My DTM" --attribution "Elevation: whoever made it"
```

then `docker compose restart app`. The output goes straight into the data
folder; that's the one mount the tool can write to.

### Without Docker

To run the script directly on an offline machine, fetch everything on a
connected one with the **same OS and Python version**:

```powershell
pip download -d wheels rasterio numpy scipy pyproj pydelatin
```

```powershell
pip install pyproj; pyproj sync --file us_nga_egm08_25 --target-directory grids
```

Carry `wheels\`, `grids\us_nga_egm08_25.tif` and the script across, then:

```powershell
pip install --no-index --find-links wheels rasterio numpy scipy pyproj pydelatin
```

Copy the grid into the folder this prints (on Windows, usually
`%LOCALAPPDATA%\proj`):

```powershell
python -c "import pyproj; print(pyproj.datadir.get_user_data_dir(True))"
```

and set `PROJ_NETWORK=OFF` so a missing grid fails at once:

```powershell
$env:PROJ_NETWORK = 'OFF'; python build_terrain_tiles.py dtm.tif C:\gis\data\terrain\my-dtm --name "My DTM"
```

Without the grid the script stops with an error. It checks for PROJ's
fallback ("ballpark") transformation, which would otherwise treat the
geoid as the ellipsoid and quietly write terrain 8 m too low.

## 6. Place search with your own Nominatim

Offline, place search is hidden: OneMap and OpenStreetMap's Nominatim are
both on the internet. Run your own [Nominatim](https://nominatim.org)
server and the search box uses it instead, searching as you type (the
public server's usage policy forbids that; your own server doesn't).

Set its address **as the app container reaches it**:

```ini
NOMINATIM_URL=http://nominatim:8080
```

The app's nginx proxies it at `/nominatim/`, so browsers only ever talk to
the app — no CORS setup, and they don't need a route to the Nominatim
host. Any Nominatim 4 or later works:

- **Another machine:** `NOMINATIM_URL=http://10.0.0.5:8080`, or with a
  path, `http://gis-server/nominatim`.
- **This PC, outside Docker:** `http://host.docker.internal:8080`.
- **The compose `geocoder` profile:** a `mediagis/nominatim` container
  beside the app. Download an OpenStreetMap extract on a connected machine
  (Geofabrik's `malaysia-singapore-brunei-latest.osm.pbf`, about 200 MB),
  put it in a folder, and set:

  ```ini
  NOMINATIM_EXTRACT_DIR=C:/gis/osm
  NOMINATIM_PBF=malaysia-singapore-brunei-latest.osm.pbf
  NOMINATIM_URL=http://nominatim:8080
  ```

  ```powershell
  docker compose --profile geocoder up -d
  ```

  The first start imports the extract into PostgreSQL. That takes tens of
  minutes for Singapore, and the result is kept in the `nominatim-db`
  volume. Until the import finishes, searches return an error and the app
  keeps working. The service settings follow the image's README for the
  pinned tag; check it if you change the tag.

`docker compose restart app` after changing `NOMINATIM_URL`. Results are
credited to OpenStreetMap contributors, as the ODbL requires.

## How it works

The app is a static site, so in development everything it knows is baked
in at build time — including the list of datasets, scanned from `public/`
by a Vite plugin, because a browser can't list a folder on a web server.
An image built once and run against folders it has never seen can't work
that way. So the image defers two things to container start:

```
container start
  docker-entrypoint.sh
    └─ node scripts/writeRuntimeConfig.ts      same scan as the Vite plugin,
         ├─ /run/app/datasets.json             over the mounted /data
         ├─ /run/app/app-config.json           offline, catalogue URL, basemap, geocoder
         └─ /run/app/nginx-nominatim.conf      only with NOMINATIM_URL
  nginx
    /                  → the built app
    /data/             → the mounted folder (read-only)
    /app-config.json   → /run/app/app-config.json
    /datasets.json     → /run/app/datasets.json
    /nominatim/        → NOMINATIM_URL (if set)

browser
  src/lib/appConfig.ts       fetches app-config.json before the app starts
  src/lib/publicDatasets.ts  fetches datasets.json instead of the baked-in scan
```

Both fetches are top-level `await`s, so they finish before any feature
module runs, and `PUBLIC_DATASETS` stays a plain constant. In
`npm run dev` and on GitHub Pages there's no `app-config.json`, and the app
falls back to the defaults: online, with the baked-in scan. Dataset URLs
are relative (`data/terrain/…`), so everything stays on one origin.

To try offline mode in `npm run dev`, create `public/app-config.json`
containing `{ "offline": true }` (delete it afterwards). That file is
outside git's dataset ignore rules, so don't commit it by accident.
