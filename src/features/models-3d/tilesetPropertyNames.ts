export async function fetchPropertyNames(
  tilesetJson: unknown,
  tilesetUrl: string,
): Promise<Record<string, string>> {
  if (!tilesetJson || typeof tilesetJson !== 'object') return {};
  if ('schema' in tilesetJson) return propertyNamesFromSchema(tilesetJson.schema);
  if (!('schemaUri' in tilesetJson) || typeof tilesetJson.schemaUri !== 'string') return {};
  try {
    const base = new URL(tilesetUrl, window.location.href);
    const response = await fetch(new URL(tilesetJson.schemaUri, base));
    return response.ok ? propertyNamesFromSchema(await response.json()) : {};
  } catch {
    return {};
  }
}

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
