/** Compatibility exports for plain validation/error contracts. Raw document codecs live in the adapter. */
export {
  RECORD_SCHEMA_REFERENCE_QUERY_LIMIT_MAX,
  RECORD_SCHEMA_STORAGE_CODES,
  RecordSchemaPersistenceError,
  artifactContentIdentity,
  isDuplicateKeyError,
  referenceContentIdentity,
  validateRecordSchemaArtifactInput,
  validateRecordSchemaDigest,
  validateRecordSchemaReferenceInput,
} from '../persistence/recordSchemaCodec';
export type { RecordSchemaStorageCode, ValidatedRecordSchemaArtifact } from '../persistence/recordSchemaCodec';
