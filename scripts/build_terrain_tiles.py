"""
Turns a single-band elevation GeoTIFF (a DTM or DSM) into a static Cesium
terrain tileset that the app can load from `public/` — no Cesium ion, no
tile server, no GDAL command-line tools.

    python scripts/build_terrain_tiles.py SOURCE.tif public/terrain/<name> \
        --name "Human readable name" --attribution "Data: who made it"

Requirements: Python 3.10+, with `rasterio`, `numpy`, `scipy`, `pyproj`
and `pydelatin` (`pip install rasterio numpy scipy pyproj pydelatin`).

Why a preprocessing step at all
-------------------------------
Cesium cannot read a GeoTIFF as terrain. It streams terrain the same way it
streams imagery: as a pyramid of small tiles, fetched on demand for whatever
is on screen at whatever detail the camera needs. A terrain tileset is a
folder holding a `layer.json` that describes the pyramid, plus one file per
tile at `{z}/{x}/{y}.terrain`. `Cesium.CesiumTerrainProvider.fromUrl()`
reads that from any static host — despite the name, it is not tied to ion;
ion is just one server that happens to speak the format.

The output format: quantized-mesh-1.0
-------------------------------------
This is Cesium's recommended terrain format, and what Cesium ion itself
serves. Each tile is a *triangle mesh* rather than a grid of heights, built
by Delatin — a greedy mesher that keeps adding vertices where the surface
deviates most until the mesh is within an error budget. Flat ground (most
of a coastal city) becomes a handful of large triangles; hillsides keep
their detail. That makes tiles smaller and faster to stream than a
fixed grid of the same accuracy.

Each tile also carries the "octvertexnormals" extension: one compressed
surface normal per vertex, which is what lets Cesium shade the terrain by
its slope (hillshading). Without normals, relief is only visible as
silhouette and parallax — in a city with 160 m hills, barely at all.

Format details this script relies on — read alongside the spec at
https://github.com/CesiumGS/quantized-mesh and Cesium's decoder in
CesiumTerrainProvider.js (`createQuantizedMeshTerrainData`):

  - Tiling: geographic (EPSG:4326), two 180-degree tiles at level 0, each
    tile splitting into four per level.
  - File paths use the TMS convention: y counts up from the *south*.
  - Vertices are (u, v, height), each quantized to 0-32767 across the tile
    (u west to east, v south to north, height min to max), then
    delta- and zig-zag-encoded.
  - Triangle indices are "high-water-mark" encoded, which requires vertices
    to be numbered in the order the triangles first use them.
  - Each tile lists its edge vertices so Cesium can hang "skirts" off them;
    skirts hide the hairline gaps where neighbouring meshes, simplified
    independently, don't share every edge vertex.
  - A horizon-occlusion point lets Cesium skip tiles hidden behind the
    curve of the earth without decoding them.

Vertical datum
--------------
Cesium heights are metres above the WGS84 *ellipsoid*. Most national DTMs
(including Google's GEM) are metres above *mean sea level*, i.e. the geoid.
Around Singapore the geoid sits about 8 m above the ellipsoid, so
unconverted terrain would sit 8 m too low and the sea would be a flat plane
8 m below where any georeferenced 3D model expects it. `--vertical-datum
egm2008` (the default) adds the EGM2008 geoid height to every sample. Use
`--vertical-datum ellipsoid` if your source is already ellipsoidal.

The conversion needs PROJ's EGM2008 grid, `us_nga_egm08_25.tif` (~80 MB).
By default PROJ downloads it from cdn.proj.org on first use and caches it.
On a machine without internet, install it beforehand — `pyproj sync
--file us_nga_egm08_25` on a connected machine, then copy the file into
the same folder on the offline one (`python -c "import pyproj;
print(pyproj.datadir.get_user_data_dir())"` prints it) — and set
`PROJ_NETWORK=OFF` so a missing grid fails at once instead of waiting on
the network. `Dockerfile.terrain` bakes the grid in and does both;
docs/deployment-docker.md has the details.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import struct
import sys
import warnings
from pathlib import Path

import numpy as np
import pyproj
import rasterio
from pydelatin import Delatin
from rasterio.warp import transform_bounds
from scipy import ndimage

GRID_SIZE = 65
"""Samples per tile edge before meshing.

