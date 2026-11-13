/** Creation rules match NamedQueryController.createQuery; never silently trim a name. */
export function validateNamedQueryName(name: string | null | undefined): string | null {
  if (!name) return 'named-query-error-name-required';
  if (/\s/.test(name)) return 'named-query-error-name-spaces';
  if (!/^[A-Za-z0-9_-]+$/.test(name)) return 'named-query-error-name-invalid';
  if (name.length > 120) return 'named-query-error-name-long';
  if (name === 'collections') return 'named-query-error-name-reserved';
  return null;
}

export function suggestNamedQueryName(name: string): string {
  const slug = name
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120)
    .replace(/^_+|_+$/g, '');
  return slug === 'collections' ? 'collections_query' : slug || 'named_query';
}
