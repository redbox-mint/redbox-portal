import type { SecurityEventAttributes } from '../../waterline-models/SecurityEvent';
import type { SiemRedactionConfig } from '../../configmodels/SiemConfiguration';

const REDACTED = '[REDACTED]';
const CONTENT_FIELDS = ['actor', 'subject', 'resource', 'requestContext', 'payload'];
const SECRET_KEYS =
  /^(password|passwd|token|secret|authorization|cookie|set-cookie|api[-_]?key|x-api-key|access[-_]?token|refresh[-_]?token|client[-_]?secret)$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchesDenylist(path: string, key: string, denylist: string[]): boolean {
  return denylist.some(entry => {
    const pattern = entry.toLowerCase();
    return (
      key.toLowerCase() === pattern ||
      path.toLowerCase() === pattern ||
      (pattern.endsWith('.*') &&
        (path.toLowerCase() === pattern.slice(0, -2) || path.toLowerCase().startsWith(`${pattern.slice(0, -2)}.`)))
    );
  });
}

function redactValue(value: unknown, path: string, config: SiemRedactionConfig): unknown {
  const emailPattern = /^[^\s@<>()[\]{},;:"\\]+@[^\s@<>()[\]{},;:"\\]+\.[^\s@<>()[\]{},;:"\\]+$/;
  if (Array.isArray(value)) return value.map((item, index) => redactValue(item, `${path}.${index}`, config));
  if (!config.includeActorEmail && typeof value === 'string' && emailPattern.test(value)) return REDACTED;
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
    if (!config.includeActorEmail && typeof item === 'string' && emailPattern.test(item)) continue;
    // Audit sources repeat identity/request fields inside resource and payload. Exclude every copy.
    if (
      (!config.includeActorEmail && ['email', 'emailaddress', 'mail'].includes(normalizedKey)) ||
      (!config.includeIpAddress &&
        ['ip', 'ips', 'ipaddress', 'clientip', 'remoteaddress', 'xforwardedfor', 'forwarded', 'xrealip'].includes(
          normalizedKey
        )) ||
      (!config.includeUserAgent && normalizedKey === 'useragent')
    )
      continue;
    if (SECRET_KEYS.test(key) || matchesDenylist(childPath, key, config.denylistedPaths)) {
      result[key] = REDACTED;
    } else if (key === 'additionalAttributes' && typeof item === 'string') {
      // Only this known audit serialization boundary is decoded; arbitrary strings stay opaque.
      try {
        const parsed: unknown = JSON.parse(item);
        result[key] = isRecord(parsed) || Array.isArray(parsed) ? redactValue(parsed, childPath, config) : REDACTED;
      } catch {
        result[key] = REDACTED;
      }
    } else {
      result[key] = redactValue(item, childPath, config);
    }
  }
  return result;
}

function bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? 'null', 'utf8');
}

/** Canonical envelopes retain identity; content is replaced by an explicit marker when oversized. */
export function limitPayloadSize<T>(value: T, maxPayloadBytes: number): T | Record<string, unknown> {
  const originalBytes = bytes(value);
  if (originalBytes <= maxPayloadBytes) return value;
  const marker = { truncated: true, originalBytes };
  if (isRecord(value) && typeof value.eventType === 'string' && typeof value.brandId === 'string') {
    const envelope: Record<string, unknown> = { ...value };
    // Drop largest content first, preserving smaller useful fields when they fit.
    const fields = CONTENT_FIELDS.filter(key => envelope[key] !== undefined).sort(
      (a, b) => bytes(envelope[b]) - bytes(envelope[a])
    );
    envelope.payload = marker;
    for (const key of fields) {
      if (bytes(envelope) <= maxPayloadBytes) break;
      if (key !== 'payload') delete envelope[key];
    }
    if (bytes(envelope) > maxPayloadBytes) throw new RangeError('SIEM metadata exceeds payload byte limit');
    return envelope;
  }
  const limited: Record<string, unknown> = { ...marker, preview: '' };
  if (bytes(limited) > maxPayloadBytes) {
    if (bytes({ truncated: true }) > maxPayloadBytes)
      throw new RangeError('SIEM byte limit cannot fit truncation marker');
    return { truncated: true };
  }
  // Search the longest fitting serialized prefix, avoiding a split surrogate pair.
  const serialized = JSON.stringify(value) ?? '';
  let lower = 0;
  let upper = serialized.length;
  while (lower < upper) {
    const midpoint = Math.ceil((lower + upper) / 2);
    const preview = serialized.slice(0, midpoint).replace(/[\uD800-\uDBFF]$/, '');
    if (bytes({ ...limited, preview }) <= maxPayloadBytes) lower = midpoint;
    else upper = midpoint - 1;
  }
  limited.preview = serialized.slice(0, lower).replace(/[\uD800-\uDBFF]$/, '');
  return limited;
}

export function redactForSiem(value: SecurityEventAttributes, config: SiemRedactionConfig): SecurityEventAttributes;
export function redactForSiem(value: object, config: SiemRedactionConfig): Record<string, unknown>;
export function redactForSiem(
  value: object,
  config: SiemRedactionConfig
): Record<string, unknown> | SecurityEventAttributes {
  const redacted = redactValue(value, '', config);
  if (
    isRecord(value) &&
    isRecord(redacted) &&
    typeof value.eventType === 'string' &&
    typeof value.brandId === 'string'
  ) {
    // Selection/redaction cannot change the routing identity or canonical event taxonomy.
    for (const key of [
      'eventId',
      'brandId',
      'portalId',
      'eventType',
      'category',
      'severity',
      'occurredAt',
      'source',
      'correlationId',
      'traceId',
      'deliveryState',
    ]) {
      if (value[key] !== undefined) redacted[key] = value[key];
    }
  }
  if (!isRecord(redacted)) throw new TypeError('SIEM payload must be an object');
  return limitPayloadSize(redacted, config.maxPayloadBytes);
}
