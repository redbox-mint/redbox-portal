import { createHash } from 'node:crypto';

export const PUBLICATION_SOURCE_ENCODING = 1;
/** Versioned JSON encoding: object order is irrelevant; array order is significant. */
export function canonicalPublicationJson(value: unknown): string {
  const ancestors = new Set<object>();
  const encode = (item: unknown): string => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number' && Number.isFinite(item)) return JSON.stringify(item);
    if (typeof item !== 'object' || item === null || ancestors.has(item))
      throw new Error('Publication inputs must be finite, acyclic JSON');
    ancestors.add(item);
    try {
      if (Array.isArray(item)) {
        if (Object.keys(item).length !== item.length) throw new Error('Sparse publication arrays are unsupported');
        return `[${item.map(encode).join(',')}]`;
      }
      if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null)
        throw new Error('Publication inputs must be plain JSON objects');
      return `{${Object.keys(item)
        .sort()
        .map(key => `${JSON.stringify(key)}:${encode(Reflect.get(item, key))}`)
        .join(',')}}`;
    } finally {
      ancestors.delete(item);
    }
  };
  return encode(value);
}
export function publicationDigest(value: unknown): string {
  return createHash('sha256')
    .update(`publication-json-v${PUBLICATION_SOURCE_ENCODING}\n`)
    .update(canonicalPublicationJson(value))
    .digest('hex');
}
export function byteDigest(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Conservative storage fingerprint for save-outcome verification, separate from the sealed provider descriptor. */
export function publicationRecordDigest(record: Record<string, unknown>): string {
  return publicationDigest(
    recordJson(
      Object.fromEntries(
        ['metadata', 'metaMetadata', 'workflow', 'authorization', 'harvestId']
          .filter(key => record[key] !== undefined)
          .map(key => [key, record[key]])
      )
    )
  );
}

/** Server-built record models contain optional undefined values; BSON stores these as null. */
function recordJson(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    if (ancestors.has(value)) throw new Error('Publication inputs must be finite, acyclic JSON');
    ancestors.add(value);
    try {
      if (Array.isArray(value)) return value.map(item => recordJson(item, ancestors));
      if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, recordJson(item, ancestors)]));
    } finally {
      ancestors.delete(value);
    }
  }
  return value;
}

/** Save bookkeeping cannot confer a new content approval. No mapped metadata or stage is exempt. */
export function publicationContentRecord(record: Record<string, unknown>): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const key of ['metadata', 'metaMetadata', 'workflow', 'authorization', 'harvestId']) {
    if (record[key] !== undefined) content[key] = recordJson(record[key]);
  }
  const meta = content.metaMetadata;
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    for (const key of ['lastSaveDate', 'lastSavedBy']) Reflect.deleteProperty(meta, key);
  }
  return content;
}
export function publicationContentDigest(record: Record<string, unknown>): string {
  return publicationDigest(publicationContentRecord(record));
}
