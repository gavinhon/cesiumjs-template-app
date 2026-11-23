import type * as Cesium from 'cesium';

/**
 * One key/value fact recorded against a drawn shape.
 *
 * Carries an `id` separate from its `key` so a row keeps its identity while
 * the key is being typed — without it, renaming a key would remount the
 * input and drop focus after every keystroke.
 */
export interface FeatureAttribute {
  id: string;
  key: string;
  value: string;
}

export type DrawnFeatureKind =
  | 'point'
  | 'line'
  | 'polygon'
  | 'label'
  /** Distance along a path, in 3D and over the ground. */
  | 'measure'
  /** Height difference between two points, with its horizontal and 3D distance. */
  | 'height'
  /** Whether one point can be seen from another. */
  | 'line-of-sight';

/**
 * What a feature's on-map label shows.
 *
 * Either one of the fixed sources, or the id of one of the feature's own
 * attributes. It's a plain string rather than a discriminated union because
 * it is bound straight to a `<select>` value, and an attribute id is
 * already a unique token — wrapping that in an object would mean
 * serialising and parsing it on every change for no added safety.
 */
export type LabelSource = 'none' | 'name' | 'measurement' | (string & {});

/**
 * A shape the user has drawn, once it is finished.
 *
 * Follows the same shape as `ManagedImageryLayer` in map-services: the
 * user-meaningful data (name, attributes) sits alongside the live Cesium
 * objects that draw it, in one React-state record. Anything in here can be
 * edited after the fact — that is the point of the type existing at all,
 * rather than the entities being anonymous once drawn.
 */
export interface DrawnFeature {
  id: string;
  kind: DrawnFeatureKind;
  /** User-facing name. Defaults to something like "Polygon 2". */
  name: string;
  attributes: FeatureAttribute[];
  labelSource: LabelSource;
  visible: boolean;
  /** Vertices in the order placed. A point or label has exactly one. */
  positions: Cesium.Cartesian3[];
  /**
   * The live entities drawing this feature — a polygon has two (fill +
   * outline), a line of sight up to five. Each is tagged with the part it
   * plays; see `EntityPart` in drawnFeaturePresentation.ts.
   */
  entities: Cesium.Entity[];
  /**
   * The feature's computed readout: a point's elevation, a measured
   * distance or height, an analysis result. `null` for shapes with nothing
   * to measure (lines, polygons, labels).
   */
  measurement: string | null;
}

/** Label text for the fixed sources, in the order the editor offers them. */
export const FIXED_LABEL_SOURCES: { value: LabelSource; label: string }[] = [
  { value: 'none', label: 'No label' },
  { value: 'name', label: 'Name' },
];