Cesium estimates each level's geometric error as if tiles held a 65 x 65
grid, and picks which level to draw from that estimate. Sampling at the same
density keeps what a tile contains in step with when Cesium decides to draw
it.
"""

WGS84_A = 6_378_137.0
WGS84_F = 1 / 298.257223563
WGS84_B = WGS84_A * (1 - WGS84_F)
WGS84_E2 = WGS84_F * (2 - WGS84_F)

LEVEL_ZERO_GEOMETRIC_ERROR = WGS84_A * 2 * math.pi * 0.25 / (GRID_SIZE * 2)
"""Cesium's estimate for a level-0 tile: `TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap`."""

QUANTIZED_MAX = 32767
OCT_VERTEX_NORMALS_EXTENSION_ID = 1

METRES_PER_DEGREE = 111_320.0
"""Close enough for choosing levels and grid spacing; never used for geometry."""


# --- Source raster ---------------------------------------------------------


class SourceLevel:
    """One resolution of the source raster, plus the maths to sample it."""

    def __init__(self, heights: np.ndarray, transform: rasterio.Affine):
        self.heights = heights
        self.transform = transform
        self.resolution = abs(transform.a)

    def downsampled(self) -> "SourceLevel":
        """Half the resolution, averaging each 2x2 block and ignoring gaps.

        Coarse terrain levels need an *average* of the ground, not whichever
        single sample happens to land on a grid point — point-sampling a
        15 m raster at 1 km spacing would hit a hilltop in one tile and a
        valley in the next, and the globe would shimmer as you zoomed.
        """
        rows, cols = self.heights.shape
        padded = np.full((rows + rows % 2, cols + cols % 2), np.nan, dtype=np.float32)
        padded[:rows, :cols] = self.heights
        blocks = padded.reshape(padded.shape[0] // 2, 2, padded.shape[1] // 2, 2)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", category=RuntimeWarning)  # all-NaN blocks
            averaged = np.nanmean(blocks, axis=(1, 3)).astype(np.float32)
        return SourceLevel(averaged, self.transform * rasterio.Affine.scale(2))

    def sample(self, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        """Bilinear sample at projected coordinates; NaN where there's no data.

        Gaps (NaN) are excluded from the interpolation rather than allowed
        to poison it, so a coastline stays sharp instead of growing a
        one-sample-wide fringe of NaN around every hole.
        """
        inverse = ~self.transform
        col, row = inverse * (x, y)
        # Pixel *centres* are at +0.5 (the raster is AREA_OR_POINT=Area).
        col = np.asarray(col) - 0.5
        row = np.asarray(row) - 0.5

        c0 = np.floor(col).astype(np.int64)
        r0 = np.floor(row).astype(np.int64)
        fc = col - c0
        fr = row - r0

        rows, cols = self.heights.shape
        total = np.zeros(x.shape, dtype=np.float64)
        weight = np.zeros(x.shape, dtype=np.float64)
        for dr, dc, w in (
            (0, 0, (1 - fr) * (1 - fc)),
            (0, 1, (1 - fr) * fc),
            (1, 0, fr * (1 - fc)),
            (1, 1, fr * fc),
        ):
            rr = r0 + dr
            cc = c0 + dc
            inside = (rr >= 0) & (rr < rows) & (cc >= 0) & (cc < cols)
            values = np.full(x.shape, np.nan, dtype=np.float64)
            values[inside] = self.heights[rr[inside], cc[inside]]
            valid = ~np.isnan(values)
            total[valid] += w[valid] * values[valid]
            weight[valid] += w[valid]

        with np.errstate(invalid="ignore", divide="ignore"):
            return np.where(weight > 0, total / weight, np.nan)


def fill_enclosed_gaps(heights: np.ndarray) -> int:
    """Gives inland gaps in the data a flat surface at their shoreline height.

    DTMs leave water out: the sea, but also reservoirs and lakes. Treating
    every gap as sea level is right for the sea and badly wrong inland — a
    reservoir 20 m above sea level becomes a 20 m-deep pit with sheer walls,
    which hillshading then renders as a black hole.

    A gap that reaches the edge of the raster is open water (or the clipped
    edge of the dataset) and is left for the caller to treat as sea level.
    A gap enclosed by data is a lake: it's filled flat at a low percentile
    of the heights around its shore, which is roughly where water settles.
    Modifies `heights` in place; returns how many gaps were filled.
    """
    gaps = np.isnan(heights)
    labels, _ = ndimage.label(gaps)
    edge = np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]])
    open_water = set(np.unique(edge).tolist()) - {0}

    filled = 0
    for label, region in enumerate(ndimage.find_objects(labels), start=1):
        if region is None or label in open_water:
            continue
        # Grow the bounding box by one pixel so the shoreline is inside it.
        rows = slice(max(region[0].start - 1, 0), region[0].stop + 1)
        cols = slice(max(region[1].start - 1, 0), region[1].stop + 1)
        mask = labels[rows, cols] == label
        shore = ndimage.binary_dilation(mask) & ~gaps[rows, cols]
        if not shore.any():
            continue
        window = heights[rows, cols]
        window[mask] = np.percentile(window[shore], 10)
        filled += 1
    return filled


