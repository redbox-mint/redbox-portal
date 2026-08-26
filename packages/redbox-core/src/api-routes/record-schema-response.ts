export const RECORD_SCHEMA_RESPONSE_MEDIA_TYPE = 'application/schema+json' as const;
export const RECORD_SCHEMA_PROBLEM_MEDIA_TYPE = 'application/problem+json' as const;
export const RECORD_SCHEMA_RESPONSE_CACHE_CONTROL = 'private, no-cache' as const;
export const RECORD_SCHEMA_RESPONSE_VARY = 'Authorization' as const;

export function recordSchemaCanonicalLink(canonicalUrl: string): string {
  return `<${canonicalUrl}>; rel="canonical"; type="${RECORD_SCHEMA_RESPONSE_MEDIA_TYPE}"`;
}
