/**
 * A dataset the search box can find and add — one of the quick-add entries
 * from the Add data catalogue.
 *
 * Declared here, in the shape search needs, rather than imported from the
 * features that own the datasets: features don't import each other
 * (docs/coding-conventions.md). `App` maps each feature's catalogue into
 * this, the same way it feeds the layer manager.
 */
export interface SearchableDataset {
  id: string;
  name: string;
  /** Format tag, e.g. "ARCGIS", "I3S". */
  badge: string;
  /** The heading it's listed under in its panel, e.g. "Examples · ArcGIS MapServer". */
  group: string;
  isAdded: boolean;
  /** Puts it on the map. A rejection is shown in the search results. */
  add: () => Promise<void>;
}