def build_source_pyramid(path: Path) -> tuple[list[SourceLevel], pyproj.CRS, tuple[float, ...]]:
    with rasterio.open(path) as dataset:
        if dataset.crs is None:
            sys.exit(f"{path} has no coordinate reference system; can't place it on the globe.")
        heights = dataset.read(1).astype(np.float32)
        if dataset.nodata is not None and not math.isnan(dataset.nodata):
            heights[heights == dataset.nodata] = np.nan
        filled = fill_enclosed_gaps(heights)
        print(f"  filled {filled} enclosed gaps (lakes, reservoirs) at their shoreline height")
        crs = pyproj.CRS.from_user_input(dataset.crs.to_wkt())
        bounds = transform_bounds(dataset.crs, "EPSG:4326", *dataset.bounds, densify_pts=21)
        levels = [SourceLevel(heights, dataset.transform)]

    # Halve until a level is coarser than anything the shallowest terrain
    # level inside the dataset will ask for.
    while min(levels[-1].heights.shape) > GRID_SIZE:
        levels.append(levels[-1].downsampled())
    return levels, crs, bounds


# --- Geoid -----------------------------------------------------------------


class GeoidGrid:
    """EGM2008 geoid heights over the dataset, precomputed on a coarse grid.

    The geoid varies over hundreds of kilometres, not metres, so computing
    it once per 0.02 degrees and interpolating is indistinguishable from
    computing it per sample — and avoids ten million PROJ calls.
    """

    STEP = 0.02

    def __init__(self, bounds: tuple[float, ...]):
        west, south, east, north = bounds
        self.west = west - self.STEP
        self.north = north + self.STEP
        lons = np.arange(self.west, east + 2 * self.STEP, self.STEP)
        lats = np.arange(self.north, south - 2 * self.STEP, -self.STEP)
        grid_lon, grid_lat = np.meshgrid(lons, lats)

        # PROJ fetches the EGM2008 grid from its CDN the first time — unless
        # PROJ_NETWORK=OFF says not to (air-gapped machines, where the grid
        # is installed beforehand). Either way a grid already on disk is
        # used without touching the network.
        network = os.environ.get("PROJ_NETWORK", "").upper() != "OFF"
        pyproj.network.set_network_enabled(network)
        # Checked through a TransformerGroup, because a plain Transformer
        # doesn't fail when the grid is missing: PROJ quietly falls back to
        # a "ballpark" transformation that treats the geoid as the
        # ellipsoid, every undulation comes out 0.00 m, and the terrain is
        # written ~8 m low with no error at all — exactly what happens on an
        # air-gapped machine without the grid. (`only_best=True` ought to
        # catch this, but doesn't for this compound CRS in PROJ 9.8.)
        with warnings.catch_warnings():
            # The group warns about the missing grid itself; the message
            # below says the same with what to do about it.
            warnings.simplefilter("ignore", UserWarning)
            group = pyproj.transformer.TransformerGroup("EPSG:4326+3855", "EPSG:4979", always_xy=True)
        if group.best_available:
            _, _, undulation = group.transformers[0].transform(
                grid_lon, grid_lat, np.zeros_like(grid_lon)
            )
        else:
            undulation = np.array([np.nan])
        if not np.all(np.isfinite(undulation)):
            how = (
                "Check your network, or install the grid beforehand"
                if network
                else "PROJ_NETWORK=OFF, so install the grid beforehand"
            )
            sys.exit(
                "Couldn't compute EGM2008 geoid heights — PROJ couldn't find its "
                f"geoid grid, us_nga_egm08_25.tif. {how} (see this script's "
                "docstring), or pass --vertical-datum ellipsoid if the source is "
                "already ellipsoidal."
            )
        self.undulation = SourceLevel(
            undulation.astype(np.float32),
            rasterio.Affine(
                self.STEP, 0, self.west - self.STEP / 2, 0, -self.STEP, self.north + self.STEP / 2
            ),
        )
        print(
            f"Geoid height over the dataset: {np.nanmin(undulation):.2f} to "
            f"{np.nanmax(undulation):.2f} m above the ellipsoid"
        )

    def at(self, lon: np.ndarray, lat: np.ndarray) -> np.ndarray:
        return self.undulation.sample(lon, lat)


