import { RECORD_CONTRACT_FORMAT_V1, RECORD_SCHEMA_PROBLEM_CODES } from '@researchdatabox/redbox-core';
import type {
  ContractJsonObject,
  ContractJsonValue,
  RecordSchemaArtifactInput,
  RecordSchemaArtifactModel,
  RecordSchemaReferenceInput,
  RecordSchemaReferenceModel,
} from '@researchdatabox/redbox-core';
import type { Document } from 'mongodb';

import { RECORD_SCHEMA_DIGEST_PATTERN } from '../models/RecordSchemaArtifact';
import { RECORD_SCHEMA_REFERENCE_KEY_PATTERN } from '../models/RecordSchemaReference';

export const RECORD_SCHEMA_REFERENCE_QUERY_LIMIT_MAX = 1_000;

export const RECORD_SCHEMA_STORAGE_CODES = {
  INVALID_ARTIFACT: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
  DIGEST_COLLISION: RECORD_SCHEMA_PROBLEM_CODES.DIGEST_COLLISION,
  INVALID_REFERENCE: 'record-schema.reference-invalid',
  REFERENCE_KEY_COLLISION: 'record-schema.reference-key-collision',
  ARTIFACT_NOT_FOUND: 'record-schema.artifact-not-found',
  STORAGE_FAILED: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
} as const;

export type RecordSchemaStorageCode = (typeof RECORD_SCHEMA_STORAGE_CODES)[keyof typeof RECORD_SCHEMA_STORAGE_CODES];

export class RecordSchemaPersistenceError extends Error {
  public constructor(
    public readonly code: RecordSchemaStorageCode,
    message: string
  ) {
    super(message);
    this.name = 'RecordSchemaPersistenceError';
  }
}

function invalidArtifact(message: string): never {
  throw new RecordSchemaPersistenceError(RECORD_SCHEMA_STORAGE_CODES.INVALID_ARTIFACT, message);
}

function invalidReference(message: string): never {
  throw new RecordSchemaPersistenceError(RECORD_SCHEMA_STORAGE_CODES.INVALID_REFERENCE, message);
}

function normalizeJsonValue(value: unknown, ancestors: WeakSet<object>): ContractJsonValue {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return invalidArtifact('Record schema artifacts must contain only finite JSON numbers.');
    }
    return value;
  }
  if (typeof value !== 'object') {
    return invalidArtifact('Record schema artifacts must contain only JSON-safe values.');
  }
  if (ancestors.has(value)) {
    return invalidArtifact('Record schema artifacts must not contain cyclic values.');
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const normalized: ContractJsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          return invalidArtifact('Record schema artifact arrays must not contain holes.');
        }
        normalized.push(normalizeJsonValue(value[index], ancestors));
      }
      return normalized;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return invalidArtifact('Record schema artifacts must contain only plain JSON objects.');
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      return invalidArtifact('Record schema artifacts must not contain symbol properties.');
    }

    const entries: Array<[string, ContractJsonValue]> = [];
    for (const key of Object.keys(value).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
        return invalidArtifact('Record schema artifacts must contain only enumerable data properties.');
      }
      entries.push([key, normalizeJsonValue(descriptor.value, ancestors)]);
    }
    return Object.fromEntries(entries);
  } finally {
    ancestors.delete(value);
  }
}

export interface ValidatedRecordSchemaArtifact extends RecordSchemaArtifactInput {
  readonly serializedDocument: string;
}

function isContractJsonObject(value: ContractJsonValue): value is ContractJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateRecordSchemaDigest(digest: unknown): string {
  if (typeof digest !== 'string' || !RECORD_SCHEMA_DIGEST_PATTERN.test(digest)) {
    return invalidArtifact('Record schema artifact digest must be lowercase SHA-256 hex.');
  }
  return digest;
}

