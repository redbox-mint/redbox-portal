/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeUpdate, Entity, buildInvalidNewRecordError, buildInvalidUpdateRecordError, toWaterlineModelDef } from '../decorators';

const normalizeRequiredString = (
  record: Record<string, unknown>,
  field: 'oid' | 'fileId' | 'storageKey',
  isCreate: boolean,
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

const requiredTrimmedStringValidation = (field: 'oid' | 'fileId' | 'storageKey') => (value: unknown): boolean => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`AttachmentMetadata.${field} is required`);
  }

  return true;
};

const normalize = (record: Record<string, unknown>, isCreate: boolean): void => {
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

  if (Object.hasOwn(record, 'operation') && record.operation != null
    && !['add', 'finalize', 'delete'].includes(String(record.operation))) {
    throw (isCreate ? buildInvalidNewRecordError : buildInvalidUpdateRecordError)(
      'AttachmentMetadata.operation is invalid'
    );
  }

  if (Object.hasOwn(record, 'mutationState') && record.mutationState != null
    && !['prepared', 'pending', 'applied', 'incomplete', 'unknown', 'cancelled'].includes(String(record.mutationState))) {
    throw (isCreate ? buildInvalidNewRecordError : buildInvalidUpdateRecordError)(
      'AttachmentMetadata.mutationState is invalid'
    );
  }

  if (Object.hasOwn(record, 'generation') && record.generation != null) {
    record.generation = String(record.generation).trim().slice(0, 128) || undefined;
  }
  if (Object.hasOwn(record, 'mutationFileId') && record.mutationFileId != null) {
    record.mutationFileId = String(record.mutationFileId).trim() || undefined;
  }
  if (Object.hasOwn(record, 'attemptCount')) {
    const attemptCount = Number(record.attemptCount ?? 0);
    record.attemptCount = Number.isFinite(attemptCount) && attemptCount >= 0 ? Math.floor(attemptCount) : 0;
  }
  if (Object.hasOwn(record, 'lastAttemptAt') && record.lastAttemptAt != null) {
    const timestamp = new Date(record.lastAttemptAt as string | number | Date);
    record.lastAttemptAt = Number.isNaN(timestamp.getTime()) ? undefined : timestamp.toISOString();
  }
  if (Object.hasOwn(record, 'lastSafeErrorCode') && record.lastSafeErrorCode != null) {
    record.lastSafeErrorCode = String(record.lastSafeErrorCode).trim().slice(0, 128) || undefined;
  }
};

const beforeCreate = (record: Record<string, unknown>, cb: (err?: Error) => void): void => {
  try {
    normalize(record, true);
    cb();
  } catch (err) {
    cb(err as Error);
  }
};

const beforeUpdate = (record: Record<string, unknown>, cb: (err?: Error) => void): void => {
  try {
    normalize(record, false);
    cb();
  } catch (err) {
    cb(err as Error);
  }
};

@BeforeCreate(beforeCreate)
@BeforeUpdate(beforeUpdate)
@Entity('attachmentmetadata', {
  indexes: [
    { attributes: { storageKey: 1 }, unique: true },
    { attributes: { oid: 1, fileId: 1 }, unique: true },
    { attributes: { oid: 1 } },
  ]
})
export class AttachmentMetadataClass {
  @Attr({ type: 'string', required: true, validations: { custom: requiredTrimmedStringValidation('oid') } })
  public oid!: string;

  @Attr({ type: 'string', required: true, validations: { custom: requiredTrimmedStringValidation('fileId') } })
  public fileId!: string;

  @Attr({ type: 'string', required: true, unique: true, validations: { custom: requiredTrimmedStringValidation('storageKey') } })
  public storageKey!: string;

  @Attr({ type: 'boolean', defaultsTo: false })
  public isJournal?: boolean;

  @Attr({ type: 'string' })
  public attachmentId?: string;

  @Attr({ type: 'string', isIn: ['add', 'finalize', 'delete'] })
  public operation?: 'add' | 'finalize' | 'delete';

  @Attr({ type: 'string', isIn: ['prepared', 'pending', 'applied', 'incomplete', 'unknown', 'cancelled'] })
  public mutationState?: 'prepared' | 'pending' | 'applied' | 'incomplete' | 'unknown' | 'cancelled';

  @Attr({ type: 'string' })
  public generation?: string;

  @Attr({ type: 'string' })
  public mutationFileId?: string;

  @Attr({ type: 'number', defaultsTo: 0 })
  public attemptCount?: number;

  @Attr({ type: 'string', columnType: 'datetime' })
  public lastAttemptAt?: string;

  @Attr({ type: 'string' })
  public lastSafeErrorCode?: string;

  @Attr({ type: 'string' })
  public contentType?: string;

  @Attr({ type: 'number' })
  public contentLength?: number;

  @Attr({ type: 'string' })
  public etag?: string;

  @Attr({ type: 'string', columnType: 'datetime' })
  public lastModified?: string;

  @Attr({ type: 'string' })
  public filename?: string;

  @Attr({ type: 'string' })
  public mimeType?: string;

  @Attr({ type: 'string' })
  public uploadedBy?: string;

  @Attr({ type: 'string' })
  public attachmentField?: string;

  @Attr({ type: 'string', columnType: 'datetime' })
  public lastAccessedAt?: string;

  @Attr({ type: 'string' })
  public lastAccessedBy?: string;

  @Attr({ type: 'number', defaultsTo: 0 })
  public accessCount?: number;
}

export const AttachmentMetadataWLDef = toWaterlineModelDef(AttachmentMetadataClass);

export interface AttachmentMetadataAttributes extends Sails.WaterlineAttributes {
  accessCount?: number;
  attachmentId?: string;
  operation?: 'add' | 'finalize' | 'delete';
  mutationState?: 'prepared' | 'pending' | 'applied' | 'incomplete' | 'unknown' | 'cancelled';
  generation?: string;
  isJournal?: boolean;
  mutationFileId?: string;
  attemptCount?: number;
  lastAttemptAt?: string | Date;
  lastSafeErrorCode?: string;
  attachmentField?: string;
  contentLength?: number;
  contentType?: string;
  etag?: string;
  fileId: string;
  filename?: string;
  lastAccessedAt?: string | Date;
  lastAccessedBy?: string;
  lastModified?: string | Date;
  mimeType?: string;
  oid: string;
  storageKey: string;
  uploadedBy?: string;
}

export interface AttachmentMetadataWaterlineModel extends Sails.Model<AttachmentMetadataAttributes> {
  attributes: AttachmentMetadataAttributes;
}

declare global {
  const AttachmentMetadata: AttachmentMetadataWaterlineModel;
}
