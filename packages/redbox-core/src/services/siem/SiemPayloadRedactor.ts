import type { SiemRedactionConfig } from '../../configmodels/SiemConfiguration';

const REDACTED = '[REDACTED]';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchesDenylist(keyPath: string, key: string, denylistedPaths: string[]): boolean {
  const lowerKey = key.toLowerCase();
  const lowerPath = keyPath.toLowerCase();
  return denylistedPaths.some((path) => {
    const lowerDenyPath = path.toLowerCase();
    if (lowerPath === lowerDenyPath || lowerKey === lowerDenyPath) {
      return true;
    }
    if (lowerDenyPath.endsWith('.*')) {
      const prefix = lowerDenyPath.slice(0, -2);
      return lowerPath === prefix || lowerPath.startsWith(`${prefix}.`);
    }
    return false;
  });
}

function redactValue(value: unknown, keyPath: string, config: SiemRedactionConfig): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => redactValue(item, `${keyPath}.${index}`, config));
  }
  if (!isPlainRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      const childPath = keyPath.length > 0 ? `${keyPath}.${key}` : key;
      if (matchesDenylist(childPath, key, config.denylistedPaths)) {
        return [key, REDACTED];
      }
      return [key, redactValue(item, childPath, config)];
    })
  );
}

export function limitPayloadSize<T>(value: T, maxPayloadBytes: number): T | Record<string, unknown> {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') <= maxPayloadBytes) {
    return value;
  }
  return {
    truncated: true,
    originalBytes: Buffer.byteLength(serialized, 'utf8'),
    preview: serialized.slice(0, Math.max(0, maxPayloadBytes - 128)),
  };
}

export function redactForSiem<T>(value: T, config: SiemRedactionConfig): T {
  return limitPayloadSize(redactValue(value, '', config), config.maxPayloadBytes) as T;
}
