/**
 * A long service URL cut to the part that tells services apart: the host,
 * then the service's own name. Every ArcGIS Online URL shares a long
 * `…/arcgis/rest/services/` middle, which is all an end-ellipsis would
 * leave visible. The full URL stays in the tooltip.
 */
export function shortSource(source: string): string {
  const parts = source.split('/');
  if (parts.length <= 4) return source;
  const service = parts.findIndex((part) => /Server$/i.test(part));
  const tail = service > 0 ? parts.slice(service - 1) : parts.slice(-2);
  return `${parts[0]}/…/${tail.join('/')}`;
}
