import type { SolrCoreConfig } from '../config/solr.config';

/** Only explicit, unambiguous scalar copies may back saved metadata filters. */
export function gridIndexBindings(core: SolrCoreConfig): Map<string, { field: string; tokens: string[] }> {
  const result = new Map<string, { field: string; tokens: string[] }>();
  for (const [id, field] of Object.entries(core.recordGraphqlFields ?? {})) {
    if (
      !id.startsWith('metadata:/') ||
      !/^[A-Za-z_][A-Za-z0-9_.-]{0,199}$/.test(field) ||
      field.startsWith('redbox_') ||
      ['id', 'storage_id', '__proto__', 'constructor', 'prototype'].includes(field)
    )
      continue;
    const tokens = id
      .slice('metadata:/'.length)
      .split('/')
      .map(token => token.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (tokens.some(token => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(token))) continue;
    const copies = (core.preIndex?.copy ?? []).filter(copy => copy.dest === field);
    if (copies.length !== 1 || copies[0].source !== `metadata.${tokens.join('.')}`) continue;
    result.set(id, { field, tokens });
  }
  return result;
}

export function gridSourceValue(metadata: object, tokens: readonly string[]): unknown {
  let value: unknown = metadata;
  for (const token of tokens) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, token);
    if (!descriptor || !('value' in descriptor)) return undefined;
    value = descriptor.value;
  }
  return value;
}
