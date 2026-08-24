export const RECORD_SCHEMA_PROBLEM_CODES = {
  CONFIG_INVALID: 'record-schema.config-invalid',

  INVALID_REQUEST: 'record-schema.invalid-request',
  NOT_FOUND: 'record-schema.not-found',
  FORBIDDEN: 'record-schema.forbidden',
  NOT_RESOLVABLE: 'record-schema.not-resolvable',
  LIMIT_EXCEEDED: 'record-schema.limit-exceeded',
  INVALID_CONTRACT: 'record-schema.invalid-contract',
  UNAVAILABLE: 'record-schema.unavailable',

  STORAGE_UNAVAILABLE: 'record-schema.storage-unavailable',
  ARTIFACT_WRITE_FAILED: 'record-schema.artifact-write-failed',
  GRANT_WRITE_FAILED: 'record-schema.grant-write-failed',
  DIGEST_COLLISION: 'record-schema.digest-collision',

  LIMIT_DEPTH: 'record-schema.limit-depth',
  LIMIT_PROPERTIES: 'record-schema.limit-properties',
  LIMIT_DOCUMENT_BYTES: 'record-schema.limit-document-bytes',
  LIMIT_DIAGNOSTICS: 'record-schema.limit-diagnostics',
  LIMIT_CONTRIBUTOR_TIMEOUT: 'record-schema.limit-contributor-timeout',

  CONTRIBUTOR_INVALID: 'record-schema.contributor-invalid',
  CONTRIBUTOR_DUPLICATE: 'record-schema.contributor-duplicate',
  CONTRIBUTOR_FAILED: 'record-schema.contributor-failed',
  UNSUPPORTED_COMPONENT: 'record-schema.unsupported-component',

  PRECONDITION_FAILED: 'record-schema.precondition-failed',

  TYPE: 'record-schema.type',
  ADDITIONAL_PROPERTY: 'record-schema.additional-property',
  REQUIRED: 'record-schema.required',
  ENUM: 'record-schema.enum',
  ARRAY_ITEM: 'record-schema.array-item',
  VALIDATION_GENERIC: 'record-schema.validation',
} as const;

export type RecordSchemaProblemCode = (typeof RECORD_SCHEMA_PROBLEM_CODES)[keyof typeof RECORD_SCHEMA_PROBLEM_CODES];
