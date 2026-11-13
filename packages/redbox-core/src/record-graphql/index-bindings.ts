import type { SolrCoreConfig } from '../config/solr.config';

/** Context-free, prefix-preserving fold for every string; no Unicode normalization. */
export function foldAsciiCase(value: string): string {
  return value.replace(/[A-Z]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 32));
}

function safeDestination(field: string): boolean {
  return (
    /^[A-Za-z_][A-Za-z0-9_.-]{0,199}$/.test(field) &&
    !field.startsWith('redbox_') &&
    !['id', 'storage_id', '__proto__', 'constructor', 'prototype'].includes(field)
  );
}

/** Only explicit, unambiguous scalar copies may back saved metadata filters. */
export function gridIndexBindings(core: SolrCoreConfig): Map<string, { field: string; tokens: string[] }> {
  const result = new Map<string, { field: string; tokens: string[] }>();
  for (const [id, field] of Object.entries(core.recordGraphqlFields ?? {})) {
    if (!id.startsWith('metadata:/') || !safeDestination(field)) continue;
    const tokens = id
      .slice('metadata:/'.length)
      .split('/')
      .map(token => token.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (
      tokens.some(
        token => !/^[A-Za-z_][A-Za-z0-9_:-]*$/.test(token) || ['__proto__', 'constructor', 'prototype'].includes(token)
      )
    )
      continue;
    const copies = (core.preIndex?.copy ?? []).filter(copy => copy.dest === field);
    if (copies.length !== 1 || copies[0].source !== `metadata.${tokens.join('.')}`) continue;
    result.set(id, { field, tokens });
  }
  return result;
}

/** Configuration safety only; discovery additionally verifies the live schema/copy rules. */
export function gridPrefixIndexBindings(core: SolrCoreConfig): Map<string, { field: string; tokens: string[] }> {
  const result = new Map<string, { field: string; tokens: string[] }>();
  const primary = gridIndexBindings(core);
  const rawTargets = Object.values(core.recordGraphqlFields ?? {});
  const prefixTargets = Object.values(core.recordGraphqlCaseInsensitivePrefixFields ?? {});
  for (const [id, field] of Object.entries(core.recordGraphqlCaseInsensitivePrefixFields ?? {})) {
    const source = primary.get(id);
    const definition = (core.schema['add-field'] ?? []).filter(item => item.name === field);
    if (
      !source ||
      !safeDestination(field) ||
      rawTargets.includes(field) ||
      rawTargets.filter(target => target === source.field).length !== 1 ||
      prefixTargets.filter(target => target === field).length !== 1 ||
      definition.length !== 1 ||
      definition[0].indexed !== true ||
      definition[0].multiValued !== false ||
      definition[0].required === true ||
      definition[0].default !== undefined
    )
      continue;
    result.set(id, { field, tokens: source.tokens });
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
