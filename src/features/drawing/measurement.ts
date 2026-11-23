import * as Cesium from 'cesium';

/**
 * Distances, heights and their wording — the numbers behind the measure
 * and height tools, kept apart from the input handling that collects the
 * points.
 *
 * Three different "distances" between two points are all correct answers
 * to different questions, and 3D measurement is mostly about saying which
 * one you mean:
 *
 *  - **ground** — along the curved earth, ignoring height: the distance on
 *    a map. `EllipsoidGeodesic`.
 *  - **3D** — the straight line through space between the two points: how
 *    long a cable strung between them would be. `Cartesian3.distance`.
 *  - **vertical** — the difference in height alone.
 *
 * On flat ground the first two agree; up a hillside or to a rooftop they
 * don't, which is the case 3D measurement exists for.
 */

export function formatDistance(meters: number): string {
  // Decided on the value as it will print: 999.97 m rounds to "1000.0 m",
  // which should read "1.00 km" instead.
  const rounded = Math.round(meters * 10) / 10;
  return rounded >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${rounded.toFixed(1)} m`;
}

/** Sum of the ground (geodesic) distance between consecutive points. */
export function groundDistance(positions: Cesium.Cartesian3[]): number {
  let total = 0;
  for (let i = 1; i < positions.length; i++) {
    const a = Cesium.Cartographic.fromCartesian(positions[i - 1]);
    const b = Cesium.Cartographic.fromCartesian(positions[i]);
    total += new Cesium.EllipsoidGeodesic(a, b).surfaceDistance;
  }
  return total;
}

/** Sum of the straight-line 3D distance between consecutive points. */
export function slantDistance(positions: Cesium.Cartesian3[]): number {
  let total = 0;
  for (let i = 1; i < positions.length; i++) {
    total += Cesium.Cartesian3.distance(positions[i - 1], positions[i]);
  }
  return total;
}

export function heightOf(position: Cesium.Cartesian3): number {
  return Cesium.Cartographic.fromCartesian(position).height;
}

/**
 * Whether a path climbs enough for its horizontal distance to be worth
 * showing beside its 3D length.
 *
 * On a street the two differ only by the terrain's bumps — "30.1 m" against
 * "30.0 m" — and showing both reads as a contradiction rather than
 * information. So the horizontal distance (and the dotted line that
 * carries it on the map) appears only once the path climbs noticeably: up a
 * hill, or from the street to a roof.
 */
export function horizontalDiffers(positions: Cesium.Cartesian3[]): boolean {
  if (positions.length < 2) return false;
  const slant = slantDistance(positions);
  const horizontal = groundDistance(positions);
  return slant - horizontal >= Math.max(1, horizontal * 0.02);
}

/** The label on the measured line itself: its 3D length. */
export function describeDirect(positions: Cesium.Cartesian3[]): string {
  return formatDistance(slantDistance(positions));
}

/** The label on the dotted level line: the distance a flat map would give. */
export function describeHorizontal(positions: Cesium.Cartesian3[]): string {
  return `${formatDistance(groundDistance(positions))} horizontal`;
}

/**
 * The measure tool's full readout, for the Drawings panel: the 3D length,
 * plus the horizontal distance when it differs enough to matter. On the map
 * the two are split onto the lines they describe instead — see
 * `describeDirect` and `describeHorizontal`.
 */
export function describePath(positions: Cesium.Cartesian3[]): string {
  if (positions.length < 2) return formatDistance(0);
  return horizontalDiffers(positions)
    ? `${describeDirect(positions)} · ${describeHorizontal(positions)}`
    : describeDirect(positions);
}

/**
 * The path flattened to the height of its lowest vertex: the dotted level
 * line that shows what "horizontal" means. It meets the measured path at
 * that lowest point and runs level from there, so the gap between the two
 * lines is the climb.
 */
export function levelPath(positions: Cesium.Cartesian3[]): Cesium.Cartesian3[] {
  const cartographics = positions.map((position) => Cesium.Cartographic.fromCartesian(position));
  const lowest = Math.min(...cartographics.map((carto) => carto.height));
  return cartographics.map((carto) =>
    Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, lowest),
  );
}

/**
 * The point `fraction` of the way along a path, by length — where a label
 * goes so it reads as belonging to that line rather than to an endpoint.
 */
export function pointAlong(positions: Cesium.Cartesian3[], fraction: number): Cesium.Cartesian3 {
  if (positions.length === 1) return positions[0];
  const target = slantDistance(positions) * fraction;
  let travelled = 0;
  for (let i = 1; i < positions.length; i++) {
    const segment = Cesium.Cartesian3.distance(positions[i - 1], positions[i]);
    if (travelled + segment >= target && segment > 0) {
      return Cesium.Cartesian3.lerp(
        positions[i - 1],
        positions[i],
        (target - travelled) / segment,
        new Cesium.Cartesian3(),
      );
    }
    travelled += segment;
  }
  return positions[positions.length - 1];
}

/**
 * The right-angle corner of the triangle the height tool draws between two
 * points: directly above (or below) the *first* point, at the *second*
 * point's height. The legs from it are then the vertical and horizontal
 * components of the slant line, which is what makes the triangle readable
 * as "this much up, this much across".
 */
export function heightTriangleCorner(
  from: Cesium.Cartesian3,
  to: Cesium.Cartesian3,
): Cesium.Cartesian3 {
  const base = Cesium.Cartographic.fromCartesian(from);
  return Cesium.Cartesian3.fromRadians(base.longitude, base.latitude, heightOf(to));
}

/**
 * Whether a two-point line is diagonal enough for its vertical and
 * horizontal parts to be worth showing: each at least half a metre and 5%
 * of the line. A nearly level line's "rise" or a nearly vertical one's
 * "run" would only be noise beside the length itself.
 */
export function isDiagonal(from: Cesium.Cartesian3, to: Cesium.Cartesian3): boolean {
  const length = Cesium.Cartesian3.distance(from, to);
  const threshold = Math.max(0.5, length * 0.05);
  const rise = Math.abs(heightOf(to) - heightOf(from));
  const run = groundDistance([from, to]);
  return rise >= threshold && run >= threshold;
}

/**
 * The vertical part of a two-point line, in words rather than a sign so it
 * reads without a legend: "10.2 m up", "130.0 m down".
 */
export function describeRise(from: Cesium.Cartesian3, to: Cesium.Cartesian3): string {
  const rise = heightOf(to) - heightOf(from);
  return `${formatDistance(Math.abs(rise))} ${rise >= 0 ? 'up' : 'down'}`;
}

/**
 * A point's elevation. Heights in Cesium are above the WGS84 ellipsoid,
 * not sea level — around Singapore the two differ by about 8 m — and the
 * label says so rather than passing one off as the other.
 */
export function describeElevation(position: Cesium.Cartesian3): string {
  return `${heightOf(position).toFixed(1)} m (WGS84)`;
}
