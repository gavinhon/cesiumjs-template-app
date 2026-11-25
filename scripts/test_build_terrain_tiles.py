"""Tests for build_terrain_tiles.py.

Run from the repository root:

    python -m unittest discover -s scripts -v

Needs the same packages as the script itself (rasterio, numpy, scipy,
pyproj, pydelatin). The most important test here decodes a tile exactly as
Cesium's quantized-mesh reader does: a malformed tile raises no error in the
browser — the terrain just silently stops refining — so this is the only
place such a bug shows up.
"""

from __future__ import annotations

import struct
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_terrain_tiles as terrain  # noqa: E402

GRID = terrain.GRID_SIZE
QMAX = terrain.QUANTIZED_MAX


def decode_tile(data: bytes) -> dict:
    """Reads a quantized-mesh-1.0 tile the way Cesium's `CesiumTerrainProvider` does."""
    offset = 0

    def take(fmt: str):
        nonlocal offset
        values = struct.unpack_from(fmt, data, offset)
        offset += struct.calcsize(fmt)
        return values

    _center = take("<3d")
    min_height, max_height = take("<2f")
    _sphere = take("<4d")
    _occlusion = take("<3d")
    (vertex_count,) = take("<I")

    def zigzag_decode(count: int) -> np.ndarray:
        raw = np.array(take(f"<{count}H"), dtype=np.int64)
        return np.cumsum((raw >> 1) ^ -(raw & 1))

    u, v, h = (zigzag_decode(vertex_count) for _ in range(3))

    if offset % 2:
        offset += 1
    (triangle_count,) = take("<I")
    encoded = np.array(take(f"<{triangle_count * 3}H"), dtype=np.int64)
    indices = np.empty_like(encoded)
    highest = 0
    for i, code in enumerate(encoded):
        indices[i] = highest - code
        if code == 0:
            highest += 1

    edges = []
    for _ in range(4):  # west, south, east, north
        (count,) = take("<I")
        edges.append(np.array(take(f"<{count}H"), dtype=np.int64))

    extensions = {}
    while offset < len(data):
        extension_id, length = take("<BI")
        extensions[extension_id] = data[offset : offset + length]
        offset += length

    return {
        "min_height": min_height,
        "max_height": max_height,
        "u": u,
        "v": v,
        "h": h,
        "triangles": indices.reshape(-1, 3),
        "edges": edges,
        "extensions": extensions,
        "length_read": offset,
    }


def hill(peak: float = 120.0) -> np.ndarray:
    """A smooth hill on a 65 x 65 grid — enough relief to need many triangles."""
    y, x = np.mgrid[0:GRID, 0:GRID]
    return 5.0 + peak * np.exp(-((x - 40) ** 2 + (y - 24) ** 2) / 120.0)


def straight_up_normals() -> np.ndarray:
    normals = np.zeros((GRID, GRID, 3))
    normals[..., 2] = 1.0
    return normals


