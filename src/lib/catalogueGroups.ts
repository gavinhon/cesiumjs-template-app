/**
 * The headings the data catalogue is grouped under, in display order — by
 * what the data *is*, not the protocol it arrives over.
 *
 * People look for "the rail lines" or "the buildings", not for "an ArcGIS
 * FeatureServer" or "an I3S scene layer"; the format is still on every row
 * as a badge for those who care. The old split — a Map Services panel and a
 * 3D Tiles panel — was by protocol, and "3D Tiles" was simply wrong for a
 * panel that also loads I3S.
 *
 * Shared because two features feed the catalogue (map services and 3D
 * models) and neither may import the other.
 */
export const CATALOGUE_GROUPS = {
  imagery: 'Maps and imagery',
  features: 'Features — points, lines and areas',
  models: '3D buildings and models',
} as const;

/** The headings in the order they're listed. */
export const CATALOGUE_GROUP_ORDER: readonly string[] = [
  CATALOGUE_GROUPS.imagery,
  CATALOGUE_GROUPS.features,
  CATALOGUE_GROUPS.models,
];
