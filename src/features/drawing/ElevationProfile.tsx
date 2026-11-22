import { useEffect, useRef, useState, type PointerEvent } from 'react';
import * as Cesium from 'cesium';
import { MAP_COLORS } from '@/cesium/mapColors';
import { formatHeight } from '@/lib/mapReadouts';
import { profilePaths, profileStats, samplePath, type ProfileStats } from './profileGeometry';
import { formatDistance } from './measurement';
import './ElevationProfile.css';

interface ElevationProfileProps {
  viewer: Cesium.Viewer;
  /** The line's vertices, in order. Re-sampled whenever they change (a vertex dragged). */
  positions: Cesium.Cartesian3[];
}

type Profile = {
  distances: number[];
  heights: number[];
  samples: Cesium.Cartographic[];
  stats: ProfileStats;
};

/** What a terrain request answered — and for which line on which terrain. */
type Answer = { positions: Cesium.Cartesian3[]; terrain: Cesium.TerrainProvider } & (
  { state: 'done'; profile: Profile } | { state: 'error'; message: string }
);

/** What the panel shows, worked out from the answer during render. */
type LoadState =
  | { state: 'loading' }
  | { state: 'no-terrain' }
  | { state: 'done'; profile: Profile }
  | { state: 'error'; message: string };

/** Enough to show every hill a hand-drawn line crosses, few enough to fetch instantly. */
const SAMPLE_COUNT = 128;
const WIDTH = 288;
const HEIGHT = 88;

/**
 * The ground's height along a drawn line or distance measurement — what
 * Google Earth shows under its measure tool, and the first thing a planner
 * asks of a route: how much does it climb?
 *
 * Samples the *terrain* (`sampleTerrainMostDetailed`), not whatever was
 * clicked: a measurement from roof to roof still profiles the ground
 * between. With no terrain loaded the ground is the bare ellipsoid —
 * height 0 everywhere — so it says so instead of drawing a flat line.
 *
 * Hovering the chart puts a marker on the map at that point, written to a
 * Cesium entity directly — never through React state per mouse move.
 */
export function ElevationProfile({ viewer, positions }: ElevationProfileProps) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const markerRef = useRef<Cesium.Entity | null>(null);

  // Only the terrain's answer is state; "loading" and "no terrain" are
  // worked out here, during render. Setting them from the effect would
  // commit a frame showing the previous line's profile before switching —
  // and the effect would be setting state that isn't an answer from
  // anything outside React.
  //
  // The terrain provider is read here and passed to the effect as an input,
  // so choosing a terrain while a line is selected re-samples it. (The App
  // re-renders when the terrain finishes loading, which is when Cesium
  // swaps the provider in.)
  const terrain = viewer.terrainProvider;
  const noTerrain = terrain instanceof Cesium.EllipsoidTerrainProvider;
  const result: LoadState = noTerrain
    ? { state: 'no-terrain' }
    : answer && answer.positions === positions && answer.terrain === terrain
      ? answer
      : { state: 'loading' };

  useEffect(() => {
    if (terrain instanceof Cesium.EllipsoidTerrainProvider) return;
    let current = true;
    const { cartographics, distances } = samplePath(positions, SAMPLE_COUNT);
    // Fills in each cartographic's height from the most detailed terrain
    // tiles available, fetching them if needed.
    Cesium.sampleTerrainMostDetailed(terrain, cartographics).then(
      (samples) => {
        if (!current) return;
        const heights = samples.map((sample) => sample.height);
        setAnswer({
          positions,
          terrain,
          state: 'done',
          profile: { distances, heights, samples, stats: profileStats(heights) },
        });
      },
      (error: unknown) => {
        if (!current) return;
        setAnswer({
          positions,
          terrain,
          state: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => {
      current = false;
    };
  }, [terrain, positions]);

  // The hover marker: created on first hover, removed with the chart.
  useEffect(
    () => () => {
      if (markerRef.current && !viewer.isDestroyed()) viewer.entities.remove(markerRef.current);
      markerRef.current = null;
    },
    [viewer],
  );

  function showAt(index: number | null, profile: Profile) {
    setHover(index);
    if (index === null) {
      if (markerRef.current) markerRef.current.show = false;
      return;
    }
    const sample = profile.samples[index];
    const position = Cesium.Cartesian3.fromRadians(
      sample.longitude,
      sample.latitude,
      sample.height,
    );
    if (!markerRef.current) {
      markerRef.current = viewer.entities.add({
        position,
        point: {
          pixelSize: 9,
          // A measurement's colour with its dark casing: it's a reading off
          // the measured line, not a new place.
          color: MAP_COLORS.measure,
          outlineColor: MAP_COLORS.casing,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    } else {
      markerRef.current.position = new Cesium.ConstantPositionProperty(position);
      markerRef.current.show = true;
    }
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>, profile: Profile) {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
    showAt(Math.round(fraction * (profile.distances.length - 1)), profile);
  }

  return (
    <section className="elevation-profile" aria-label="Elevation profile">
      <h3 className="elevation-profile__heading">Ground profile</h3>
      {result.state === 'loading' && <p className="elevation-profile__note">Sampling terrain…</p>}
      {result.state === 'no-terrain' && (
        <p className="elevation-profile__note">
          Choose a terrain under Layers to see how the ground rises and falls along this line.
        </p>
      )}
      {result.state === 'error' && (
        <p className="elevation-profile__note elevation-profile__note--error">{result.message}</p>
      )}
      {result.state === 'done' && (
        <ProfileChart
          profile={result.profile}
          hover={hover}
          onPointerMove={(event) => onPointerMove(event, result.profile)}
          onPointerLeave={() => showAt(null, result.profile)}
        />
      )}
    </section>
  );
}

function ProfileChart({
  profile,
  hover,
  onPointerMove,
  onPointerLeave,
}: {
  profile: Profile;
  hover: number | null;
  onPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerLeave: () => void;
}) {
  const { distances, heights, stats } = profile;
  const { line, area } = profilePaths(distances, heights, WIDTH, HEIGHT);
  const total = distances[distances.length - 1];
  const hoverX = hover === null ? null : (distances[hover] / (total || 1)) * WIDTH;

  return (
    <>
      <div className="elevation-profile__chart">
        <span className="elevation-profile__axis elevation-profile__axis--max">
          {formatHeight(stats.max)}
        </span>
        <span className="elevation-profile__axis elevation-profile__axis--min">
          {formatHeight(stats.min)}
        </span>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="elevation-profile__svg"
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          role="img"
          aria-label={`Ground from ${formatHeight(stats.min)} to ${formatHeight(stats.max)} over ${formatDistance(total)}`}
        >
          <path className="elevation-profile__area" d={area} />
          <path className="elevation-profile__line" d={line} vectorEffect="non-scaling-stroke" />
          {hoverX !== null && (
            <line
              className="elevation-profile__cursor"
              x1={hoverX}
              x2={hoverX}
              y1={0}
              y2={HEIGHT}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      </div>
      <p
        className="elevation-profile__readout"
        title={`Total climb ${formatHeight(stats.climb)}, total descent ${formatHeight(stats.descent)}`}
      >
        {hover !== null
          ? `${formatDistance(distances[hover])} along · ${formatHeight(heights[hover])}`
          : // Arrows, not words: spelled out, the line wrapped in a 320px panel.
            `${formatDistance(total)} · ↑${formatHeight(stats.climb)} ↓${formatHeight(stats.descent)}`}
      </p>
    </>
  );
}