# --- Geometry --------------------------------------------------------------


def to_ecef(lon_deg: np.ndarray, lat_deg: np.ndarray, height: np.ndarray) -> np.ndarray:
    """Geodetic (degrees, metres) to Earth-centred Cartesian, shape (n, 3)."""
    lon = np.radians(lon_deg)
    lat = np.radians(lat_deg)
    n = WGS84_A / np.sqrt(1 - WGS84_E2 * np.sin(lat) ** 2)
    return np.stack(
        [
            (n + height) * np.cos(lat) * np.cos(lon),
            (n + height) * np.cos(lat) * np.sin(lon),
            (n * (1 - WGS84_E2) + height) * np.sin(lat),
        ],
        axis=-1,
    )


def lattice_normals(heights: np.ndarray, lats: np.ndarray, lons: np.ndarray, step_deg: float) -> np.ndarray:
    """Unit surface normals in Earth-centred coordinates for every lattice sample.

    Computed from the full-resolution lattice rather than from each tile's
    simplified mesh, for two reasons. Normals taken from the mesh would stop
    at the tile edge, so lighting would show a seam along every tile
    boundary; taken from the lattice, both sides of a boundary read the same
    samples. And the lattice still has the detail the mesh simplified away,
    so the shading keeps small terrain features even where the geometry is
    a single flat triangle.
    """
    lat = np.radians(lats)[:, None]
    lon = np.radians(lons)[None, :]
    metres_east = step_deg * METRES_PER_DEGREE * np.cos(lat)
    metres_north = step_deg * METRES_PER_DEGREE
    d_row, d_col = np.gradient(heights)
    # Rows run north to south, so a rise in row index is a fall northward.
    east = -d_col / metres_east
    north = d_row / metres_north
    up = np.ones_like(heights)
    length = np.sqrt(east**2 + north**2 + up**2)
    east, north, up = east / length, north / length, up / length

    sin_lat, cos_lat = np.sin(lat), np.cos(lat)
    sin_lon, cos_lon = np.sin(lon), np.cos(lon)
    return np.stack(
        [
            -sin_lon * east - sin_lat * cos_lon * north + cos_lat * cos_lon * up,
            cos_lon * east - sin_lat * sin_lon * north + cos_lat * sin_lon * up,
            np.broadcast_to(cos_lat, heights.shape) * north + np.broadcast_to(sin_lat, heights.shape) * up,
        ],
        axis=-1,
    )


