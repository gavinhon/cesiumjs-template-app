/**
 * A layer's legend, in a shape neutral to whichever feature produced it.
 *
 * Shared because the feature that knows how to *fetch* a legend (map-services:
 * it knows WMS and ArcGIS) isn't the one that *shows* it (layer-manager),
 * and features don't import each other. Types only.
 */
export type LegendContent =
  /** Symbol images with labels — ArcGIS's `/legend`, or one WMS image per layer. */
  | { kind: 'items'; items: LegendItem[] }
  /**
   * Vector data the app draws in its own style (`--vector`), so its legend
   * is the app's swatches for the geometry types present, not the server's.
   */
  | { kind: 'vector'; geometries: VectorGeometry[] }
  /**
   * Symbols the app draws in colours of its own choosing — live traffic's
   * speed bands — each a line or point swatch in a CSS colour (a design
   * token, e.g. `var(--traffic-3)`).
   */
  | { kind: 'swatches'; items: LegendSwatch[] };

export interface LegendSwatch {
  label: string;
  /** A CSS colour, normally a design token: `var(--incident)`. */
  color: string;
  shape: 'line' | 'point';
}

export interface LegendItem {
  label: string;
  /** An image URL or a `data:` URI. */
  imageSrc: string;
  /** The sublayer it belongs to, for a service with several. */
  group?: string;
}

export type VectorGeometry = 'point' | 'line' | 'polygon';
