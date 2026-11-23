/**
 * The display names of a tileset's per-feature properties, keyed by
 * property id — "Pset_WallCommon_IsExternal" for `psetWallCommonIsExternal`.
 *
 * 3D Tiles 1.1 describes per-feature metadata with a schema: each class
 * property has an id (what `Cesium3DTileFeature.getProperty` takes) and,
 * optionally, a human `name`. A BIM conversion puts the IFC names there.
 * Cesium reads the schema but doesn't expose it publicly, so it's read
 * here from the tileset.json the app already fetches — inline as
 * `schema`, or by reference as `schemaUri`.
 *
 * Pure apart from the one fetch, and never throws: a model without names
 * still shows its attributes, under their ids.
 */
export async function fetchPropertyNames(
  tilesetJson: unknown,
  tilesetUrl: string,
): Promise<Record<string, string>> {
  if (!tilesetJson || typeof tilesetJson !== 'object') return {};
  if ('schema' in tilesetJson) return propertyNamesFromSchema(tilesetJson.schema);
  if (!('schemaUri' in tilesetJson) || typeof tilesetJson.schemaUri !== 'string') return {};
  try {
    // Relative to the tileset.json, which may itself be relative to the page.
    const base = new URL(tilesetUrl, window.location.href);
    const response = await fetch(new URL(tilesetJson.schemaUri, base));
    return response.ok ? propertyNamesFromSchema(await response.json()) : {};
  } catch {
    return {};
  }
}

/** Property id → name, across every class in a 3D Tiles metadata schema. */
export function propertyNamesFromSchema(schema: unknown): Record<string, string> {
  const names: Record<string, string> = {};
  if (!schema || typeof schema !== 'object' || !('classes' in schema)) return names;
  const { classes } = schema;
  if (!classes || typeof classes !== 'object') return names;
  for (const metadataClass of Object.values(classes)) {
    if (!metadataClass || typeof metadataClass !== 'object' || !('properties' in metadataClass)) {
      continue;
    }
    const { properties } = metadataClass;
    if (!properties || typeof properties !== 'object') continue;
    for (const [id, property] of Object.entries(properties)) {
      if (
        property &&
        typeof property === 'object' &&
        'name' in property &&
        typeof property.name === 'string' &&
        !(id in names)
      ) {
        names[id] = property.name;
      }
    }
  }
  return names;
}
