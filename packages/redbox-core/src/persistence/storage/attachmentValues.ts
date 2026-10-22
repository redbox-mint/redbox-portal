import { normalizeAttachmentStagingFileId } from '../../AttachmentStagingIdentity';
import type { AttachmentMetadataInput, AttachmentAccessEvent, AttachmentAccessAuditInput } from './StorageRepositories';
import type { AttachmentRow as AttachmentMetadataAttributes } from './AttachmentRows';

// Shared legacy service normalization, before either model or driver field validation.
export function normalizeMetadataRow(row: AttachmentMetadataInput): Partial<AttachmentMetadataInput> {
  return {
    oid: String(row.oid ?? '').trim(),
    fileId: String(row.fileId ?? '').trim(),
    storageKey: String(row.storageKey ?? '').trim(),
    isJournal: row.isJournal === true,
    // Journal fields are only written when the caller supplies them, so an
    // ordinary metadata upsert cannot silently reset reconciliation state.
    ...journalRow(row),
    contentType: optionalString(row.contentType),
    contentLength: optionalNumber(row.contentLength),
    etag: optionalString(row.etag),
    lastModified: optionalDateString(row.lastModified),
    filename: optionalString(row.filename),
    mimeType: optionalString(row.mimeType),
    uploadedBy: optionalString(row.uploadedBy),
    attachmentField: optionalString(row.attachmentField),
    lastAccessedAt: optionalDateString(row.lastAccessedAt),
    lastAccessedBy: optionalString(row.lastAccessedBy),
    accessCount: optionalNumber(row.accessCount) ?? 0,
  };
}

function journalRow(row: AttachmentMetadataInput): Partial<AttachmentMetadataInput> {
  const journal: Partial<AttachmentMetadataInput> = {};
  const attachmentId = optionalIdentifier(row.attachmentId);
  if (attachmentId) {
    journal.attachmentId = attachmentId;
  }
  const operation = optionalOperation(row.operation);
  if (operation) {
    journal.operation = operation;
  }
  const mutationState = optionalMutationState(row.mutationState);
  if (mutationState) {
    journal.mutationState = mutationState;
  }
  const generation = optionalIdentifier(row.generation);
  if (generation) {
    journal.generation = generation;
  }
  const mutationFileId = normalizeAttachmentStagingFileId(row.mutationFileId);
  if (mutationFileId) {
    journal.mutationFileId = mutationFileId;
  }
  const coordinationToken = optionalIdentifier(row.coordinationToken);
  if (coordinationToken) {
    journal.coordinationToken = coordinationToken;
  }
  const attemptCount = optionalNumber(row.attemptCount);
  if (attemptCount !== undefined) {
    journal.attemptCount = attemptCount;
  }
  const lastAttemptAt = optionalDateString(row.lastAttemptAt);
  if (lastAttemptAt) {
    journal.lastAttemptAt = lastAttemptAt;
  }
  const lastSafeErrorCode = optionalIdentifier(row.lastSafeErrorCode);
  if (lastSafeErrorCode) {
    journal.lastSafeErrorCode = lastSafeErrorCode;
  }
  return journal;
}

export function optionalIdentifier(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(normalized) ? normalized : undefined;
}

export function optionalOperation(value: unknown): AttachmentMetadataAttributes['operation'] {
  return value === 'add' || value === 'finalize' || value === 'delete' ? value : undefined;
}

export function optionalMutationState(value: unknown): AttachmentMetadataAttributes['mutationState'] {
  return value === 'prepared' ||
    value === 'pending' ||
    value === 'applied' ||
    value === 'incomplete' ||
    value === 'unknown' ||
    value === 'cancelled' ||
    value === 'cleanup-pending' ||
    value === 'cleanup-checking' ||
    value === 'cleanup-removing' ||
    value === 'cleaned' ||
    value === 'staging-available' ||
    value === 'staging-preparing' ||
    value === 'staging-cleanup'
    ? value
    : undefined;
}

export function normalizeAccessEvent(event: AttachmentAccessEvent): AttachmentAccessAuditInput {
  return {
    oid: String(event.oid ?? '').trim(),
    fileId: optionalString(event.fileId),
    storageKey: optionalString(event.storageKey),
    action: String(event.action ?? '').trim(),
    accessedBy: optionalString(event.accessedBy),
    accessedAt: new Date().toISOString(),
    itemCount: optionalNumber(event.itemCount),
  };
}

export function optionalString(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : undefined;
}

export function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : undefined;
}

export function optionalDateString(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalizedDate = new Date(value as string | number | Date);
  return Number.isNaN(normalizedDate.getTime()) ? undefined : normalizedDate.toISOString();
}
