import * as Cesium from 'cesium';

export interface PathSamples {
  cartographics: Cesium.Cartographic[];
  distances: number[];
}

export function samplePath(positions: Cesium.Cartesian3[], count: number): PathSamples {
  const cartos = positions.map((position) => Cesium.Cartographic.fromCartesian(position));
  if (cartos.length < 2 || count < 2)
    return { cartographics: cartos, distances: cartos.map(() => 0) };

  const geodesics = cartos
    .slice(1)
    .map((end, index) => new Cesium.EllipsoidGeodesic(cartos[index], end));
  const lengths = geodesics.map((geodesic) => geodesic.surfaceDistance);
  const total = lengths.reduce((sum, length) => sum + length, 0);

  const cartographics: Cesium.Cartographic[] = [];
  const distances: number[] = [];
  let segment = 0;
  let segmentStart = 0;
  for (let i = 0; i < count; i++) {
    const along = (total * i) / (count - 1);
    while (segment < geodesics.length - 1 && along > segmentStart + lengths[segment]) {
      segmentStart += lengths[segment];
      segment++;
    }
    const length = lengths[segment];
    const fraction = length > 0 ? Math.min((along - segmentStart) / length, 1) : 0;
    const point = geodesics[segment].interpolateUsingFraction(fraction, new Cesium.Cartographic());
    point.height = 0;
    cartographics.push(point);
    distances.push(along);
  }
  return { cartographics, distances };
}

export interface ProfileStats {
  min: number;
  max: number;
  climb: number;
  descent: number;
}

export function profileStats(heights: number[]): ProfileStats {
  let climb = 0;
  let descent = 0;
  for (let i = 1; i < heights.length; i++) {
    const step = heights[i] - heights[i - 1];
    if (step > 0) climb += step;
    else descent -= step;
  }
  return {
    min: heights.length ? Math.min(...heights) : 0,
    max: heights.length ? Math.max(...heights) : 0,
    climb,
    descent,
  };
}

export function profilePaths(
  distances: number[],
  heights: number[],
  width: number,
  height: number,
  minRange = 10,
): { line: string; area: string } {
  if (distances.length < 2) return { line: '', area: '' };
  const total = distances[distances.length - 1] || 1;
  const { min, max } = profileStats(heights);
  const range = Math.max(max - min, minRange);
  const base = min - (range - (max - min)) / 2;
  const x = (d: number) => (d / total) * width;
  const y = (h: number) => height - ((h - base) / range) * height;
  const points = distances.map((d, i) => `${x(d).toFixed(1)},${y(heights[i]).toFixed(1)}`);
  const line = `M${points.join(' L')}`;
  return { line, area: `${line} L${width},${height} L0,${height} Z` };
}