class EncodeTileTest(unittest.TestCase):
    def setUp(self):
        self.heights = hill()
        self.tile = decode_tile(
            terrain.encode_tile(self.heights, straight_up_normals(), 103.75, 1.4, 0.01, max_error=0.5)
        )

    def test_reads_to_the_end_with_nothing_left_over(self):
        encoded = terrain.encode_tile(self.heights, straight_up_normals(), 103.75, 1.4, 0.01, 0.5)
        self.assertEqual(self.tile["length_read"], len(encoded))

    def test_vertex_coordinates_stay_in_the_quantized_range(self):
        for axis in ("u", "v", "h"):
            values = self.tile[axis]
            self.assertGreaterEqual(values.min(), 0, axis)
            self.assertLessEqual(values.max(), QMAX, axis)

    def test_header_heights_match_the_data(self):
        self.assertAlmostEqual(self.tile["min_height"], self.heights.min(), places=3)
        self.assertAlmostEqual(self.tile["max_height"], self.heights.max(), places=3)

    def test_all_four_corners_are_vertices(self):
        corners = set(zip(self.tile["u"].tolist(), self.tile["v"].tolist()))
        for corner in [(0, 0), (0, QMAX), (QMAX, 0), (QMAX, QMAX)]:
            self.assertIn(corner, corners)

    def test_indices_decode_to_real_vertices_and_use_every_one(self):
        triangles = self.tile["triangles"]
        vertex_count = len(self.tile["u"])
        self.assertGreaterEqual(triangles.min(), 0)
        self.assertLess(triangles.max(), vertex_count)
        self.assertEqual(set(triangles.ravel().tolist()), set(range(vertex_count)))

    def test_every_triangle_winds_counter_clockwise_seen_from_above(self):
        u = self.tile["u"].astype(float)
        v = self.tile["v"].astype(float)
        a, b, c = self.tile["triangles"].T
        area = (u[b] - u[a]) * (v[c] - v[a]) - (u[c] - u[a]) * (v[b] - v[a])
        self.assertTrue(np.all(area > 0), f"{np.sum(area <= 0)} triangles wind the wrong way")

    def test_triangles_cover_the_whole_tile_without_overlap(self):
        u = self.tile["u"].astype(float)
        v = self.tile["v"].astype(float)
        a, b, c = self.tile["triangles"].T
        area = np.abs((u[b] - u[a]) * (v[c] - v[a]) - (u[c] - u[a]) * (v[b] - v[a])) / 2
        self.assertAlmostEqual(area.sum(), QMAX * QMAX, delta=1)

    def test_edge_lists_hold_exactly_the_vertices_on_each_edge(self):
        u, v = self.tile["u"], self.tile["v"]
        expected = [u == 0, v == 0, u == QMAX, v == QMAX]  # west, south, east, north
        for name, edge, on_edge in zip(("west", "south", "east", "north"), self.tile["edges"], expected):
            self.assertEqual(sorted(edge.tolist()), np.nonzero(on_edge)[0].tolist(), name)

    def test_carries_two_bytes_of_normal_per_vertex(self):
        normals = self.tile["extensions"].get(terrain.OCT_VERTEX_NORMALS_EXTENSION_ID)
        self.assertIsNotNone(normals)
        self.assertEqual(len(normals), 2 * len(self.tile["u"]))

    def test_heights_decode_back_to_the_source_values(self):
        tile = self.tile
        cols = np.round(tile["u"] / QMAX * (GRID - 1)).astype(int)
        rows = np.round((1 - tile["v"] / QMAX) * (GRID - 1)).astype(int)
        span = tile["max_height"] - tile["min_height"]
        decoded = tile["min_height"] + tile["h"] / QMAX * span
        np.testing.assert_allclose(decoded, self.heights[rows, cols], atol=span / QMAX + 1e-3)

    def test_mesh_stays_within_max_error_of_every_source_point(self):
        tile = self.tile
        cols = tile["u"] / QMAX * (GRID - 1)
        rows = (1 - tile["v"] / QMAX) * (GRID - 1)
        span = tile["max_height"] - tile["min_height"]
        heights = tile["min_height"] + tile["h"] / QMAX * span

        worst = 0.0
        for a, b, c in tile["triangles"]:
            x0, x1 = int(np.floor(min(cols[[a, b, c]]))), int(np.ceil(max(cols[[a, b, c]])))
            y0, y1 = int(np.floor(min(rows[[a, b, c]]))), int(np.ceil(max(rows[[a, b, c]])))
            gy, gx = np.mgrid[y0 : y1 + 1, x0 : x1 + 1]
            det = (rows[b] - rows[c]) * (cols[a] - cols[c]) + (cols[c] - cols[b]) * (rows[a] - rows[c])
            wa = ((rows[b] - rows[c]) * (gx - cols[c]) + (cols[c] - cols[b]) * (gy - rows[c])) / det
            wb = ((rows[c] - rows[a]) * (gx - cols[c]) + (cols[a] - cols[c]) * (gy - rows[c])) / det
            wc = 1 - wa - wb
            inside = (wa >= -1e-9) & (wb >= -1e-9) & (wc >= -1e-9)
            surface = wa * heights[a] + wb * heights[b] + wc * heights[c]
            error = np.abs(surface - self.heights[gy, gx])[inside]
            if error.size:
                worst = max(worst, float(error.max()))

        self.assertLessEqual(worst, 0.5 + span / QMAX + 1e-3)

    def test_flat_ground_becomes_two_triangles(self):
        flat = decode_tile(
            terrain.encode_tile(np.full((GRID, GRID), 7.0), straight_up_normals(), 0, 1, 0.01, 0.5)
        )
        self.assertEqual(len(flat["triangles"]), 2)
        self.assertTrue(np.all(flat["h"] == 0))
        self.assertEqual(flat["min_height"], flat["max_height"])


