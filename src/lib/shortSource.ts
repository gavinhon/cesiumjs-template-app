export function shortSource(source: string): string {
  const parts = source.split('/');
  if (parts.length <= 4) return source;
  const service = parts.findIndex((part) => /Server$/i.test(part));
  const tail = service > 0 ? parts.slice(service - 1) : parts.slice(-2);
  return `${parts[0]}/…/${tail.join('/')}`;
}