def oct_encode(normals: np.ndarray) -> np.ndarray:
    """Cesium's `AttributeCompression.octEncode`: unit vectors to two bytes each."""
    projected = normals / np.abs(normals).sum(axis=1, keepdims=True)
    x, y, z = projected[:, 0].copy(), projected[:, 1].copy(), projected[:, 2]
    below = z < 0
    sign_x = np.where(x[below] >= 0, 1.0, -1.0)
    sign_y = np.where(y[below] >= 0, 1.0, -1.0)
    x_below = (1 - np.abs(y[below])) * sign_x
    y_below = (1 - np.abs(x[below])) * sign_y
    x[below], y[below] = x_below, y_below
    encoded = np.round((np.clip(np.stack([x, y], axis=1), -1, 1) * 0.5 + 0.5) * 255)
    return encoded.astype(np.uint8)


def horizon_occlusion_point(positions: np.ndarray, direction: np.ndarray) -> np.ndarray:
    """Cesium's `EllipsoidalOccluder.computeHorizonCullingPointFromVertices`.

    A point, in ellipsoid-scaled space, that is visible exactly when some
    part of the tile is — so Cesium can cull tiles over the horizon with one
    test. Undefined for a tile wrapping too far round the earth to have a
    single "over the horizon" direction (the two level-0 hemispheres); Cesium
    can't represent "undefined" in the header, so those tiles get NaN, which
    fails every comparison in Cesium's visibility test and so means "never
    cull". That's exactly right for a tile that is half the planet.
    """
    radii = np.array([WGS84_A, WGS84_A, WGS84_B])
    scaled_direction = direction / radii
    scaled_direction /= np.linalg.norm(scaled_direction)

    scaled = positions / radii
    magnitude_sq = np.maximum(1.0, (scaled**2).sum(axis=1))
    magnitude = np.sqrt(magnitude_sq)
    unit = scaled / np.linalg.norm(scaled, axis=1, keepdims=True)
    cos_alpha = unit @ scaled_direction
    sin_alpha = np.linalg.norm(np.cross(unit, scaled_direction), axis=1)
    cos_beta = 1.0 / magnitude
    sin_beta = np.sqrt(magnitude_sq - 1.0) * cos_beta
    with np.errstate(divide="ignore"):
        candidate = 1.0 / (cos_alpha * cos_beta - sin_alpha * sin_beta)
    if np.any(candidate <= 0) or not np.all(np.isfinite(candidate)):
        return np.full(3, np.nan)
    return scaled_direction * candidate.max()


def zigzag_delta(values: np.ndarray) -> np.ndarray:
    deltas = np.diff(values.astype(np.int32), prepend=0)
    return ((deltas << 1) ^ (deltas >> 31)).astype(np.uint16)


