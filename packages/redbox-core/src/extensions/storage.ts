/** First-party storage adapter seams, deliberately excluding the legacy core barrel. */
export type { PersistenceOwner } from '../persistence/owner';
export * from '../persistence/runtime';
export { PersistenceError } from '../persistence/errors';
export * from '../persistence/indexes';
export * from '../persistence/storage/prismaAdapter';
export type { StoragePrismaClient } from '../persistence/prisma/client';
export { prismaModelRow } from '../persistence/prisma/modelRow';
export { storageAuditFields } from '../persistence/storage/auditFields';
export { assertJsonValue } from '../persistence/cache/validation';
export { normalizePersistenceField } from '../persistence/scalars';
export { persistenceStringTimestamps } from '../persistence/timestamps';
export { writeGridFSStream } from '../storage/writeGridFSStream';
export { ownGridFSDownload } from '../storage/ownGridFSDownload';
export { StorageServiceResponse, StorageMutationResponse } from '../StorageServiceResponse';
export { DatastreamServiceResponse } from '../DatastreamServiceResponse';
export { Datastream } from '../Datastream';
export { Attachment } from '../Attachment';
export type { StorageService } from '../StorageService';
export type { DatastreamService } from '../DatastreamService';
export type * as StorageManagerService from '../services/StorageManagerService';
export type * from '../model';
export { RBValidationError } from '../model/RBValidationError';
export type { RecordRelationshipExpandOptions, RecordRelationshipGraph } from '../RecordsService';
export * from '../RecordWriteOptions';
export * from '../RecordStorageConcurrency';
export { isCanonicalSaveRequestId } from '../RecordSaveResponse';
export { normalizeAttachmentStagingFileId } from '../AttachmentStagingIdentity';
export { isRecordConcurrencyResolution, isRecordRevision } from '@researchdatabox/sails-ng-common';
export { ExportJSONTransformer } from '../transformers/ExportJSONTransformer';
export { normalizeRecordRelations, type NormalizedRecordRelation } from '../config/recordtype.config';
export { normalizeRedboxCanonicalJsonV1 } from '../record-contract/canonical-json';
export { RECORD_CONTRACT_FORMAT_V1 } from '../record-contract/types';
export type * from '../record-contract/types';
export { RECORD_SCHEMA_PROBLEM_CODES } from '../record-contract/codes';
export {
  isDeletedRecordLifecycleOperation,
  isDeletedRecordLifecycleOperationForState,
  isDeletedRecordLifecycleState,
} from '../model/storage/DeletedRecordModel';
export { RecordAuditParams } from '../RecordAuditParams';
export { IntegrationAuditParams } from '../IntegrationAuditParams';
export { metTriggerCondition } from '../utilities/metTriggerCondition';

export type { RecordTypes } from '../recordTypes';
import type { Services as StorageManagerServices } from '../services/StorageManagerService';
import type { Forms } from '../forms/Forms';
export type StorageDisks = Pick<StorageManagerServices.StorageManager, 'disk' | 'stagingDisk'>;
export type StorageFormReader = Pick<Forms, 'getFormByName'>;
