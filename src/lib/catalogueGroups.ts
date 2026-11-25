export const CATALOGUE_GROUPS = {
  imagery: 'Maps and imagery',
  features: 'Features — points, lines and areas',
  models: '3D buildings and models',
  live: 'Live — updated every few minutes',
} as const;

export const CATALOGUE_GROUP_ORDER: readonly string[] = [
  CATALOGUE_GROUPS.imagery,
  CATALOGUE_GROUPS.features,
  CATALOGUE_GROUPS.models,
  CATALOGUE_GROUPS.live,
];