def encode_tile(
    tile_heights: np.ndarray,
    tile_normals: np.ndarray,
    west: float,
    north: float,
    size: float,
    max_error: float,
) -> bytes:
    """Meshes one 65 x 65 tile grid and encodes it as quantized-mesh-1.0."""
    mesher = Delatin(
        tile_heights.astype(np.float32).ravel(), width=GRID_SIZE, height=GRID_SIZE, max_error=max_error
    )
    # Delatin's y counts *up* from the bottom row, not down like a raster
    # row: the vertex it reports at y is raster row (GRID_SIZE - 1 - y).
    # Reading y as a row still yields self-consistent tiles — every vertex
    # lands at the right place with the right height — but Delatin then
    # chose its points by fitting the tile's north–south mirror image, so
    # `max_error` held for the mirror and not for the terrain actually drawn.
    grid_xy = mesher.vertices[:, :2].astype(np.int64)
    grid_xy[:, 1] = (GRID_SIZE - 1) - grid_xy[:, 1]  # now (column, row)
    triangles = mesher.triangles.astype(np.int64)

    # Triangles must wind counter-clockwise seen from above (east right,
    # north up), or Cesium's back-face culling hides the terrain from the
    # sky. Delatin works in raster space, where rows run *down*, so check
    # each triangle and flip the ones that come out clockwise.
    #
    # This has to happen before the renumbering below: swapping two corners
    # of a triangle can put a vertex's first use after a later vertex's,
    # which breaks the high-water-mark index encoding and makes Cesium's
    # decoder read garbage indices.
    gx, gy = grid_xy[:, 0], -grid_xy[:, 1]  # east, north
    a, b, c = triangles[:, 0].copy(), triangles[:, 1].copy(), triangles[:, 2].copy()
    signed_area = (gx[b] - gx[a]) * (gy[c] - gy[a]) - (gx[c] - gx[a]) * (gy[b] - gy[a])
    clockwise = signed_area < 0
    triangles[clockwise, 1] = c[clockwise]
    triangles[clockwise, 2] = b[clockwise]

    # Renumber vertices in the order triangles first reference them — the
    # precondition for high-water-mark index encoding.
    order = np.unique(triangles.ravel(), return_index=True)[1]
    first_use = triangles.ravel()[np.sort(order)]
    renumber = np.empty(len(grid_xy), dtype=np.int64)
    renumber[first_use] = np.arange(len(first_use))
    grid_xy = grid_xy[first_use]
    triangles = renumber[triangles]

    cols, rows = grid_xy[:, 0], grid_xy[:, 1]
    heights = tile_heights[rows, cols].astype(np.float64)
    normals = tile_normals[rows, cols]
    lons = west + cols / (GRID_SIZE - 1) * size
    lats = north - rows / (GRID_SIZE - 1) * size
    positions = to_ecef(lons, lats, heights)

    u = np.round(cols / (GRID_SIZE - 1) * QUANTIZED_MAX).astype(np.int64)
    v = np.round((GRID_SIZE - 1 - rows) / (GRID_SIZE - 1) * QUANTIZED_MAX).astype(np.int64)
    min_height, max_height = float(heights.min()), float(heights.max())
    span = max_height - min_height
    h = np.zeros_like(u) if span == 0 else np.round((heights - min_height) / span * QUANTIZED_MAX).astype(np.int64)

    center_lon, center_lat = west + size / 2, north - size / 2
    center = to_ecef(np.array([center_lon]), np.array([center_lat]), np.array([(min_height + max_height) / 2]))[0]
    sphere_center = (positions.min(axis=0) + positions.max(axis=0)) / 2
    sphere_radius = float(np.linalg.norm(positions - sphere_center, axis=1).max())
    occlusion = horizon_occlusion_point(positions, sphere_center)

    out = bytearray()
    out += struct.pack("<3d", *center)
    out += struct.pack("<2f", min_height, max_height)
    out += struct.pack("<4d", *sphere_center, sphere_radius)
    out += struct.pack("<3d", *occlusion)

    vertex_count = len(u)
    out += struct.pack("<I", vertex_count)
    out += zigzag_delta(u).tobytes() + zigzag_delta(v).tobytes() + zigzag_delta(h).tobytes()

    # 16-bit indices are enough: a 65 x 65 grid has at most 4,225 vertices.
    if len(out) % 2:
        out += b"\x00"
    # High-water-mark: each index is stored as (next new vertex - index).
    # Because vertices were renumbered by first use, "next new vertex" at
    # any point is just one more than the largest index seen before it.
    flat = triangles.ravel()
    highest_before = np.concatenate([[0], np.maximum.accumulate(flat)[:-1] + 1])
    encoded = highest_before - flat
    # Decode it back exactly as Cesium does (a zero means "the next new
    # vertex"). A mistake here doesn't throw in the browser — the tile just
    # silently fails to load and the terrain stops refining — so catch it
    # at build time instead.
    decoded_highest = np.concatenate([[0], np.cumsum(encoded == 0)[:-1]])
    if np.any(encoded < 0) or not np.array_equal(decoded_highest - encoded, flat):
        raise AssertionError("triangle indices don't survive Cesium's high-water-mark decoding")
    out += struct.pack("<I", len(triangles))
    out += encoded.astype("<u2").tobytes()

    for edge in (u == 0, v == 0, u == QUANTIZED_MAX, v == QUANTIZED_MAX):  # west, south, east, north
        indices = np.nonzero(edge)[0]
        out += struct.pack("<I", len(indices)) + indices.astype("<u2").tobytes()

    encoded_normals = oct_encode(normals).tobytes()
    out += struct.pack("<BI", OCT_VERTEX_NORMALS_EXTENSION_ID, len(encoded_normals)) + encoded_normals
    return bytes(out)


