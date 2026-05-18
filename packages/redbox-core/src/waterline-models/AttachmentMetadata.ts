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