class EncodingPrimitivesTest(unittest.TestCase):
    def test_zigzag_delta(self):
        self.assertEqual(terrain.zigzag_delta(np.array([0, 1, 3, 2])).tolist(), [0, 2, 4, 1])

    def test_oct_encode_matches_cesium(self):
        normals = np.array([[0.0, 0.0, 1.0], [1.0, 0.0, 0.0], [0.0, 0.0, -1.0]])
        self.assertEqual(terrain.oct_encode(normals).tolist(), [[128, 128], [255, 128], [255, 255]])

    def test_horizon_occlusion_point_is_undefined_for_a_hemisphere(self):
        lons, lats = np.meshgrid(np.linspace(-180, 0, GRID), np.linspace(90, -90, GRID))
        positions = terrain.to_ecef(lons.ravel(), lats.ravel(), np.zeros(lons.size))
        center = (positions.min(axis=0) + positions.max(axis=0)) / 2
        point = terrain.horizon_occlusion_point(positions, center)
        self.assertTrue(np.all(np.isnan(point)))

    def test_horizon_occlusion_point_is_above_a_small_tile(self):
        lons = np.array([103.8, 103.81, 103.8, 103.81])
        lats = np.array([1.3, 1.3, 1.31, 1.31])
        positions = terrain.to_ecef(lons, lats, np.array([0.0, 50.0, 100.0, 10.0]))
        point = terrain.horizon_occlusion_point(positions, positions.mean(axis=0))
        self.assertTrue(np.all(np.isfinite(point)))
        self.assertGreater(np.linalg.norm(point), 1.0)


class TilingTest(unittest.TestCase):
    def test_level_zero_always_has_both_hemispheres(self):
        self.assertEqual(terrain.tile_range(0, (103.6, 1.2, 104.1, 1.5)), (0, 0, 1, 0))

    def test_tile_range_covers_the_bounds(self):
        self.assertEqual(terrain.tile_range(1, (103.6, 1.2, 104.1, 1.5)), (3, 0, 3, 0))

    def test_auto_max_level_stops_where_the_data_runs_out(self):
        self.assertEqual(terrain.auto_max_level(15.0), 14)
        self.assertEqual(terrain.auto_max_level(30.0), 13)

    def test_geometric_error_halves_each_level(self):
        self.assertAlmostEqual(terrain.geometric_error(5) * 2, terrain.geometric_error(4))


class FillEnclosedGapsTest(unittest.TestCase):
    def test_fills_a_lake_at_its_shore_height_and_leaves_the_sea_open(self):
        heights = np.full((8, 8), 20.0)
        heights[3:5, 3:5] = np.nan  # an enclosed reservoir
        heights[:, 0] = np.nan  # sea along the raster edge
        filled = terrain.fill_enclosed_gaps(heights)

        self.assertEqual(filled, 1)
        np.testing.assert_allclose(heights[3:5, 3:5], 20.0)
        self.assertTrue(np.all(np.isnan(heights[:, 0])))


if __name__ == "__main__":
    unittest.main()
