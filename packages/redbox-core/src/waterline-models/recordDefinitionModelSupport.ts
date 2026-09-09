import {
  RECORD_DEFINITION_CANONICAL_HASH_PATTERN,
  parseRecordDefinitionBrandId,
  parseRecordDefinitionKey,
} from '@researchdatabox/sails-ng-common';
import {
  deriveRecordDefinitionDraftId,
  deriveRecordDefinitionId,
  deriveRecordDefinitionRevisionId,
} from '../record-workflow-administration';
import { deriveStableActionSecretSlotId, parseActionBindingId } from '../action-registry';
import { buildInvalidNewRecordError, buildInvalidUpdateRecordError } from '../decorators';
import type { LifecycleHandler } from '../decorators/types';
import type { RuntimeRecord, RuntimeValue } from '../runtimeValues';

export const isNonNegativeSafeInteger = (value: RuntimeValue): boolean =>
  Number.isSafeInteger(value) && Number(value) >= 0;

export const isPositiveSafeInteger = (value: RuntimeValue): boolean =>
  Number.isSafeInteger(value) && Number(value) >= 1;

export const isCanonicalHash = (value: RuntimeValue): boolean =>
  typeof value === 'string' && RECORD_DEFINITION_CANONICAL_HASH_PATTERN.test(value);

export interface CanonicalOwner {
  readonly brandId: string;
  readonly recordTypeKey: string;
  readonly recordTypeId: string;
}

export function assertReportOwnership(
  record: RuntimeRecord,
  field: string,
  owner: CanonicalOwner,
  modelName: string
): void {
  const report = record[field];
  if (report == null || typeof report !== 'object' || Array.isArray(report)) {
    return;
  }
  const reportOwner = report as RuntimeRecord;
  if (reportOwner.brandId !== owner.brandId || reportOwner.recordTypeKey !== owner.recordTypeKey) {
    throw buildInvalidNewRecordError(`${modelName}.${field} does not belong to the row owner`);
  }
}

function requiredString(record: RuntimeRecord, field: string, modelName: string): string {
  const value = typeof record[field] === 'string' ? record[field] : '';
  if (!value) {
    throw buildInvalidNewRecordError(`${modelName}.${field} is required`);
  }
  return value;
}

export function canonicalOwner(record: RuntimeRecord, modelName: string): CanonicalOwner {
  const brandId = parseRecordDefinitionBrandId(requiredString(record, 'branding', modelName));
  const recordTypeKey = parseRecordDefinitionKey(requiredString(record, 'recordTypeKey', modelName));
  const expectedRecordTypeId = deriveRecordDefinitionId({ brandId, recordTypeKey });
  const recordTypeId = requiredString(record, 'recordTypeId', modelName);
  if (recordTypeId !== expectedRecordTypeId) {
    throw buildInvalidNewRecordError(`${modelName}.recordTypeId does not own the supplied brand and record-type key`);
  }
  return { brandId, recordTypeKey, recordTypeId };
}

export function assertCanonicalDraftIdentity(record: RuntimeRecord, modelName: string): CanonicalOwner {
  const owner = canonicalOwner(record, modelName);
  const expectedId = deriveRecordDefinitionDraftId(owner);
  if (requiredString(record, 'id', modelName) !== expectedId) {
    throw buildInvalidNewRecordError(`${modelName}.id is not canonical for its owner`);
  }

  const baseRevisionId = record.baseRevisionId;
  const baseRevisionNumber = record.baseRevisionNumber;
  if ((baseRevisionId == null) !== (baseRevisionNumber == null)) {
    throw buildInvalidNewRecordError(`${modelName}.baseRevisionId and baseRevisionNumber must be present together`);
  }
  if (baseRevisionId != null) {
    if (!isPositiveSafeInteger(baseRevisionNumber)) {
      throw buildInvalidNewRecordError(`${modelName}.baseRevisionNumber must be a positive safe integer`);
    }
    const expectedRevisionId = deriveRecordDefinitionRevisionId(owner, Number(baseRevisionNumber));
    if (baseRevisionId !== expectedRevisionId) {
      throw buildInvalidNewRecordError(`${modelName}.baseRevisionId is not canonical for its owner`);
    }
  }
  return owner;
}

export function assertCanonicalRevisionIdentity(
  record: RuntimeRecord,
  modelName: string,
  idField: 'id' | 'revision' = 'id'
): CanonicalOwner {
  const owner = canonicalOwner(record, modelName);
  const revisionNumber = record.revisionNumber;
  if (!isPositiveSafeInteger(revisionNumber)) {
    throw buildInvalidNewRecordError(`${modelName}.revisionNumber must be a positive safe integer`);
  }
  const expectedId = deriveRecordDefinitionRevisionId(owner, Number(revisionNumber));
  if (requiredString(record, idField, modelName) !== expectedId) {
    throw buildInvalidNewRecordError(`${modelName}.${idField} is not canonical for its owner`);
  }
  return owner;
}

export function assertCanonicalSecretIdentity(record: RuntimeRecord, modelName: string): CanonicalOwner {
  const owner = canonicalOwner(record, modelName);
  const bindingId = parseActionBindingId(requiredString(record, 'bindingId', modelName));
  const parameterName = requiredString(record, 'parameterName', modelName);
  const expectedId = deriveStableActionSecretSlotId({
    brandId: owner.brandId,
    recordTypeKey: owner.recordTypeKey,
    bindingId,
    parameterName,
  });
  if (requiredString(record, 'id', modelName) !== expectedId) {
    throw buildInvalidNewRecordError(`${modelName}.id is not canonical for its owner and action binding`);
  }
  return owner;
}

export function synchronousCreateHook(validate: (record: RuntimeRecord) => void): LifecycleHandler {
  return (record, proceed): void => {
    try {
      validate(record);
      proceed();
    } catch (error) {
      proceed(error instanceof Error ? error : new Error(String(error)));
    }
  };
}

export function rejectImmutableFields(modelName: string, fields: readonly string[]): LifecycleHandler {
  return (record, proceed): void => {
    const changedField = fields.find(field => Object.hasOwn(record, field));
    proceed(
      changedField === undefined
        ? undefined
        : buildInvalidUpdateRecordError(`${modelName}.${changedField} is immutable`)
    );
  };
}

export function rejectImmutableRow(modelName: string, operation: 'updated' | 'deleted'): LifecycleHandler {
  return (_record, proceed): void => {
    proceed(buildInvalidUpdateRecordError(`${modelName} rows cannot be ${operation}`));
  };
}