# --- Tiling ----------------------------------------------------------------


def tile_degrees(level: int) -> float:
    """Width and height of one tile in degrees: 180 at level 0, halving."""
    return 180.0 / (1 << level)


def geometric_error(level: int) -> float:
    """How far, in metres, Cesium assumes a tile at this level may deviate from the true surface."""
    return LEVEL_ZERO_GEOMETRIC_ERROR / (1 << level)


def auto_max_level(resolution_m: float) -> int:
    """The deepest level whose grid spacing is still no finer than the data.

    Going deeper only interpolates between the same source samples: bigger
    output, slower loading, no extra detail.
    """
    spacing_deg = resolution_m / METRES_PER_DEGREE
    return max(0, math.floor(math.log2(180.0 / ((GRID_SIZE - 1) * spacing_deg))))


def tile_range(level: int, bounds: tuple[float, ...]) -> tuple[int, int, int, int]:
    """Tiles (x0, y0, x1, y1), inclusive, in Cesium's north-down y, covering bounds."""
    if level == 0:
        # Both level-0 tiles must exist or Cesium has nothing to start from.
        return 0, 0, 1, 0
    size = tile_degrees(level)
    west, south, east, north = bounds
    x0 = math.floor((west + 180.0) / size)
    x1 = math.floor((east + 180.0) / size)
    y0 = math.floor((90.0 - north) / size)
    y1 = math.floor((90.0 - south) / size)
    return x0, y0, x1, y1


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", type=Path, help="single-band elevation GeoTIFF")
    parser.add_argument("output", type=Path, help="output folder, e.g. public/terrain/my-dtm")
    parser.add_argument("--name", help="display name shown in the app (default: folder name)")
    parser.add_argument("--description", default="", help="optional longer description")
    parser.add_argument("--attribution", default="", help="credit shown on the map, e.g. the data's licence")
    parser.add_argument("--max-level", type=int, help="deepest tile level (default: matched to the data's resolution)")
    parser.add_argument(
        "--vertical-datum",
        choices=["egm2008", "ellipsoid"],
        default="egm2008",
        help="what the source heights are measured from (default: egm2008, i.e. mean sea level)",
    )
    parser.add_argument(
        "--max-error",
        type=float,
        default=0.5,
        help="mesh accuracy at the deepest level, in metres (default: 0.5); coarser levels scale up from here",
    )
    args = parser.parse_args()

    if args.output.exists() and any(args.output.iterdir()):
        sys.exit(f"{args.output} already exists and isn't empty; delete it first so stale tiles can't linger.")

    print(f"Reading {args.source}")
    pyramid, source_crs, bounds = build_source_pyramid(args.source)
    base = pyramid[0]
    metres_per_unit = 1.0 if source_crs.is_projected else METRES_PER_DEGREE
    resolution_m = base.resolution * metres_per_unit
    max_level = args.max_level if args.max_level is not None else auto_max_level(resolution_m)
    print(
        f"  {base.heights.shape[1]} x {base.heights.shape[0]} samples at {resolution_m:.1f} m, "
        f"bounds {[round(b, 4) for b in bounds]}"
    )
    print(f"  building levels 0-{max_level}")

    to_source = pyproj.Transformer.from_crs("EPSG:4326", source_crs, always_xy=True)
    geoid = GeoidGrid(bounds) if args.vertical_datum == "egm2008" else None
    west, south, east, north = bounds

    available: list[list[dict[str, int]]] = []
    total_tiles = 0
    total_bytes = 0

    for level in range(max_level + 1):
        x0, y0, x1, y1 = tile_range(level, bounds)
        size = tile_degrees(level)
        step = size / (GRID_SIZE - 1)
        spacing_m = step * METRES_PER_DEGREE
        # Each level may deviate from the true surface by the error Cesium
        # already assumes for it — finer would only cost bytes Cesium's
        # level selection never benefits from. The deepest level has nothing
        # finer to hand over to, so it gets the explicit accuracy instead.
        max_error = args.max_error if level == max_level else max(args.max_error, geometric_error(level) / 4)

        # One lattice of sample points for the whole level, rather than one
        # grid per tile: neighbouring tiles then read their shared edge from
        # the *same* samples, so their edges agree.
        cols = (x1 - x0 + 1) * (GRID_SIZE - 1) + 1
        rows = (y1 - y0 + 1) * (GRID_SIZE - 1) + 1
        lons = -180.0 + x0 * size + np.arange(cols) * step
        lats = 90.0 - y0 * size - np.arange(rows) * step
        grid_lon, grid_lat = np.meshgrid(lons, lats)

        # Outside the dataset the terrain is the bare ellipsoid, matching
        # the rest of the globe. Inside it, the gaps left after
        # `fill_enclosed_gaps` (the sea, or a clipped neighbouring country)
        # are mean sea level.
        heights = np.zeros(grid_lon.shape, dtype=np.float64)
        inside = (grid_lon >= west) & (grid_lon <= east) & (grid_lat >= south) & (grid_lat <= north)
        if inside.any():
            # The coarsest pre-averaged copy of the source that is still at
            # least as fine as this level's sample spacing.
            source = next(
                (s for s in reversed(pyramid) if s.resolution * metres_per_unit <= max(spacing_m, resolution_m)),
                base,
            )
            px, py = to_source.transform(grid_lon[inside], grid_lat[inside])
            sampled = source.sample(np.asarray(px), np.asarray(py))
            sampled = np.where(np.isnan(sampled), 0.0, sampled)
            if geoid is not None:
                sampled = sampled + geoid.at(grid_lon[inside], grid_lat[inside])
            heights[inside] = sampled
        normals = lattice_normals(heights, lats, lons, step)

        level_dir = args.output / str(level)
        tiles_in_level = 1 << level  # Cesium's y-tile count at this level.
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                r = (y - y0) * (GRID_SIZE - 1)
                c = (x - x0) * (GRID_SIZE - 1)
                payload = encode_tile(
                    heights[r : r + GRID_SIZE, c : c + GRID_SIZE],
                    normals[r : r + GRID_SIZE, c : c + GRID_SIZE],
                    west=-180.0 + x * size,
                    north=90.0 - y * size,
                    size=size,
                    max_error=max_error,
                )
                tms_y = tiles_in_level - 1 - y
                path = level_dir / str(x) / f"{tms_y}.terrain"
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(payload)
                total_tiles += 1
                total_bytes += len(payload)

        available.append(
            [
                {
                    "startX": x0,
                    "startY": tiles_in_level - 1 - y1,
                    "endX": x1,
                    "endY": tiles_in_level - 1 - y0,
                }
            ]
        )
        print(
            f"  level {level:2d}: {(x1 - x0 + 1) * (y1 - y0 + 1):5d} tiles, "
            f"{spacing_m:8.1f} m grid, {max_error:8.2f} m max error"
        )

    layer = {
        "tilejson": "2.1.0",
        "name": args.name or args.output.name,
        "description": args.description,
        "version": "1.0.0",
        "format": "quantized-mesh-1.0",
        "scheme": "tms",
        "projection": "EPSG:4326",
        "tiles": ["{z}/{x}/{y}.terrain?v={version}"],
        "extensions": ["octvertexnormals"],
        "minzoom": 0,
        "maxzoom": max_level,
        "bounds": [round(b, 6) for b in bounds],
        "attribution": args.attribution,
        "available": available,
        # Not part of the format — Cesium ignores it. Recorded so a later
        # reader can tell what the heights are relative to.
        "verticalDatum": "WGS84 ellipsoid (converted from EGM2008)"
        if geoid is not None
        else "WGS84 ellipsoid (as supplied)",
    }
    (args.output / "layer.json").write_text(json.dumps(layer, indent=2), encoding="utf-8")
    print(f"Wrote {total_tiles} tiles ({total_bytes / 1e6:.1f} MB) and layer.json to {args.output}")


if __name__ == "__main__":
    main()
