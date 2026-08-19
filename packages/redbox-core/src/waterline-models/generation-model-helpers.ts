import { canonicalHash } from '../model/generation';
import { buildInvalidNewRecordError, buildInvalidUpdateRecordError } from '../decorators';

export type LifecycleCallback = (error?: Error) => void;

export function normalizedSlug(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function normalizeStableEntity(record: Record<string, unknown>, callback: LifecycleCallback): void {
  if (record.brandId !== undefined && !String(record.brandId).trim()) {
    callback(buildInvalidNewRecordError('brandId must not be empty'));
    return;
  }
  if (record.key !== undefined) {
    const key = normalizedSlug(record.key);
    if (!key) {
      callback(buildInvalidNewRecordError('key must not be empty'));
      return;
    }
    record.key = key;
  }
  if (record.name !== undefined) {
    const name = String(record.name).trim();
    if (!name) {
      callback(buildInvalidNewRecordError('name must not be empty'));
      return;
    }
    record.name = name;
    record.nameLower = name.toLowerCase();
  }
  callback();
}

export function normalizeVersion(
  record: Record<string, unknown>,
  callback: LifecycleCallback,
  contentField: string,
): void {
  const version = Number(record.version);
  const status = String(record.status ?? 'draft');
  if (!String(record.brandId ?? '').trim() || !Number.isInteger(version) || version < 1) {
    callback(buildInvalidNewRecordError('brandId and a positive integer version are required'));
    return;
  }
  if (!['draft', 'published', 'retired'].includes(status)) {
    callback(buildInvalidNewRecordError('status must be draft, published or retired'));
    return;
  }
  record.status = status;
  const content = record[contentField];
  if (content !== undefined) {
    record.contentHash = canonicalHash(content);
  }
  callback();
}

export function rejectPublishedUpdate(record: Record<string, unknown>, callback: LifecycleCallback): void {
  const publicationFields = new Set([
    'id', 'createdAt', 'updatedAt',
    'status', 'publishedBy', 'publishedAt', 'capabilitySnapshot', 'contentHash',
  ]);
  if (record.status === 'published' && Object.keys(record).some((key) => !publicationFields.has(key))) {
    callback(buildInvalidUpdateRecordError('Published generation configuration is immutable'));
    return;
  }
  callback();
}

export function containsEmbeddedSecret(value: unknown, parentKey = ''): boolean {
  const secretKeys = /(^|_)(api[-_]?key|token|password|authorization|secret[-_]?value)($|_)/i;
  if (secretKeys.test(parentKey)) {
    return value !== undefined && value !== null && String(value).trim() !== '';
  }
  if (Array.isArray(value)) {
    return value.some((child) => containsEmbeddedSecret(child));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(([key, child]) => containsEmbeddedSecret(child, key));
  }
  return false;
}
