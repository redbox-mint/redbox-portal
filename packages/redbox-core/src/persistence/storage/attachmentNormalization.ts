import { buildInvalidNewRecordError, buildInvalidUpdateRecordError } from '../validationErrors';
const normalizeRequiredString = (
  record: Record<string, unknown>,
  field: 'oid' | 'fileId' | 'storageKey',
  isCreate: boolean
): void => {
  const value = String(record[field] ?? '').trim();
  const hasFieldProp = Object.hasOwn(record, field);
  const hasFieldValue = record[field] !== undefined && record[field] !== null;

  if (isCreate && !value) {
    throw buildInvalidNewRecordError(`AttachmentMetadata.${field} is required`);
  }

  if (!isCreate && (hasFieldProp || hasFieldValue) && !value) {
    throw buildInvalidUpdateRecordError(`AttachmentMetadata.${field} is required`);
  }

  if (hasFieldProp || hasFieldValue) {
    record[field] = value;
  }
};

export const normalizeAttachmentMetadata = (record: Record<string, unknown>, isCreate: boolean): void => {
  normalizeRequiredString(record, 'oid', isCreate);
  normalizeRequiredString(record, 'fileId', isCreate);
  normalizeRequiredString(record, 'storageKey', isCreate);

  if (Object.hasOwn(record, 'accessCount')) {
    const accessCount = Number(record.accessCount ?? 0);
    record.accessCount = Number.isFinite(accessCount) ? accessCount : 0;
  }
  if (Object.hasOwn(record, 'isJournal')) {
    record.isJournal = record.isJournal === true;
  }

  if (Object.hasOwn(record, 'attachmentId') && record.attachmentId != null) {
    const attachmentId = String(record.attachmentId).trim();
    if (attachmentId && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(attachmentId)) {
      throw (isCreate ? buildInvalidNewRecordError : buildInvalidUpdateRecordError)(
        'AttachmentMetadata.attachmentId must be a bounded identifier'
      );
    }
    record.attachmentId = attachmentId || undefined;
  }

  if (Object.hasOwn(record, 'operation')) {
    const operation = String(record.operation ?? '').trim();
    if (operation && !['add', 'finalize', 'delete'].includes(operation)) {
      throw (isCreate ? buildInvalidNewRecordError : buildInvalidUpdateRecordError)(
        'AttachmentMetadata.operation is invalid'
      );
    }
    record.operation = operation || undefined;
  }

  if (Object.hasOwn(record, 'mutationState')) {
    const mutationState = String(record.mutationState ?? '').trim();
    if (
      mutationState &&
      ![
        'prepared',
        'pending',
        'applied',
        'incomplete',
        'unknown',
        'cancelled',
        'cleanup-pending',
        'cleanup-checking',
        'cleanup-removing',
        'cleaned',
        'staging-available',
        'staging-preparing',
        'staging-cleanup',
      ].includes(mutationState)
    ) {
      throw (isCreate ? buildInvalidNewRecordError : buildInvalidUpdateRecordError)(
        'AttachmentMetadata.mutationState is invalid'
      );
    }
    record.mutationState = mutationState || undefined;
  }

  if (Object.hasOwn(record, 'generation') && record.generation != null) {
    record.generation = String(record.generation).trim().slice(0, 128) || undefined;
  }
  if (Object.hasOwn(record, 'mutationFileId') && record.mutationFileId != null) {
    record.mutationFileId = String(record.mutationFileId).trim() || undefined;
  }
  if (Object.hasOwn(record, 'coordinationToken') && record.coordinationToken != null) {
    const coordinationToken = String(record.coordinationToken).trim();
    if (coordinationToken && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(coordinationToken)) {
      throw (isCreate ? buildInvalidNewRecordError : buildInvalidUpdateRecordError)(
        'AttachmentMetadata.coordinationToken must be a bounded identifier'
      );
    }
    record.coordinationToken = coordinationToken || undefined;
  }
  if (Object.hasOwn(record, 'attemptCount')) {
    const attemptCount = Number(record.attemptCount ?? 0);
    record.attemptCount = Number.isFinite(attemptCount) && attemptCount >= 0 ? Math.floor(attemptCount) : 0;
  }
  if (Object.hasOwn(record, 'lastAttemptAt') && record.lastAttemptAt != null) {
    const timestamp = new Date(record.lastAttemptAt as string | number | Date);
    record.lastAttemptAt = Number.isNaN(timestamp.getTime()) ? undefined : timestamp.toISOString();
  }
  if (Object.hasOwn(record, 'coordinationLeaseExpiresAt') && record.coordinationLeaseExpiresAt != null) {
    const timestamp = new Date(record.coordinationLeaseExpiresAt as string | number | Date);
    record.coordinationLeaseExpiresAt = Number.isNaN(timestamp.getTime()) ? undefined : timestamp.toISOString();
  }
  if (Object.hasOwn(record, 'lastSafeErrorCode') && record.lastSafeErrorCode != null) {
    record.lastSafeErrorCode = String(record.lastSafeErrorCode).trim().slice(0, 128) || undefined;
  }
};