export function validateRecordSchemaArtifactInput(input: RecordSchemaArtifactInput): ValidatedRecordSchemaArtifact {
  if (!input || typeof input !== 'object') {
    return invalidArtifact('Record schema artifact input is required.');
  }
  const digest = validateRecordSchemaDigest(input.digest);
  if (input.contractFormat !== RECORD_CONTRACT_FORMAT_V1) {
    return invalidArtifact('Record schema artifact contract format is unsupported.');
  }
  if (input.completeness !== 'complete' && input.completeness !== 'partial') {
    return invalidArtifact('Record schema artifact completeness is invalid.');
  }
  if (!Number.isSafeInteger(input.byteLength) || input.byteLength <= 0) {
    return invalidArtifact('Record schema artifact byte length must be a positive safe integer.');
  }

  const document = normalizeJsonValue(input.document, new WeakSet<object>());
  if (!isContractJsonObject(document)) {
    return invalidArtifact('Record schema artifact document must be a JSON object.');
  }
  const serializedDocument = JSON.stringify(document);
  if (Buffer.byteLength(serializedDocument, 'utf8') !== input.byteLength) {
    return invalidArtifact('Record schema artifact byte length does not match its JSON document.');
  }

  return {
    digest,
    document,
    contractFormat: input.contractFormat,
    completeness: input.completeness,
    byteLength: input.byteLength,
    serializedDocument,
  };
}

function requiredNormalizedString(value: unknown, field: string, maximumLength = 512): string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    return invalidReference(`Record schema reference ${field} must be a normalized non-empty string.`);
  }
  if (value.length > maximumLength) {
    return invalidReference(`Record schema reference ${field} exceeds its storage limit.`);
  }
  return value;
}

function optionalDate(value: unknown, field: string): Date | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return invalidReference(`Record schema reference ${field} must be a valid Date.`);
  }
  return new Date(value.getTime());
}

export function validateRecordSchemaReferenceInput(input: unknown): RecordSchemaReferenceInput {
  if (!input || typeof input !== 'object') {
    return invalidReference('Record schema reference input is required.');
  }

  const referenceKey = requiredNormalizedString(Reflect.get(input, 'referenceKey'), 'referenceKey');
  if (!RECORD_SCHEMA_REFERENCE_KEY_PATTERN.test(referenceKey)) {
    return invalidReference('Record schema reference key contains unsupported characters.');
  }
  const digest = requiredNormalizedString(Reflect.get(input, 'digest'), 'digest', 64);
  if (!RECORD_SCHEMA_DIGEST_PATTERN.test(digest)) {
    return invalidReference('Record schema reference digest must be lowercase SHA-256 hex.');
  }
  const brand = requiredNormalizedString(Reflect.get(input, 'brand'), 'brand');
  const portal = requiredNormalizedString(Reflect.get(input, 'portal'), 'portal');
  const recordType = requiredNormalizedString(Reflect.get(input, 'recordType'), 'recordType');
  const operation = requiredNormalizedString(Reflect.get(input, 'operation'), 'operation');
  const schemaKind = Reflect.get(input, 'schemaKind');
  if (schemaKind !== 'create' && schemaKind !== 'update') {
    return invalidReference('Record schema reference schemaKind is invalid.');
  }
  const kind = Reflect.get(input, 'kind');
  const oid = Reflect.get(input, 'oid');
  const owner = Reflect.get(input, 'owner');
  const purpose = Reflect.get(input, 'purpose');
  const expiresAt = Reflect.get(input, 'expiresAt');

  const common = {
    referenceKey,
    digest,
    brand,
    portal,
    recordType,
    operation,
  };
  if (kind === 'grant') {
    if (owner !== undefined || purpose !== undefined || expiresAt !== undefined) {
      return invalidReference('Record schema grant references cannot contain pin fields.');
    }
    if (schemaKind === 'create') {
      if (oid !== undefined) {
        return invalidReference('Record schema create grants cannot contain an OID.');
      }
      return { ...common, kind: 'grant', schemaKind: 'create' };
    }
    return {
      ...common,
      kind: 'grant',
      schemaKind: 'update',
      oid: requiredNormalizedString(oid, 'oid'),
    };
  }
  if (kind === 'save') {
    if (owner !== undefined || purpose !== undefined || expiresAt !== undefined) {
      return invalidReference('Record schema save references cannot contain pin fields.');
    }
    return {
      ...common,
      kind: 'save',
      schemaKind,
      oid: requiredNormalizedString(oid, 'oid'),
    };
  }
  if (kind === 'pin') {
    if (oid !== undefined) {
      return invalidReference('Record schema pin references cannot contain an OID.');
    }
    return {
      ...common,
      kind: 'pin',
      schemaKind,
      owner: requiredNormalizedString(owner, 'owner'),
      purpose: requiredNormalizedString(purpose, 'purpose', 2_048),
      expiresAt: optionalDate(expiresAt, 'expiresAt'),
    };
  }
  return invalidReference('Record schema reference kind is invalid.');
}

