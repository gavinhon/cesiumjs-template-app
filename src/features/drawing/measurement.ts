import * as Cesium from 'cesium';

export function formatDistance(meters: number): string {
  const rounded = Math.round(meters * 10) / 10;
  return rounded >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${rounded.toFixed(1)} m`;
}

export function groundDistance(positions: Cesium.Cartesian3[]): number {
  let total = 0;
  for (let i = 1; i < positions.length; i++) {
    const a = Cesium.Cartographic.fromCartesian(positions[i - 1]);
    const b = Cesium.Cartographic.fromCartesian(positions[i]);
    total += new Cesium.EllipsoidGeodesic(a, b).surfaceDistance;
  }
  return total;
}

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

export function horizontalDiffers(positions: Cesium.Cartesian3[]): boolean {
  if (positions.length < 2) return false;
  const slant = slantDistance(positions);
  const horizontal = groundDistance(positions);
  return slant - horizontal >= Math.max(1, horizontal * 0.02);
}

export function describeDirect(positions: Cesium.Cartesian3[]): string {
  return formatDistance(slantDistance(positions));
}

export function describeHorizontal(positions: Cesium.Cartesian3[]): string {
  return `${formatDistance(groundDistance(positions))} horizontal`;
}

export function describePath(positions: Cesium.Cartesian3[]): string {
  if (positions.length < 2) return formatDistance(0);
  return horizontalDiffers(positions)
    ? `${describeDirect(positions)} · ${describeHorizontal(positions)}`
    : describeDirect(positions);
}

export function levelPath(positions: Cesium.Cartesian3[]): Cesium.Cartesian3[] {
  const cartographics = positions.map((position) => Cesium.Cartographic.fromCartesian(position));
  const lowest = Math.min(...cartographics.map((carto) => carto.height));
  return cartographics.map((carto) =>
    Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, lowest),
  );
}

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

export function heightTriangleCorner(
  from: Cesium.Cartesian3,
  to: Cesium.Cartesian3,
): Cesium.Cartesian3 {
  const base = Cesium.Cartographic.fromCartesian(from);
  return Cesium.Cartesian3.fromRadians(base.longitude, base.latitude, heightOf(to));
}

export function isDiagonal(from: Cesium.Cartesian3, to: Cesium.Cartesian3): boolean {
  const length = Cesium.Cartesian3.distance(from, to);
  const threshold = Math.max(0.5, length * 0.05);
  const rise = Math.abs(heightOf(to) - heightOf(from));
  const run = groundDistance([from, to]);
  return rise >= threshold && run >= threshold;
}

export function describeRise(from: Cesium.Cartesian3, to: Cesium.Cartesian3): string {
  const rise = heightOf(to) - heightOf(from);
  return `${formatDistance(Math.abs(rise))} ${rise >= 0 ? 'up' : 'down'}`;
}

export function describeElevation(position: Cesium.Cartesian3): string {
  return `${heightOf(position).toFixed(1)} m (WGS84)`;
}
