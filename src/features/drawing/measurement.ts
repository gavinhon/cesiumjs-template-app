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
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters.toFixed(1)} m`;
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
 * The measure tool's readout: the true 3D length, plus — only when it
 * differs enough to matter — the horizontal distance a flat map would give.
 *
 * Usually that's one number. Two near-identical numbers ("30.1 m 3D ·
 * 30.0 m ground", as this once printed) read as a contradiction rather
 * than information: on a street the gap is just the terrain's bumps, so
 * the second number appears only once the path climbs noticeably — up a
 * hill, or from the street to a roof — and is named in plain words.
 */
export function describePath(positions: Cesium.Cartesian3[]): string {
  if (positions.length < 2) return formatDistance(0);
  const slant = slantDistance(positions);
  const horizontal = groundDistance(positions);
  const matters = slant - horizontal >= Math.max(1, horizontal * 0.02);
  return matters
    ? `${formatDistance(slant)} · ${formatDistance(horizontal)} horizontal`
    : formatDistance(slant);
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
 * The height tool's readout: how far up (or down) the second point is from
 * the first, then how far across. In words rather than arrows and signs,
 * so it reads without a legend. The slanted line's own length is what the
 * measure tool is for, so it isn't repeated here.
 */
export function describeHeight(from: Cesium.Cartesian3, to: Cesium.Cartesian3): string {
  const rise = heightOf(to) - heightOf(from);
  const direction = rise >= 0 ? 'up' : 'down';
  return `${formatDistance(Math.abs(rise))} ${direction} · ${formatDistance(groundDistance([from, to]))} horizontal`;
}

/**
 * A point's elevation. Heights in Cesium are above the WGS84 ellipsoid,
 * not sea level — around Singapore the two differ by about 8 m — and the
 * label says so rather than passing one off as the other.
 */
export function describeElevation(position: Cesium.Cartesian3): string {
  return `${heightOf(position).toFixed(1)} m (WGS84)`;
}