function dateValue(value: unknown, field: string): Date {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) {
    throw new RecordSchemaPersistenceError(
      RECORD_SCHEMA_STORAGE_CODES.STORAGE_FAILED,
      `Stored record schema ${field} is invalid.`
    );
  }
  return date;
}

export function artifactContentIdentity(artifact: RecordSchemaArtifactInput): string {
  const validated = validateRecordSchemaArtifactInput(artifact);
  return JSON.stringify({
    byteLength: validated.byteLength,
    completeness: validated.completeness,
    contractFormat: validated.contractFormat,
    document: JSON.parse(validated.serializedDocument),
  });
}

export function referenceContentIdentity(reference: RecordSchemaReferenceInput): string {
  const validated = validateRecordSchemaReferenceInput(reference);
  const expiresAt = validated.kind === 'pin' ? validated.expiresAt?.toISOString() : undefined;
  return JSON.stringify({
    brand: validated.brand,
    digest: validated.digest,
    expiresAt,
    kind: validated.kind,
    oid:
      validated.kind === 'pin' || (validated.kind === 'grant' && validated.schemaKind === 'create')
        ? undefined
        : validated.oid,
    operation: validated.operation,
    owner: validated.kind === 'pin' ? validated.owner : undefined,
    portal: validated.portal,
    purpose: validated.kind === 'pin' ? validated.purpose : undefined,
    recordType: validated.recordType,
    referenceKey: validated.referenceKey,
    schemaKind: validated.schemaKind,
  });
}

export function artifactModelFromDocument(document: Document): RecordSchemaArtifactModel {
  const validated = validateRecordSchemaArtifactInput({
    digest: document.digest,
    document: document.document,
    contractFormat: document.contractFormat,
    completeness: document.completeness,
    byteLength: document.byteLength,
  });
  return {
    digest: validated.digest,
    document: validated.document,
    contractFormat: validated.contractFormat,
    completeness: validated.completeness,
    byteLength: validated.byteLength,
    createdAt: dateValue(document.createdAt, 'artifact createdAt'),
    updatedAt: dateValue(document.updatedAt, 'artifact updatedAt'),
    lastAccessedAt:
      document.lastAccessedAt === undefined ? undefined : dateValue(document.lastAccessedAt, 'artifact lastAccessedAt'),
  };
}

export function referenceModelFromDocument(document: Document): RecordSchemaReferenceModel {
  const reference = validateRecordSchemaReferenceInput({
    referenceKey: document.referenceKey,
    digest: document.digest,
    kind: document.kind,
    brand: document.brand,
    portal: document.portal,
    schemaKind: document.schemaKind,
    recordType: document.recordType,
    oid: document.oid,
    operation: document.operation,
    owner: document.owner,
    purpose: document.purpose,
    expiresAt: document.expiresAt,
  });
  return {
    ...reference,
    createdAt: dateValue(document.createdAt, 'reference createdAt'),
    updatedAt: dateValue(document.updatedAt, 'reference updatedAt'),
  };
}

export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === 11000;
}
