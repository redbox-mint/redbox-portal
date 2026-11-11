import type { ApiRequestInput } from '../api-routes/types';
import { requestStrings } from './requestValues';

export const apiNoCacheHeaders = { 'Cache-Control': 'no-cache, private', Pragma: 'no-cache', Expires: '0' };

/** Preserve header/query negotiation, including the legacy mismatch/unknown fallback. */
export function apiVersion(input: ApiRequestInput): '1.0' | '2.0' {
  const text = (value: unknown) => (value == null ? undefined : String(value).trim().toLowerCase());
  const query = text(input.query?.apiVersion ?? input.query?.apiversion);
  const header = text(input.headers?.['x-redbox-api-version'] ?? input.headers?.['X-ReDBox-Api-Version']);
  if (query && header && query !== header) return '1.0';
  return (header ?? query ?? '1.0') === '2.0' ? '2.0' : '1.0';
}
/** The existing validation policy gives a nonempty header priority, even on conflict. */
export function validationApiVersion(input: ApiRequestInput): '1.0' | '2.0' {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
  return (text(input.headers?.['x-redbox-api-version']) || text(input.query?.apiVersion) || '1.0') === '2.0'
    ? '2.0'
    : '1.0';
}

// Present invalid values remain unknown versions, preserving the legacy v1
// fallback on conflicts. Never invoke a request object's conversion methods.
type VersionRequest = { readonly query?: unknown; readonly headers?: ApiRequestInput['headers'] };
export function apiVersionInput(input: VersionRequest, validation = false): ApiRequestInput {
  const extract = (value: unknown) => requestStrings(value) ?? (validation || value == null ? undefined : 'invalid');
  const query = input.query as Record<string, unknown> | undefined;
  return {
    headers: {
      'x-redbox-api-version': extract(
        input.headers?.['x-redbox-api-version'] ?? input.headers?.['X-ReDBox-Api-Version']
      ),
    },
    query: { apiVersion: extract(query?.apiVersion), apiversion: extract(query?.apiversion) },
  };
}
/** Also safe while constructing a fallback error, even for throwing accessors. */
export function safeApiVersion(input: VersionRequest): '1.0' | '2.0' {
  try {
    return apiVersion(apiVersionInput(input));
  } catch {
    return '1.0';
  }
}
export function safeValidationApiVersion(input: VersionRequest): '1.0' | '2.0' {
  try {
    return validationApiVersion(apiVersionInput(input, true));
  } catch {
    return '1.0';
  }
}
