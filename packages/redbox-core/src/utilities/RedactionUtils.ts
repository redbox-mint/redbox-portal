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

export function redactObject(value: unknown, visited: WeakSet<object> = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    if (visited.has(value)) {
      return '[Circular]';
    }
    visited.add(value);
    return value.map((entry) => redactObject(entry, visited));
  }
  if (value != null && typeof value === 'object') {
    if (visited.has(value)) {
      return '[Circular]';
    }
    visited.add(value);
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(obj)) {
      const normalizedKey = key.toLowerCase();
      if (normalizedKey.includes('token') || normalizedKey.includes('authorization') || normalizedKey.includes('secret')) {
        result[key] = 'REDACTED';
      } else {
        result[key] = redactObject(entry, visited);
      }
    }
    return result;
  }
  return redactSecret(value);
}
