const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const API_KEY_PATTERN = /^(sk_live_|sk_test_)[A-Za-z0-9]+$/;
const URI_CREDENTIAL_PATTERN = /\/\/[^:\s]+:[^@\s]+@/;

export function redactSecret(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (
    /^Bearer\s+/i.test(trimmed) ||
    JWT_PATTERN.test(trimmed) ||
    API_KEY_PATTERN.test(trimmed) ||
    URI_CREDENTIAL_PATTERN.test(trimmed)
  ) {
    return 'REDACTED';
  }
  return value;
}

export function redactObject(value: unknown): unknown {
  return transformNestedValues(value, {
    referenceTracking: 'visited',
    onCircular: () => ({ value: '[Circular]', traverse: false }),
    transform: (entry, context) => {
      const normalizedKey = context.leaf.toLowerCase();
      if (
        normalizedKey.includes('token') ||
        normalizedKey.includes('authorization') ||
        normalizedKey.includes('secret') ||
        normalizedKey.includes('apikey') ||
        normalizedKey.includes('api_key') ||
        normalizedKey.includes('password') ||
        normalizedKey.includes('credential')
      ) {
        return { value: 'REDACTED', traverse: false };
      }
      const redacted = redactSecret(entry);
      return redacted === entry ? undefined : { value: redacted, traverse: false };
    },
  }).value;
}
import { transformNestedValues } from './NestedValueUtils';
