import { normalizePersistenceField } from '../scalars';
import { persistenceStringTimestamps } from '../timestamps';
import { persistenceObjectId } from '../mongodb/identity';
import { ObjectId } from 'mongodb';
import type { Document } from 'mongodb';
import { PersistenceError } from '../errors';
import { assertJsonValue } from '../cache/validation';
import { attachmentFields } from './attachmentFields';
import { normalizeAttachmentMetadata } from './attachmentNormalization';

function validateJson(value: unknown, code: string): void {
  try {
    assertJsonValue(value);
  } catch {
    throw new PersistenceError(
      code,
      'Attachment fields require finite plain JSON values. Review the stored data and migrate institution extensions before startup; inventory unsupported legacy values.'
    );
  }
}
type Field = {
  type: string;
  required?: boolean;
  allowNull?: boolean;
  defaultsTo?: unknown;
  validations?: { isIn?: readonly string[] };
};
export function attachmentObjectId(value: unknown): ObjectId {
  try {
    return persistenceObjectId(value, true);
  } catch {
    throw new PersistenceError('storage-codec', 'Attachment identity must be an opaque stored identifier.');
  }
}
function encode(collection: keyof typeof attachmentFields, values: object, patch: boolean): Document {
  const descriptors = Object.getOwnPropertyDescriptors(values),
    input: Document = {};
  if (Object.getPrototypeOf(values) !== Object.prototype && Object.getPrototypeOf(values) !== null)
    throw new PersistenceError('storage-validation', 'Attachment writes require plain data properties.');
  for (const [name, descriptor] of Object.entries(descriptors)) {
    if (!('value' in descriptor) || !descriptor.enumerable)
      throw new PersistenceError('storage-validation', 'Attachment writes require plain data properties.');
    if (descriptor.value !== undefined) input[name] = descriptor.value;
  }
  if (collection === 'attachmentmetadata') {
    try {
      normalizeAttachmentMetadata(input, !patch);
    } catch {
      throw new PersistenceError('storage-validation', 'Attachment normalization or validation failed.');
    }
  }
  const fields: Record<string, Field> = attachmentFields[collection];
  const output: Document = {};
  for (const [name, spec] of Object.entries(fields)) {
    let value: unknown;
    try {
      value = normalizePersistenceField(
        input[name],
        {
          type: spec.type,
          required: spec.required,
          nullable: Boolean(spec.allowNull || spec.validations?.isIn),
          ...(Object.hasOwn(spec, 'defaultsTo') ? { default: spec.defaultsTo } : {}),
        },
        patch
      );
    } catch {
      throw new PersistenceError('storage-validation', 'Attachment field type or required value is invalid.');
    }
    if (value === undefined) continue;
    if (value !== null && spec.validations?.isIn && !spec.validations.isIn.includes(String(value)))
      throw new PersistenceError('storage-validation', 'Attachment enumeration is invalid.');
    output[name] = value;
  }
  validateJson(output, 'storage-validation');
  Object.assign(output, persistenceStringTimestamps({}, patch));
  return output;
}
export const encodeAttachment = (values: object, patch: boolean): Document =>
  encode('attachmentmetadata', values, patch);
export const encodeAttachmentAudit = (values: object): Document => encode('attachmentaccessaudit', values, false);
