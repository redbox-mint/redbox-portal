import { firstValueFrom, Observable, of } from 'rxjs';
import { mergeMap } from 'rxjs';
import { randomUUID } from 'crypto';

import type { Model } from 'sails';
import { DateTime } from 'luxon';

import mongodb = require('mongodb');
import type { Collection, Db, Document, Filter, FindCursor, FindOptions, GridFSFile } from 'mongodb';
import stream = require('node:stream');
import { pipeline } from 'node:stream/promises';
import { Transform, transforms } from 'json2csv';
import {
  Services as services,
  StorageManagerService as StorageManagerServiceTypes,
  DatastreamService,
  StorageService,
  StorageServiceResponse,
  StorageMutationResponse,
  DatastreamServiceResponse,
  Datastream,
  Attachment,
  RecordAuditModel,
  RecordAuditParams,
  IntegrationAuditModel,
  IntegrationAuditParams,
  RecordModel,
  type DeletedRecordModel,
  BrandingModel,
  UserModel,
  RoleModel,
  RecordRelationshipExpandOptions,
  RecordRelationshipGraph,
  FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES,
  INITIAL_RECORD_REVISION,
  isCanonicalSaveRequestId,
  isDeletedRecordLifecycleOperation,
  isDeletedRecordLifecycleOperationForState,
  isDeletedRecordLifecycleState,
  isRecordConcurrencyResolution,
  isRecordRevision,
  nextRecordRevision,
  normalizeAttachmentStagingFileId,
  type RecordStorageMutationOptions,
  type StorageMutationNonApplicationReason,
  type StorageServiceCapabilities,
} from '@researchdatabox/redbox-core';
import type {
  RecordSchemaArtifactInput,
  RecordSchemaArtifactModel,
  RecordSchemaDeleteRequest,
  RecordSchemaDeleteResult,
  RecordSchemaGrantQuery,
  RecordSchemaReferenceInput,
  RecordSchemaReferenceModel,
  RecordSchemaReferenceQuery,
  RecordSchemaRetentionReason,
} from '@researchdatabox/redbox-core';
import { ExportJSONTransformer } from '@researchdatabox/redbox-core';
import { normalizeRecordRelations, NormalizedRecordRelation } from '@researchdatabox/redbox-core';
import {
  RECORD_SCHEMA_REFERENCE_QUERY_LIMIT_MAX,
  RECORD_SCHEMA_STORAGE_CODES,
  RecordSchemaPersistenceError,
  artifactContentIdentity,
  artifactModelFromDocument,
  isDuplicateKeyError,
  referenceContentIdentity,
  referenceModelFromDocument,
  validateRecordSchemaArtifactInput,
  validateRecordSchemaDigest,
  validateRecordSchemaReferenceInput,
} from './recordSchemaPersistence';

const { flatten } = transforms;
const UTF8_BOM = '\uFEFF';

const CSV_DANGEROUS_PREFIX = /^[=+\-@\t\r\n]/;
function sanitizeCsvCell(value: unknown): unknown {
  if (typeof value === 'string' && CSV_DANGEROUS_PREFIX.test(value)) {
    return "'" + value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeCsvCell);
  }
  if (
    value != null &&
    typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  ) {
    return sanitizeCsvRecord(value as Record<string, unknown>);
  }
  return value;
}

function sanitizeCsvRecord(record: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    sanitized[key] = sanitizeCsvCell(record[key]);
  }
  return sanitized;
}

declare const sails: Sails.Application;
declare const _: typeof import('lodash');
type JsonMap = Record<string, unknown>;
type StorageRecord = RecordModel;
type MongoRecordDocument = Document;
type WaterlineModel = Model;
type AttachmentDescriptor = JsonMap & { type?: string; fileId?: string };
type DatastreamContent = { readstream?: NodeJS.ReadableStream; body?: Buffer | string } & Record<string, unknown>;
const RECORD_IDENTITY_COLLECTION = 'recordidentity';

declare const Record: WaterlineModel;
declare const DeletedRecord: WaterlineModel;
declare const RecordAudit: WaterlineModel;
declare const IntegrationAudit: WaterlineModel;
declare const RecordSchemaArtifact: WaterlineModel;
declare const RecordSchemaReference: WaterlineModel;

export const RECORD_SCHEMA_ARTIFACT_INDEXES: mongodb.IndexDescription[] = [
  {
    key: { digest: 1 },
    name: 'record_schema_artifact_digest_unique',
    unique: true,
  },
];

export const RECORD_SCHEMA_REFERENCE_INDEXES: mongodb.IndexDescription[] = [
  {
    key: { referenceKey: 1 },
    name: 'record_schema_reference_key_unique',
    unique: true,
  },
  {
    key: { digest: 1, kind: 1 },
    name: 'record_schema_reference_digest_kind',
  },
  {
    key: { oid: 1, kind: 1 },
    name: 'record_schema_reference_oid_kind',
    sparse: true,
  },
  {
    key: { kind: 1, expiresAt: 1 },
    name: 'record_schema_reference_pin_expiry',
    partialFilterExpression: { kind: 'pin' },
  },
];

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

type RelatedRecordsContext = {
  rootOid: string;
  processedRelationships: string[];
  relatedObjects: Record<string, MongoRecordDocument[]>;
  edges: Array<{
    relationId: string;
    label?: string;
    sourceOid: string;
    targetOid: string;
    targetRecordType: string;
  }>;
  omittedByAccess: Record<string, number>;
  visitedTraversalKeys: Set<string>;
  visitedEdgeKeys: Set<string>;
  visitedRelatedObjectKeys: Set<string>;
};

export namespace Services {
  export class MongoStorageService extends services.Core.Service implements StorageService, DatastreamService {
    gridFsBucket!: mongodb.GridFSBucket;
    db!: Db;
    recordCol!: Collection<MongoRecordDocument>;
    deletedRecordCol!: Collection<MongoRecordDocument>;
    recordIdentityCol!: Collection<MongoRecordDocument>;
    recordSchemaArtifactCol!: Collection<MongoRecordDocument>;
    recordSchemaReferenceCol!: Collection<MongoRecordDocument>;
    private _readyHookRegistered = false;
    private _requiredIndicesReady = false;

    protected _exportedMethods: string[] = [
      'init',
      'create',
      'updateMeta',
      'getCapabilities',
      'removeActiveRecord',
      'createTombstone',
      'updateTombstone',
      'removeTombstone',
      'createActiveRecordFromTombstone',
      'getTombstone',
      'getLifecycleTombstones',
      'getMeta',
      'createBatch',
      'provideUserAccessAndRemovePendingAccess',
      'getRelatedRecords',
      'delete',
      'updateNotificationLog',
      'getRecords',
      'restoreRecord',
      'destroyDeletedRecord',
      'getDeletedRecords',
      'getDeletedRecordMeta',
      'exportAllPlans',
      'addDatastreams',
      'updateDatastream',
      'removeDatastream',
      'removeStagedDatastream',
      'addDatastream',
      'addAndRemoveDatastreams',
      'getDatastream',
      'listDatastreams',
      'createRecordAudit',
      'createIntegrationAudit',
      'getRecordAudit',
      'getIntegrationAudit',
      'countIntegrationAudit',
      'putRecordSchemaArtifact',
      'getRecordSchemaArtifact',
      'touchRecordSchemaArtifact',
      'putRecordSchemaReference',
      'listRecordSchemaGrants',
      'listRecordSchemaReferences',
      'deleteRecordSchemaArtifactIfUnreferenced',
      'exists',
    ];

    constructor() {
      super();
      this.logHeader = 'MongoStorageService::';
      this.registerReadyHook();
    }

    private getUuid(): string {
      return randomUUID().replace(/-/g, '');
    }

    private getErrorMessage(err: unknown): string {
      if (err instanceof Error) {
        const messageParts = [err.message];
        const causeMessage =
          err.cause instanceof Error ? err.cause.message : typeof err.cause === 'string' ? err.cause : undefined;
        if (causeMessage != null && causeMessage !== '' && causeMessage !== err.message) {
          messageParts.push(`Cause: ${causeMessage}`);
        }
        return messageParts.join('\n');
      }
      return String(err);
    }

    /**
     * Resolve the native driver collection behind a Waterline model. Strict
     * concurrency needs `findOneAndUpdate`/`findOneAndDelete` facts that
     * Waterline cannot certify, so the compare-and-set paths talk to the
     * driver directly. Discovery never throws: an adapter that cannot supply a
     * native collection is simply unsupported.
     */
    private getNativeCollection(
      model: WaterlineModel,
      cacheKey: 'recordCol' | 'deletedRecordCol'
    ): Collection<MongoRecordDocument> | undefined {
      const cached = this[cacheKey];
      if (cached) return cached;
      try {
        const manager = model.getDatastore()?.manager as Db | undefined;
        if (manager && typeof manager.collection === 'function') {
          this.db = manager;
          this[cacheKey] = manager.collection<MongoRecordDocument>(model.tableName);
          return this[cacheKey];
        }
      } catch {
        // Capability discovery is deliberately non-throwing and fail-closed.
      }
      return undefined;
    }

    private getNativeRecordCollection(): Collection<MongoRecordDocument> | undefined {
      return this.getNativeCollection(Record, 'recordCol');
    }

    private getNativeTombstoneCollection(): Collection<MongoRecordDocument> | undefined {
      return this.getNativeCollection(DeletedRecord, 'deletedRecordCol');
    }

    private getNativeRecordIdentityCollection(): Collection<MongoRecordDocument> | undefined {
      if (this.recordIdentityCol) return this.recordIdentityCol;
      try {
        const manager = (this.db ?? (Record.getDatastore()?.manager as Db | undefined)) as Db | undefined;
        if (manager && typeof manager.collection === 'function') {
          this.db = manager;
          this.recordIdentityCol = manager.collection<MongoRecordDocument>(RECORD_IDENTITY_COLLECTION);
          return this.recordIdentityCol;
        }
      } catch {
        // Capability discovery is deliberately non-throwing and fail-closed.
      }
      return undefined;
    }

    private supportsAtomicMutation(
      collection: Collection<MongoRecordDocument> | undefined
    ): collection is Collection<MongoRecordDocument> {
      return (
        typeof collection?.findOneAndUpdate === 'function' &&
        typeof collection?.findOneAndDelete === 'function' &&
        typeof collection?.findOne === 'function'
      );
    }

    public getCapabilities(): StorageServiceCapabilities {
      const supported =
        this._requiredIndicesReady &&
        this.supportsAtomicMutation(this.getNativeRecordCollection()) &&
        this.supportsAtomicMutation(this.getNativeTombstoneCollection()) &&
        typeof this.getNativeRecordIdentityCollection()?.findOne === 'function' &&
        typeof this.getNativeRecordIdentityCollection()?.insertOne === 'function' &&
        typeof this.getNativeRecordIdentityCollection()?.deleteOne === 'function' &&
        typeof this.getNativeRecordCollection()?.insertOne === 'function' &&
        typeof this.getNativeTombstoneCollection()?.insertOne === 'function' &&
        typeof this.getNativeTombstoneCollection()?.find === 'function';
      return supported ? { recordConcurrency: { ...FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES } } : {};
    }

    private createMutationResponse(oid: string, options?: RecordStorageMutationOptions): StorageMutationResponse {
      const response = new StorageMutationResponse();
      response.oid = oid;
      if (isCanonicalSaveRequestId(options?.requestId)) response.requestId = options.requestId;
      if (isRecordConcurrencyResolution(options?.resolution)) response.resolution = options.resolution;
      return response;
    }

    private notApplied(
      response: StorageMutationResponse,
      reason: StorageMutationNonApplicationReason,
      message = 'Record mutation was not applied'
    ): StorageMutationResponse {
      response.success = false;
      response.applicationState = 'not-applied';
      response.nonApplicationReason = reason;
      response.message = message;
      return response;
    }

    private unknownMutation(response: StorageMutationResponse, message: string): StorageMutationResponse {
      response.success = false;
      response.applicationState = 'unknown';
      response.message = message;
      return response;
    }

    /**
     * Normalize the caller's precondition. Returning `null` means the response
     * already carries a certified non-application: a malformed precondition is
     * a caller defect, and answering it with a definite no-write is safer than
     * guessing which revision was meant.
     */
    private expectedRevision(
      options: RecordStorageMutationOptions | undefined,
      response: StorageMutationResponse
    ): number | undefined | null {
      const precondition = options?.precondition;
      if (!precondition) return undefined;
      const { expectedRevision, requireRevision } = precondition;
      if (
        typeof requireRevision !== 'boolean' ||
        (expectedRevision === undefined ? requireRevision : !isRecordRevision(expectedRevision))
      ) {
        sails.log.error(
          `${this.logHeader} refusing a mutation for oid ${response.oid}: the supplied revision precondition is invalid`
        );
        this.notApplied(response, 'capability-unavailable', 'A valid record revision is required');
        return null;
      }
      return expectedRevision;
    }

    /**
     * The lazy compatibility clause matches only a genuinely absent revision.
     * An explicit null is corrupt state: `$inc` cannot advance it and must not
     * be made to look like a safe first revision.
     */
    private revisionSelector(expectedRevision: number | undefined): JsonMap {
      if (expectedRevision === INITIAL_RECORD_REVISION) {
        // Atomic lazy compatibility for a legacy record that escaped the
        // single-lift migration. The winning $inc makes a second match fail.
        return { $or: [{ revision: INITIAL_RECORD_REVISION }, { revision: { $exists: false } }] };
      }
      if (expectedRevision !== undefined) return { revision: expectedRevision };
      // Tokenless compatibility: match anything that can still be advanced.
      return { $or: [{ revision: { $lt: Number.MAX_SAFE_INTEGER } }, { revision: { $exists: false } }] };
    }

    private mutationSelector(identity: JsonMap, expectedRevision: number | undefined): Filter<MongoRecordDocument> {
      return { $and: [identity, this.revisionSelector(expectedRevision)] } as Filter<MongoRecordDocument>;
    }

    private lifecycleMutationSelector(
      identity: JsonMap,
      expectedRevision: number | undefined,
      options?: RecordStorageMutationOptions
    ): Filter<MongoRecordDocument> {
      const selector = this.mutationSelector(identity, expectedRevision) as JsonMap;
      const predicates = selector.$and as JsonMap[];
      if (options?.lifecycle?.expectedState) {
        predicates.push({ lifecycleState: options.lifecycle.expectedState });
      }
      if (options?.lifecycle?.operationId) {
        predicates.push({ 'lifecycleOperation.operationId': options.lifecycle.operationId });
      }
      return selector as Filter<MongoRecordDocument>;
    }

    private isDuplicateKeyError(error: unknown): boolean {
      return Boolean(error && typeof error === 'object' && Number((error as JsonMap).code) === 11000);
    }

    /**
     * Whether the driver fact proves that `insertOne` did not commit. Local
     * argument rejection and a server command error without retry/write-
     * concern ambiguity are definitive. Network, selection, timeout, and
     * write-concern failures retain the reservation for later reconciliation.
     */
    private isCertifiedCreateNonApplication(error: unknown): boolean {
      if (error instanceof mongodb.MongoInvalidArgumentError) return true;
      if (!(error instanceof mongodb.MongoServerError) || error instanceof mongodb.MongoWriteConcernError) {
        return false;
      }
      const serverError = error as mongodb.MongoServerError & {
        writeConcernError?: unknown;
        hasErrorLabel?: (label: string) => boolean;
      };
      if (serverError.writeConcernError) return false;
      if (serverError.hasErrorLabel?.('RetryableWriteError')) return false;
      if (serverError.hasErrorLabel?.('UnknownTransactionCommitResult')) return false;
      return true;
    }

    private storedIncarnationId(record: JsonMap | null | undefined): string | undefined {
      const value = String(record?.incarnationId ?? '').trim();
      return isCanonicalSaveRequestId(value) ? value : undefined;
    }

    /**
     * Establish the permanent OID owner for a state that already exists. The
     * ledger outlives active records and tombstones, so purge cannot reopen a
     * revision-zero alias. Duplicate insertion is an ordinary concurrent
     * winner; its durable identity is re-read and adopted.
     */
    private async ensureRecordIdentity(oid: string, source?: JsonMap | null): Promise<string | undefined> {
      const identities = this.getNativeRecordIdentityCollection();
      if (typeof identities?.findOne !== 'function' || typeof identities?.insertOne !== 'function') return undefined;
      const existing = this.mutationDocument(await identities.findOne({ redboxOid: oid }));
      if (existing === undefined) return undefined;
      const existingId = this.storedIncarnationId(existing);
      if (existing !== null) return existingId;

      const incarnationId = this.storedIncarnationId(source) ?? randomUUID();
      try {
        await identities.insertOne({ redboxOid: oid, incarnationId, createdAt: new Date().toISOString() });
        return incarnationId;
      } catch (error) {
        if (!this.isDuplicateKeyError(error)) return undefined;
        const winner = this.mutationDocument(await identities.findOne({ redboxOid: oid }));
        return winner === undefined ? undefined : this.storedIncarnationId(winner);
      }
    }

    /** Claim a never-before-used OID. Any durable owner or active/tombstone state is a collision. */
    private async claimNewRecordIdentity(
      oid: string
    ): Promise<{ incarnationId: string } | { collision: true } | undefined> {
      const identities = this.getNativeRecordIdentityCollection();
      if (
        typeof identities?.findOne !== 'function' ||
        typeof identities?.insertOne !== 'function' ||
        typeof identities?.deleteOne !== 'function'
      )
        return undefined;
      const existingOwner = this.mutationDocument(await identities.findOne({ redboxOid: oid }));
      if (existingOwner === undefined) return undefined;
      if (existingOwner !== null) return { collision: true };

      // Legacy state may predate the ledger. Seed its owner before returning a
      // collision so a concurrent purge cannot make the OID reusable.
      const current = await this.readCurrentState(oid);
      if (!current) return undefined;
      const existingState = current.active ?? current.tombstone;
      if (existingState) {
        return (await this.ensureRecordIdentity(oid, existingState)) ? { collision: true } : undefined;
      }

      const incarnationId = randomUUID();
      try {
        await identities.insertOne({ redboxOid: oid, incarnationId, createdAt: new Date().toISOString() });
        return { incarnationId };
      } catch (error) {
        return this.isDuplicateKeyError(error) ? { collision: true } : undefined;
      }
    }

    /**
     * Compensate an ownership claim this call made but never used.
     *
     * The ledger is otherwise permanent, and deliberately so: a purge must not
     * let an old revision-zero tag alias a recreated incarnation. Releasing is
     * only safe — and only necessary — for a row that still carries the
     * incarnation this call minted and that no active record or tombstone
     * refers to. That is exactly the state a create leaves behind when its
     * insert never reached the collection, and without this the caller-selected
     * OID would be permanently unusable with no operator recovery path. While
     * this row exists its unique index prevents another ordinary create from
     * becoming owner; the exact incarnation selector also cannot remove a row
     * replaced during an operator recovery race.
     */
    private async releaseUnusedRecordIdentity(oid: string, incarnationId: string): Promise<void> {
      const identities = this.getNativeRecordIdentityCollection();
      if (typeof identities?.deleteOne !== 'function') return;
      try {
        const current = await this.readCurrentState(oid);
        // Unobservable or still-owned state keeps the claim: a permanent row is
        // always safer than one released while something still refers to it.
        if (!current || current.active || current.tombstone) return;
        await identities.deleteOne({ redboxOid: oid, incarnationId });
      } catch {
        sails.log.error(`${this.logHeader} record_identity_reservation_release_failed`, {
          event: 'record_identity_reservation_release_failed',
          outcome: 'unknown',
        });
      }
    }

    /**
     * Interpret a `findOneAndUpdate`/`findOneAndDelete` result issued with
     * `includeResultMetadata: false`: `null` is a certified no-match and a
     * document is the committed state. Anything else is an unrecognized driver
     * fact that must stay `unknown` rather than being certified either way.
     */
    private mutationDocument(result: unknown): JsonMap | null | undefined {
      if (result === null) return null;
      if (result === undefined) return undefined;
      if (typeof result !== 'object' || Array.isArray(result)) return undefined;
      return result as JsonMap;
    }

    private committed(
      response: StorageMutationResponse,
      document: JsonMap,
      kind: 'updated' | 'removed',
      expectedRevision?: number
    ): StorageMutationResponse {
      // A removal returns the pre-removal document, which may predate the
      // revision backfill; an update always returns the incremented value.
      const normalizedRevision = isRecordRevision(document.revision)
        ? document.revision
        : document.revision == null && kind === 'removed'
          ? INITIAL_RECORD_REVISION
          : undefined;
      if (normalizedRevision === undefined) {
        return this.unknownMutation(response, 'Storage returned an invalid committed revision');
      }
      const expectedCommittedRevision =
        expectedRevision === undefined
          ? undefined
          : kind === 'updated'
            ? nextRecordRevision(expectedRevision)
            : expectedRevision;
      if (expectedCommittedRevision !== undefined && normalizedRevision !== expectedCommittedRevision) {
        return this.unknownMutation(response, 'Storage returned an inconsistent committed revision');
      }
      const normalized = { ...document, revision: normalizedRevision };
      response.success = true;
      response.applicationState = 'applied';
      response.committedRevision = normalizedRevision;
      if (kind === 'removed') response.removedRecord = normalized;
      else response.committedRecord = normalized;
      return response;
    }

    private brandIdOf(brand: BrandingModel | null | undefined): string {
      return String(brand?.id ?? '').trim();
    }

    private activeIdentity(brand: BrandingModel | null | undefined, oid: string): JsonMap {
      const brandId = this.brandIdOf(brand);
      return brandId ? { redboxOid: oid, 'metaMetadata.brandId': brandId } : { redboxOid: oid };
    }

    private tombstoneIdentity(brand: BrandingModel | null | undefined, oid: string): JsonMap {
      const brandId = this.brandIdOf(brand);
      // Tombstones written before the lifecycle wrapper existed only carry the
      // brand inside the embedded snapshot. A present wrapper brand remains
      // authoritative: an inconsistent snapshot must never widen brand scope.
      return brandId
        ? {
            redboxOid: oid,
            $or: [
              { brandId },
              {
                $and: [{ brandId: { $exists: false } }, { 'deletedRecordMetadata.metaMetadata.brandId': brandId }],
              },
            ],
          }
        : { redboxOid: oid };
    }

    private static readonly BRAND_ID_PATHS = [
      'brandId',
      'metaMetadata.brandId',
      'deletedRecordMetadata.metaMetadata.brandId',
    ];

    private storedBrandId(record: JsonMap | null | undefined): string {
      for (const path of MongoStorageService.BRAND_ID_PATHS) {
        const brandId = String(_.get(record, path, '') ?? '').trim();
        if (brandId) return brandId;
      }
      return '';
    }

    /**
     * Reject candidate keys the driver would read as update operators or
     * dotted paths. Waterline rejected them before the compare-and-set paths
     * started building `$set` documents directly, and honouring them would let
     * a candidate reach fields — such as the stored brand — that the explicit
     * checks above deliberately guard.
     */
    private unsafeCandidateField(candidate: JsonMap): string | undefined {
      return Object.keys(candidate).find(key => key.startsWith('$') || key.includes('.'));
    }

    /**
     * Read the current state behind a certified no-match so the caller can be
     * told why nothing was written. Cross-brand state is never returned: the
     * reason alone is bounded, and callers outside the brand map it onto the
     * same not-found answer an absent record produces.
     */
    private async readCurrentState(
      oid: string
    ): Promise<{ active: JsonMap | null; tombstone: JsonMap | null } | undefined> {
      const records = this.getNativeRecordCollection();
      const tombstones = this.getNativeTombstoneCollection();
      if (typeof records?.findOne !== 'function' || typeof tombstones?.findOne !== 'function') {
        return undefined;
      }
      const [activeResult, tombstoneResult] = await Promise.all([
        records.findOne({ redboxOid: oid }),
        tombstones.findOne({ redboxOid: oid }),
      ]);
      const active = this.mutationDocument(activeResult);
      const tombstone = this.mutationDocument(tombstoneResult);
      if (active === undefined || tombstone === undefined) return undefined;
      return { active, tombstone };
    }

    private isRequestedBrand(record: JsonMap | null, requestedBrandId: string): boolean {
      return record !== null && (!requestedBrandId || this.storedBrandId(record) === requestedBrandId);
    }

    private async classifyActiveNoMatch(
      brand: BrandingModel | null | undefined,
      oid: string,
      expectedRevision: number | undefined
    ): Promise<StorageMutationNonApplicationReason> {
      const current = await this.readCurrentState(oid);
      if (!current) return 'capability-unavailable';
      const requestedBrandId = this.brandIdOf(brand);
      if (current.active) {
        if (!this.isRequestedBrand(current.active, requestedBrandId)) return 'brand-mismatch';
        // A tokenless selector matches every advanceable revision, so a
        // present in-brand record that still did not match cannot be advanced.
        return expectedRevision !== undefined ? 'stale-revision' : 'capability-unavailable';
      }
      if (this.isRequestedBrand(current.tombstone, requestedBrandId)) return 'deleted';
      return 'not-found';
    }

    private async classifyLifecycleTombstoneNoMatch(
      brand: BrandingModel | null | undefined,
      oid: string,
      expectedRevision: number | undefined,
      options?: RecordStorageMutationOptions
    ): Promise<StorageMutationNonApplicationReason> {
      const current = await this.readCurrentState(oid);
      if (!current) return 'capability-unavailable';
      const requestedBrandId = this.brandIdOf(brand);
      if (current.tombstone) {
        if (!this.isRequestedBrand(current.tombstone, requestedBrandId)) return 'brand-mismatch';
        const currentRevision = isRecordRevision(current.tombstone.revision)
          ? current.tombstone.revision
          : INITIAL_RECORD_REVISION;
        if (expectedRevision !== undefined && currentRevision !== expectedRevision) return 'stale-revision';
        if (
          (options?.lifecycle?.expectedState && current.tombstone.lifecycleState !== options.lifecycle.expectedState) ||
          (options?.lifecycle?.operationId &&
            _.get(current.tombstone, 'lifecycleOperation.operationId') !== options.lifecycle.operationId)
        ) {
          return 'lifecycle-conflict';
        }
        return 'capability-unavailable';
      }
      if (this.isRequestedBrand(current.active, requestedBrandId)) return 'lifecycle-conflict';
      return 'not-found';
    }

    public init(): void {
      this.registerReadyHook();
      void this.performInit().catch(() => {
        sails.log.error(`${this.logHeader} storage_initialization_failed`, {
          event: 'storage_initialization_failed',
          outcome: 'not-ready',
        });
      });
    }

    private registerReadyHook(): void {
      if (this._readyHookRegistered) {
        return;
      }
      this._readyHookRegistered = true;
      const that = this;
      this.registerSailsHook('on', 'ready', function () {
        void that.performInit().catch(() => {
          sails.log.error(`${that.logHeader} storage_initialization_failed`, {
            event: 'storage_initialization_failed',
            outcome: 'not-ready',
          });
        });
      });
    }

    private async collectionExists(collectionName: string): Promise<boolean> {
      if (typeof this.db.listCollections === 'function') {
        const collectionInfo = await this.db.listCollections({ name: collectionName }, { nameOnly: true }).toArray();
        if (!_.isEmpty(collectionInfo)) {
          sails.log.verbose(`${this.logHeader} Collection '${collectionName}' info:`);
          sails.log.verbose(JSON.stringify(collectionInfo));
          return true;
        }
        return false;
      }

      try {
        const collectionInfo = this.db.collection(collectionName, { strict: true } as mongodb.CollectionOptions);
        sails.log.verbose(`${this.logHeader} Collection '${collectionName}' info:`);
        sails.log.verbose(JSON.stringify(collectionInfo));
        return true;
      } catch (_err) {
        return false;
      }
    }

    private async performInit(): Promise<void> {
      if (
        this._requiredIndicesReady &&
        this.recordCol &&
        this.deletedRecordCol &&
        this.recordIdentityCol &&
        this.recordCol &&
        this.deletedRecordCol &&
        this.recordSchemaArtifactCol &&
        this.recordSchemaReferenceCol &&
        this.gridFsBucket
      ) {
        return;
      }
      this.db = Record.getDatastore().manager as Db;
      if (!(await this.collectionExists(Record.tableName))) {
        sails.log.verbose(`Collection doesn't exist, creating: ${Record.tableName}`);
        const uuid = this.getUuid();
        const initRec = { redboxOid: uuid };
        await Record.create(initRec);
        await Record.destroyOne({ redboxOid: uuid });
      }
      this.gridFsBucket = new mongodb.GridFSBucket(this.db);
      this.recordCol = this.db.collection<MongoRecordDocument>(Record.tableName);
      this.deletedRecordCol = this.db.collection<MongoRecordDocument>(DeletedRecord.tableName);
      this.recordIdentityCol = this.db.collection<MongoRecordDocument>(RECORD_IDENTITY_COLLECTION);
      this.recordSchemaArtifactCol = this.db.collection<MongoRecordDocument>(RecordSchemaArtifact.tableName);
      this.recordSchemaReferenceCol = this.db.collection<MongoRecordDocument>(RecordSchemaReference.tableName);
      await this.createIndices(this.db);
      await this.createRecordSchemaIndices();
      this._requiredIndicesReady = true;
      sails.emit('hook:redbox:storage:ready');
      sails.emit('hook:redbox:datastream:ready');
      sails.log.verbose(`${this.logHeader} Ready!`);
    }

    private async createIndices(db: Db): Promise<void> {
      sails.log.verbose(`${this.logHeader} Existing indices:`);
      const currentIndices = await db.collection<MongoRecordDocument>(Record.tableName).indexes();
      sails.log.verbose(JSON.stringify(currentIndices));
      const storageConfig = sails.config.storage as {
        mongodb?: {
          indices?: mongodb.IndexDescription[];
          deletedRecordIndices?: mongodb.IndexDescription[];
          recordIdentityIndices?: mongodb.IndexDescription[];
        };
      };
      const indices = storageConfig.mongodb?.indices ?? [];
      if (_.size(indices) > 0) {
        await db.collection<MongoRecordDocument>(Record.tableName).createIndexes(indices);
      }
      const deletedRecordIndices = storageConfig.mongodb?.deletedRecordIndices ?? [];
      if (_.size(deletedRecordIndices) > 0) {
        await db.collection<MongoRecordDocument>(DeletedRecord.tableName).createIndexes(deletedRecordIndices);
      }
      const recordIdentityIndices = storageConfig.mongodb?.recordIdentityIndices ?? [
        { key: { redboxOid: 1 }, unique: true },
      ];
      await db.collection<MongoRecordDocument>(RECORD_IDENTITY_COLLECTION).createIndexes(recordIdentityIndices);
    }

    private async createRecordSchemaIndices(): Promise<void> {
      await this.recordSchemaArtifactCol.createIndexes(RECORD_SCHEMA_ARTIFACT_INDEXES);
      await this.recordSchemaReferenceCol.createIndexes(RECORD_SCHEMA_REFERENCE_INDEXES);
    }

    private recordSchemaSuccess<TData>(data: TData): StorageServiceResponse<TData> {
      const response = new StorageServiceResponse<TData>();
      response.success = true;
      response.data = data;
      return response;
    }

    private recordSchemaFailure<TData>(
      code: string,
      message: string,
      action: string,
      error?: unknown
    ): StorageServiceResponse<TData> {
      const response = new StorageServiceResponse<TData>();
      response.success = false;
      response.message = message;
      response.details = { code };
      const errorType = error instanceof Error ? error.name : typeof error;
      sails.log.error(`${this.logHeader} ${action} failed (${code}; ${errorType})`);
      return response;
    }

    private recordSchemaFailureFromError<TData>(action: string, error: unknown): StorageServiceResponse<TData> {
      if (error instanceof RecordSchemaPersistenceError) {
        return this.recordSchemaFailure(error.code, error.message, action, error);
      }
      return this.recordSchemaFailure(
        RECORD_SCHEMA_STORAGE_CODES.STORAGE_FAILED,
        'Record schema storage operation failed.',
        action,
        error
      );
    }

    private throwRecordSchemaReadFailure(action: string, error: unknown): never {
      if (error instanceof RecordSchemaPersistenceError) {
        throw error;
      }
      const errorType = error instanceof Error ? error.name : typeof error;
      sails.log.error(`${this.logHeader} ${action} failed (${errorType})`);
      throw new RecordSchemaPersistenceError(
        RECORD_SCHEMA_STORAGE_CODES.STORAGE_FAILED,
        'Record schema storage read failed.'
      );
    }

    private artifactCollection(): Collection<MongoRecordDocument> {
      if (!this.recordSchemaArtifactCol) {
        this.db = this.db ?? (RecordSchemaArtifact.getDatastore().manager as Db);
        this.recordSchemaArtifactCol = this.db.collection<MongoRecordDocument>(RecordSchemaArtifact.tableName);
      }
      return this.recordSchemaArtifactCol;
    }

    private referenceCollection(): Collection<MongoRecordDocument> {
      if (!this.recordSchemaReferenceCol) {
        this.db = this.db ?? (RecordSchemaReference.getDatastore().manager as Db);
        this.recordSchemaReferenceCol = this.db.collection<MongoRecordDocument>(RecordSchemaReference.tableName);
      }
      return this.recordSchemaReferenceCol;
    }

    private unlockedArtifactCriteria(digest: string): Document {
      return {
        digest,
        _retentionDeleteLock: { $exists: false },
      };
    }

    private recordSchemaReferenceDocument(reference: RecordSchemaReferenceInput, now: Date): Document {
      const document: Document = {
        referenceKey: reference.referenceKey,
        digest: reference.digest,
        kind: reference.kind,
        brand: reference.brand,
        portal: reference.portal,
        schemaKind: reference.schemaKind,
        recordType: reference.recordType,
        operation: reference.operation,
        createdAt: now,
        updatedAt: now,
      };
      if (reference.kind === 'save' || (reference.kind === 'grant' && reference.schemaKind === 'update')) {
        document.oid = reference.oid;
      }
      if (reference.kind === 'pin') {
        document.owner = reference.owner;
        document.purpose = reference.purpose;
        if (reference.expiresAt !== undefined) {
          document.expiresAt = reference.expiresAt;
        }
      }
      return document;
    }

    private async existingArtifactMatches(existing: Document, artifact: RecordSchemaArtifactInput): Promise<boolean> {
      return artifactContentIdentity(artifactModelFromDocument(existing)) === artifactContentIdentity(artifact);
    }

    public async putRecordSchemaArtifact(artifact: RecordSchemaArtifactInput): Promise<StorageServiceResponse> {
      try {
        const validated = validateRecordSchemaArtifactInput(artifact);
        const collection = this.artifactCollection();
        const existing = await collection.findOne({ digest: validated.digest });
        if (existing) {
          if (await this.existingArtifactMatches(existing, validated)) {
            return this.recordSchemaSuccess({ digest: validated.digest });
          }
          return this.recordSchemaFailure(
            RECORD_SCHEMA_STORAGE_CODES.DIGEST_COLLISION,
            'Record schema artifact integrity check failed.',
            'putRecordSchemaArtifact'
          );
        }

        const now = new Date();
        try {
          await collection.insertOne({
            digest: validated.digest,
            document: validated.document,
            contractFormat: validated.contractFormat,
            completeness: validated.completeness,
            byteLength: validated.byteLength,
            createdAt: now,
            updatedAt: now,
          });
        } catch (error) {
          if (!isDuplicateKeyError(error)) {
            throw error;
          }
          const racedArtifact = await collection.findOne({ digest: validated.digest });
          if (!racedArtifact || !(await this.existingArtifactMatches(racedArtifact, validated))) {
            return this.recordSchemaFailure(
              RECORD_SCHEMA_STORAGE_CODES.DIGEST_COLLISION,
              'Record schema artifact integrity check failed.',
              'putRecordSchemaArtifact',
              error
            );
          }
        }
        return this.recordSchemaSuccess({ digest: validated.digest });
      } catch (error) {
        return this.recordSchemaFailureFromError('putRecordSchemaArtifact', error);
      }
    }

    public async getRecordSchemaArtifact(digest: string): Promise<RecordSchemaArtifactModel | null> {
      const validatedDigest = validateRecordSchemaDigest(digest);
      try {
        const document = await this.artifactCollection().findOne({ digest: validatedDigest });
        return document ? artifactModelFromDocument(document) : null;
      } catch (error) {
        const errorType = error instanceof Error ? error.name : typeof error;
        sails.log.error(`${this.logHeader} getRecordSchemaArtifact failed (${errorType})`);
        throw new RecordSchemaPersistenceError(
          RECORD_SCHEMA_STORAGE_CODES.STORAGE_FAILED,
          'Record schema artifact read failed.'
        );
      }
    }

    public async touchRecordSchemaArtifact(digest: string): Promise<StorageServiceResponse> {
      try {
        const validatedDigest = validateRecordSchemaDigest(digest);
        const result = await this.artifactCollection().updateOne(
          { digest: validatedDigest },
          { $set: { lastAccessedAt: new Date() } }
        );
        if (result.matchedCount !== 1) {
          return this.recordSchemaFailure(
            RECORD_SCHEMA_STORAGE_CODES.ARTIFACT_NOT_FOUND,
            'Record schema artifact was not found.',
            'touchRecordSchemaArtifact'
          );
        }
        return this.recordSchemaSuccess({ digest: validatedDigest });
      } catch (error) {
        return this.recordSchemaFailureFromError('touchRecordSchemaArtifact', error);
      }
    }

    private async storeRecordSchemaReference(
      reference: RecordSchemaReferenceInput,
      now: Date
    ): Promise<StorageServiceResponse> {
      const collection = this.referenceCollection();
      const existing = await collection.findOne({ referenceKey: reference.referenceKey });
      if (existing) {
        if (referenceContentIdentity(referenceModelFromDocument(existing)) !== referenceContentIdentity(reference)) {
          return this.recordSchemaFailure(
            RECORD_SCHEMA_STORAGE_CODES.REFERENCE_KEY_COLLISION,
            'Record schema reference integrity check failed.',
            'putRecordSchemaReference'
          );
        }
        await collection.updateOne({ referenceKey: reference.referenceKey }, { $set: { updatedAt: now } });
        return this.recordSchemaSuccess({ referenceKey: reference.referenceKey });
      }

      try {
        await collection.insertOne(this.recordSchemaReferenceDocument(reference, now));
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
        const racedReference = await collection.findOne({ referenceKey: reference.referenceKey });
        if (
          !racedReference ||
          referenceContentIdentity(referenceModelFromDocument(racedReference)) !== referenceContentIdentity(reference)
        ) {
          return this.recordSchemaFailure(
            RECORD_SCHEMA_STORAGE_CODES.REFERENCE_KEY_COLLISION,
            'Record schema reference integrity check failed.',
            'putRecordSchemaReference',
            error
          );
        }
        await collection.updateOne({ referenceKey: reference.referenceKey }, { $set: { updatedAt: now } });
      }
      return this.recordSchemaSuccess({ referenceKey: reference.referenceKey });
    }

    public async putRecordSchemaReference(reference: RecordSchemaReferenceInput): Promise<StorageServiceResponse> {
      try {
        const validated = validateRecordSchemaReferenceInput(reference);
        const now = new Date();
        const artifactCriteria = this.unlockedArtifactCriteria(validated.digest);
        const artifact = await this.artifactCollection().findOne(artifactCriteria, {
          projection: { _id: 1 },
        });
        if (!artifact) {
          return this.recordSchemaFailure(
            RECORD_SCHEMA_STORAGE_CODES.ARTIFACT_NOT_FOUND,
            'Record schema reference target was not found.',
            'putRecordSchemaReference'
          );
        }

        const response = await this.storeRecordSchemaReference(validated, now);
        if (!response.success) {
          return response;
        }

        // Reference writes and retention deletion share this lock protocol.
        // A writer that raced with deletion removes its own temporary row and
        // fails, so no successful reference can become orphaned.
        const artifactAfterWrite = await this.artifactCollection().findOne(
          this.unlockedArtifactCriteria(validated.digest),
          { projection: { _id: 1 } }
        );
        if (!artifactAfterWrite) {
          await this.referenceCollection().deleteOne({
            referenceKey: validated.referenceKey,
            digest: validated.digest,
          });
          return this.recordSchemaFailure(
            RECORD_SCHEMA_STORAGE_CODES.ARTIFACT_NOT_FOUND,
            'Record schema reference target was not found.',
            'putRecordSchemaReference'
          );
        }
        return response;
      } catch (error) {
        return this.recordSchemaFailureFromError('putRecordSchemaReference', error);
      }
    }

    private recordSchemaQueryString(value: unknown, field: string, maximumLength = 512): string {
      if (typeof value !== 'string' || value.length === 0 || value !== value.trim() || value.length > maximumLength) {
        throw new RecordSchemaPersistenceError(
          RECORD_SCHEMA_STORAGE_CODES.INVALID_REFERENCE,
          `Record schema reference query ${field} is invalid.`
        );
      }
      return value;
    }

    private recordSchemaQueryLimit(value: unknown): number {
      if (
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value <= 0 ||
        value > RECORD_SCHEMA_REFERENCE_QUERY_LIMIT_MAX
      ) {
        throw new RecordSchemaPersistenceError(
          RECORD_SCHEMA_STORAGE_CODES.INVALID_REFERENCE,
          `Record schema reference query limit must be between 1 and ${RECORD_SCHEMA_REFERENCE_QUERY_LIMIT_MAX}.`
        );
      }
      return value;
    }

    public async listRecordSchemaGrants(query: string | RecordSchemaGrantQuery): Promise<RecordSchemaReferenceModel[]> {
      try {
        const criteria: Document = { kind: 'grant' };
        let limit = RECORD_SCHEMA_REFERENCE_QUERY_LIMIT_MAX;
        if (typeof query === 'string') {
          criteria.digest = validateRecordSchemaDigest(query);
        } else {
          criteria.digest = validateRecordSchemaDigest(query.digest);
          criteria.brand = this.recordSchemaQueryString(query.brand, 'brand');
          criteria.portal = this.recordSchemaQueryString(query.portal, 'portal');
          limit = this.recordSchemaQueryLimit(query.limit);
        }
        const documents = await this.referenceCollection()
          .find(criteria)
          .sort({ createdAt: 1, referenceKey: 1 })
          .limit(limit)
          .toArray();
        return documents.map(referenceModelFromDocument);
      } catch (error) {
        return this.throwRecordSchemaReadFailure('listRecordSchemaGrants', error);
      }
    }

    public async listRecordSchemaReferences(query: RecordSchemaReferenceQuery): Promise<RecordSchemaReferenceModel[]> {
      try {
        if (!query || typeof query !== 'object') {
          throw new RecordSchemaPersistenceError(
            RECORD_SCHEMA_STORAGE_CODES.INVALID_REFERENCE,
            'Record schema reference query is required.'
          );
        }
        const limit = this.recordSchemaQueryLimit(query.limit);
        const offset = query.offset ?? 0;
        if (!Number.isSafeInteger(offset) || offset < 0) {
          throw new RecordSchemaPersistenceError(
            RECORD_SCHEMA_STORAGE_CODES.INVALID_REFERENCE,
            'Record schema reference query offset must be a non-negative safe integer.'
          );
        }

        const criteria: Document = {};
        if (query.digest !== undefined) {
          criteria.digest = validateRecordSchemaDigest(query.digest);
        }
        if (query.kind !== undefined) {
          if (!['grant', 'save', 'pin'].includes(query.kind)) {
            throw new RecordSchemaPersistenceError(
              RECORD_SCHEMA_STORAGE_CODES.INVALID_REFERENCE,
              'Record schema reference query kind is invalid.'
            );
          }
          criteria.kind = query.kind;
        }
        if (query.schemaKind !== undefined) {
          if (query.schemaKind !== 'create' && query.schemaKind !== 'update') {
            throw new RecordSchemaPersistenceError(
              RECORD_SCHEMA_STORAGE_CODES.INVALID_REFERENCE,
              'Record schema reference query schemaKind is invalid.'
            );
          }
          criteria.schemaKind = query.schemaKind;
        }
        for (const [field, value] of [
          ['brand', query.brand],
          ['portal', query.portal],
          ['recordType', query.recordType],
          ['oid', query.oid],
          ['operation', query.operation],
          ['owner', query.owner],
        ] as const) {
          if (value !== undefined) {
            criteria[field] = this.recordSchemaQueryString(value, field);
          }
        }
        if (query.includeExpiredPins !== undefined && typeof query.includeExpiredPins !== 'boolean') {
          throw new RecordSchemaPersistenceError(
            RECORD_SCHEMA_STORAGE_CODES.INVALID_REFERENCE,
            'Record schema reference query includeExpiredPins must be boolean.'
          );
        }
        if (query.includeExpiredPins !== true) {
          criteria.$and = [
            {
              $or: [{ kind: { $ne: 'pin' } }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
            },
          ];
        }

        const documents = await this.referenceCollection()
          .find(criteria)
          .sort({ createdAt: 1, referenceKey: 1 })
          .skip(offset)
          .limit(limit)
          .toArray();
        return documents.map(referenceModelFromDocument);
      } catch (error) {
        return this.throwRecordSchemaReadFailure('listRecordSchemaReferences', error);
      }
    }

    private storedRecordSchemaDate(value: unknown, field: string): Date {
      const date = value instanceof Date ? value : new Date(String(value ?? ''));
      if (Number.isNaN(date.getTime())) {
        throw new RecordSchemaPersistenceError(
          RECORD_SCHEMA_STORAGE_CODES.STORAGE_FAILED,
          `Stored record schema ${field} is invalid.`
        );
      }
      return date;
    }

    private async liveRecordSchemaReferenceReasons(digest: string, now: Date): Promise<RecordSchemaRetentionReason[]> {
      const collection = this.referenceCollection();
      const [grant, save, pin] = await Promise.all([
        collection.findOne({ digest, kind: 'grant' }, { projection: { _id: 1 } }),
        collection.findOne({ digest, kind: 'save' }, { projection: { _id: 1 } }),
        collection.findOne(
          {
            digest,
            kind: 'pin',
            $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
          },
          { projection: { _id: 1 } }
        ),
      ]);
      const reasons: RecordSchemaRetentionReason[] = [];
      if (grant) {
        reasons.push('grant-reference');
      }
      if (save) {
        reasons.push('save-reference');
      }
      if (pin) {
        reasons.push('active-pin');
      }
      return reasons;
    }

    private async clearRecordSchemaRetentionLock(digest: string, token: string): Promise<void> {
      await this.artifactCollection().updateOne(
        { digest, '_retentionDeleteLock.token': token },
        { $unset: { _retentionDeleteLock: '' } }
      );
    }

    public async deleteRecordSchemaArtifactIfUnreferenced(
      request: RecordSchemaDeleteRequest
    ): Promise<StorageServiceResponse<RecordSchemaDeleteResult>> {
      let acquiredLock: { digest: string; token: string } | undefined;
      try {
        const digest = validateRecordSchemaDigest(request?.digest);
        if (!(request?.now instanceof Date) || Number.isNaN(request.now.getTime())) {
          throw new RecordSchemaPersistenceError(
            RECORD_SCHEMA_STORAGE_CODES.INVALID_ARTIFACT,
            'Record schema retention time must be a valid Date.'
          );
        }
        if (!Number.isSafeInteger(request.minimumAgeDays) || request.minimumAgeDays < 0) {
          throw new RecordSchemaPersistenceError(
            RECORD_SCHEMA_STORAGE_CODES.INVALID_ARTIFACT,
            'Record schema retention minimum age must be a non-negative safe integer.'
          );
        }

        const artifactCollection = this.artifactCollection();
        const artifact = await artifactCollection.findOne({ digest });
        if (!artifact) {
          return this.recordSchemaSuccess({ kind: 'not-found', digest });
        }
        const cutoff = new Date(request.now.getTime() - request.minimumAgeDays * MILLISECONDS_PER_DAY);
        const createdAt = this.storedRecordSchemaDate(artifact.createdAt, 'artifact createdAt');
        if (createdAt.getTime() > cutoff.getTime()) {
          return this.recordSchemaSuccess({
            kind: 'retained',
            digest,
            reasons: ['minimum-age'],
          });
        }

        const initialReasons = await this.liveRecordSchemaReferenceReasons(digest, request.now);
        if (initialReasons.length > 0) {
          return this.recordSchemaSuccess({ kind: 'retained', digest, reasons: initialReasons });
        }

        const token = randomUUID();
        const lockedArtifact = await artifactCollection.findOneAndUpdate(
          {
            digest,
            createdAt: { $lte: cutoff },
            _retentionDeleteLock: { $exists: false },
          },
          {
            $set: {
              _retentionDeleteLock: {
                token,
                acquiredAt: request.now,
              },
            },
          },
          { returnDocument: 'after' }
        );
        if (!lockedArtifact) {
          const stillExists = await artifactCollection.findOne({ digest }, { projection: { _id: 1 } });
          if (!stillExists) {
            return this.recordSchemaSuccess({ kind: 'not-found', digest });
          }
          return this.recordSchemaFailure(
            RECORD_SCHEMA_STORAGE_CODES.STORAGE_FAILED,
            'Record schema artifact retention state changed concurrently.',
            'deleteRecordSchemaArtifactIfUnreferenced'
          );
        }
        acquiredLock = { digest, token };

        // This final bounded recheck is performed after the delete lock is
        // visible to reference writers. It catches a writer that completed
        // immediately before the lock and prevents its reference being lost.
        const finalReasons = await this.liveRecordSchemaReferenceReasons(digest, request.now);
        if (finalReasons.length > 0) {
          await this.clearRecordSchemaRetentionLock(digest, token);
          acquiredLock = undefined;
          return this.recordSchemaSuccess({ kind: 'retained', digest, reasons: finalReasons });
        }

        // Remove only stale rows while the artifact is locked, then remove the
        // artifact. If reference cleanup fails, the artifact remains and the
        // lock is released by the catch path.
        await this.referenceCollection().deleteMany({ digest });
        const deletion = await artifactCollection.deleteOne({
          digest,
          createdAt: { $lte: cutoff },
          '_retentionDeleteLock.token': token,
        });
        if (deletion.deletedCount !== 1) {
          await this.clearRecordSchemaRetentionLock(digest, token);
          acquiredLock = undefined;
          return this.recordSchemaFailure(
            RECORD_SCHEMA_STORAGE_CODES.STORAGE_FAILED,
            'Record schema artifact retention state changed concurrently.',
            'deleteRecordSchemaArtifactIfUnreferenced'
          );
        }
        acquiredLock = undefined;
        return this.recordSchemaSuccess({ kind: 'deleted', digest });
      } catch (error) {
        if (acquiredLock) {
          try {
            await this.clearRecordSchemaRetentionLock(acquiredLock.digest, acquiredLock.token);
          } catch (unlockError) {
            const unlockErrorType = unlockError instanceof Error ? unlockError.name : typeof unlockError;
            sails.log.error(`${this.logHeader} record schema retention unlock failed (${unlockErrorType})`);
          }
        }
        return this.recordSchemaFailureFromError('deleteRecordSchemaArtifactIfUnreferenced', error);
      }
    }

    public async create(
      _brand: BrandingModel,
      record: JsonMap,
      _recordType: unknown,
      _user?: unknown,
      options?: RecordStorageMutationOptions
    ): Promise<StorageMutationResponse> {
      sails.log.verbose(`${this.logHeader} create() -> Begin`);
      // RecordsService may pre-assign the OID so attachment journal rows can
      // be prepared before the primary metadata commit. Preserve it when
      // supplied, while retaining the historical generated-OID behavior.
      record.redboxOid = record.redboxOid ?? this.getUuid();
      const response = this.createMutationResponse(String(record.redboxOid), options);
      const precondition = options?.precondition;
      // A create has no prior revision to compare, so a caller asserting one is
      // addressing a record that this call cannot be. An empty precondition is
      // accepted so callers can pass one normalized options object everywhere.
      if (precondition && (precondition.requireRevision || precondition.expectedRevision !== undefined)) {
        return this.notApplied(response, 'lifecycle-conflict', 'Record creation does not accept an existing revision');
      }
      const serverRecord = _.cloneDeep(record);
      // The storage boundary owns creation revision regardless of anything a
      // request candidate supplied.
      serverRecord.revision = INITIAL_RECORD_REVISION;
      _.unset(serverRecord, '_id');
      _.unset(serverRecord, 'id');
      _.unset(serverRecord, 'incarnationId');
      _.unset(serverRecord, 'lifecycleOperationId');

      const records = this.getNativeRecordCollection();
      if (typeof records?.insertOne !== 'function') {
        return this.notApplied(response, 'capability-unavailable', 'Atomic active record creation is unavailable');
      }

      let identity: { incarnationId: string } | { collision: true } | undefined;
      try {
        identity = await this.claimNewRecordIdentity(String(record.redboxOid));
      } catch {
        return this.unknownMutation(response, 'Durable record identity ownership could not be confirmed');
      }
      if (!identity) {
        return this.notApplied(response, 'capability-unavailable', 'Durable record identity ownership is unavailable');
      }
      if ('collision' in identity) {
        return this.notApplied(response, 'lifecycle-conflict', 'The record OID already has a durable incarnation');
      }
      const now = new Date().toISOString();
      const claimedIncarnationId = identity.incarnationId;
      serverRecord.incarnationId = claimedIncarnationId;
      serverRecord.dateCreated = serverRecord.dateCreated ?? now;
      serverRecord.lastSaveDate = now;

      try {
        sails.log.verbose(`${this.logHeader} Saving to DB...`);
        await records.insertOne(serverRecord);
        this.committed(response, serverRecord, 'updated');
        sails.log.verbose(`${this.logHeader} Record created...`);
      } catch (err) {
        if (this.isDuplicateKeyError(err)) {
          // Another writer owns this OID's state, so its ledger row is correct.
          return this.notApplied(response, 'lifecycle-conflict', 'The record OID already exists');
        }
        sails.log.error(`${this.logHeader} record_create_outcome_unknown`, {
          event: 'record_create_outcome_unknown',
          error_type: err instanceof Error ? err.name : 'unknown',
        });
        let observed: { active: JsonMap | null; tombstone: JsonMap | null } | undefined;
        try {
          observed = await this.readCurrentState(String(record.redboxOid));
        } catch {
          observed = undefined;
        }
        if (observed?.active && this.storedIncarnationId(observed.active) === claimedIncarnationId) {
          return this.committed(response, observed.active, 'updated');
        }
        // A dispatched/ambiguous failure may still materialize later, so only
        // a definitive driver rejection is eligible for compensating release.
        if (this.isCertifiedCreateNonApplication(err)) {
          await this.releaseUnusedRecordIdentity(String(record.redboxOid), claimedIncarnationId);
        }
        this.unknownMutation(response, 'Record creation could not be confirmed');
        return response;
      }
      sails.log.verbose(`${this.logHeader} create() -> End`);
      return response;
    }

    public async updateMeta(
      brand: BrandingModel | null | undefined,
      oid: string,
      record: JsonMap,
      user?: UserModel,
      options?: RecordStorageMutationOptions
    ): Promise<StorageMutationResponse> {
      const response = this.createMutationResponse(oid, options);
      const expectedRevision = this.expectedRevision(options, response);
      if (expectedRevision === null) return response;
      if (expectedRevision === Number.MAX_SAFE_INTEGER) {
        return this.notApplied(response, 'capability-unavailable', 'The record revision cannot be advanced safely');
      }

      const collection = this.getNativeRecordCollection();
      if (!this.supportsAtomicMutation(collection)) {
        return this.notApplied(
          response,
          'capability-unavailable',
          'The storage adapter cannot perform an atomic record revision update'
        );
      }

      const candidate = _.cloneDeep(record);
      // Identity, creation, and revision are owned by storage, never by the
      // candidate; lastSaveDate is reissued with the committing write.
      for (const field of [
        '_id',
        'id',
        'redboxOid',
        'revision',
        'incarnationId',
        'lifecycleOperationId',
        'dateCreated',
        'lastSaveDate',
      ]) {
        _.unset(candidate, field);
      }

      if (this.unsafeCandidateField(candidate) !== undefined) {
        sails.log.error(`${this.logHeader} refusing an update for oid ${oid}: unsupported candidate field name`);
        return this.notApplied(response, 'capability-unavailable', 'Record candidate contains an unsupported field');
      }

      const activeBrandId = this.brandIdOf(brand);
      const candidateSuppliesMetaMetadata = Object.prototype.hasOwnProperty.call(candidate, 'metaMetadata');
      const candidateBrandId = String(_.get(candidate, 'metaMetadata.brandId', '') ?? '').trim();
      if (activeBrandId && candidateSuppliesMetaMetadata && candidateBrandId !== activeBrandId) {
        return this.notApplied(response, 'brand-mismatch', 'Record was not found');
      }

      return this.commitConditionalMutation({
        response,
        kind: 'updated',
        dispatch: () =>
          collection.findOneAndUpdate(
            this.mutationSelector(this.activeIdentity(brand, oid), expectedRevision),
            {
              $set: { ...candidate, lastSaveDate: new Date().toISOString() },
              $inc: { revision: 1 },
            },
            { returnDocument: 'after', includeResultMetadata: false }
          ),
        classify: () => this.classifyActiveNoMatch(brand, oid, expectedRevision),
        expectedRevision,
        onDispatchError: err => {
          sails.log.error(`${this.logHeader} updateMeta() failed for oid ${oid}: ${this.getErrorMessage(err)}`);
          sails.log.error(
            `${this.logHeader} Failed to save update to MongoDB: ${JSON.stringify({
              error: err,
              response,
              brand,
              oid,
              user,
            })}`
          );
        },
      });
    }

    /**
     * Dispatch one atomic conditional mutation and turn its single driver fact
     * into a mutation response.
     *
     * The three outcomes are deliberately distinct: a returned document is an
     * applied commit, `null` certifies that the selector matched nothing and
     * therefore that no write happened, and anything else — including a throw
     * after dispatch — stays `unknown`. A failed follow-up classification only
     * costs the precise reason; it never turns a certified no-match into a
     * write, and it never issues one.
     */
    private async commitConditionalMutation(operation: {
      response: StorageMutationResponse;
      kind: 'updated' | 'removed';
      dispatch: () => Promise<unknown>;
      classify: () => Promise<StorageMutationNonApplicationReason>;
      expectedRevision?: number;
      onDispatchError?: (err: unknown) => void;
    }): Promise<StorageMutationResponse> {
      const { response, kind, dispatch, classify, expectedRevision, onDispatchError } = operation;
      let document: JsonMap | null | undefined;
      try {
        document = this.mutationDocument(await dispatch());
      } catch (err) {
        onDispatchError?.(err);
        return this.unknownMutation(response, this.getErrorMessage(err));
      }
      if (document === undefined) {
        return this.unknownMutation(response, 'Storage returned an unrecognized mutation result');
      }
      if (document !== null) {
        return this.committed(response, document, kind, expectedRevision);
      }
      try {
        return this.notApplied(response, await classify());
      } catch (err) {
        sails.log.error(
          `${this.logHeader} could not classify a certified no-match for oid ${response.oid}: ` +
            this.getErrorMessage(err)
        );
        return this.notApplied(response, 'capability-unavailable');
      }
    }

    public async removeActiveRecord(
      brand: BrandingModel | null | undefined,
      oid: string,
      options?: RecordStorageMutationOptions
    ): Promise<StorageMutationResponse> {
      const response = this.createMutationResponse(oid, options);
      const expectedRevision = this.expectedRevision(options, response);
      if (expectedRevision === null) return response;
      const collection = this.getNativeRecordCollection();
      if (!this.supportsAtomicMutation(collection)) {
        return this.notApplied(response, 'capability-unavailable', 'Atomic active record removal is unavailable');
      }

      let current: JsonMap | null | undefined;
      try {
        current = this.mutationDocument(
          await collection.findOne(this.mutationSelector(this.activeIdentity(brand, oid), expectedRevision))
        );
        if (current && !(await this.ensureRecordIdentity(oid, current))) {
          return this.notApplied(
            response,
            'capability-unavailable',
            'Durable record identity ownership is unavailable'
          );
        }
      } catch (error) {
        return this.unknownMutation(response, this.getErrorMessage(error));
      }

      return this.commitConditionalMutation({
        response,
        kind: 'removed',
        dispatch: () =>
          collection.findOneAndDelete(this.mutationSelector(this.activeIdentity(brand, oid), expectedRevision), {
            includeResultMetadata: false,
          }),
        classify: () => this.classifyActiveNoMatch(brand, oid, expectedRevision),
        expectedRevision,
      });
    }

    public async createTombstone(
      brand: BrandingModel | null | undefined,
      oid: string,
      record: JsonMap,
      options?: RecordStorageMutationOptions
    ): Promise<StorageMutationResponse> {
      const response = this.createMutationResponse(oid, options);
      const expectedRevision = this.expectedRevision(options, response);
      if (expectedRevision === null) return response;
      if (expectedRevision === undefined || !isCanonicalSaveRequestId(options?.lifecycle?.operationId)) {
        return this.notApplied(response, 'capability-unavailable', 'Exact lifecycle intent ownership is required');
      }
      const collection = this.getNativeTombstoneCollection();
      if (!this.supportsAtomicMutation(collection) || typeof collection.insertOne !== 'function') {
        return this.notApplied(response, 'capability-unavailable', 'Atomic tombstone creation is unavailable');
      }

      const candidate = _.cloneDeep(record);
      for (const field of ['_id', 'id']) _.unset(candidate, field);
      const operation = candidate.lifecycleOperation;
      const targetRevision = nextRecordRevision(expectedRevision);
      const expectedState = options.lifecycle.expectedState;
      if (
        candidate.redboxOid !== oid ||
        candidate.revision !== targetRevision ||
        !isDeletedRecordLifecycleState(candidate.lifecycleState) ||
        !isDeletedRecordLifecycleOperation(operation) ||
        (expectedState !== 'delete-pending' && expectedState !== 'purge-pending') ||
        candidate.lifecycleState !== expectedState ||
        !isDeletedRecordLifecycleOperationForState(candidate.lifecycleState, operation.kind) ||
        operation.operationId !== options.lifecycle.operationId ||
        operation.sourceRevision !== expectedRevision ||
        operation.targetRevision !== targetRevision
      ) {
        return this.notApplied(response, 'lifecycle-conflict', 'Tombstone lifecycle intent is invalid');
      }
      const requestedBrandId = this.brandIdOf(brand);
      const candidateBrandId = String(candidate.brandId ?? '').trim();
      const snapshotBrandId = String(_.get(candidate, 'deletedRecordMetadata.metaMetadata.brandId', '') ?? '').trim();
      if (requestedBrandId && (candidateBrandId !== requestedBrandId || snapshotBrandId !== requestedBrandId)) {
        return this.notApplied(response, 'brand-mismatch', 'Tombstone was not found');
      }
      if (
        !candidate.deletedRecordMetadata ||
        typeof candidate.deletedRecordMetadata !== 'object' ||
        Array.isArray(candidate.deletedRecordMetadata) ||
        _.get(candidate, 'deletedRecordMetadata.redboxOid') !== oid
      ) {
        return this.notApplied(response, 'lifecycle-conflict', 'Tombstone record snapshot is invalid');
      }
      _.unset(candidate, 'deletedRecordMetadata.revision');
      let incarnationId: string | undefined;
      try {
        incarnationId = await this.ensureRecordIdentity(oid, candidate.deletedRecordMetadata as JsonMap);
      } catch (error) {
        return this.unknownMutation(response, this.getErrorMessage(error));
      }
      if (!incarnationId) {
        return this.notApplied(response, 'capability-unavailable', 'Durable record identity ownership is unavailable');
      }
      const suppliedIncarnationId =
        this.storedIncarnationId(candidate) ?? this.storedIncarnationId(candidate.deletedRecordMetadata as JsonMap);
      if (suppliedIncarnationId && suppliedIncarnationId !== incarnationId) {
        return this.notApplied(response, 'lifecycle-conflict', 'Tombstone incarnation identity diverged');
      }
      candidate.incarnationId = incarnationId;
      (candidate.deletedRecordMetadata as JsonMap).incarnationId = incarnationId;

      try {
        await collection.insertOne(candidate);
        return this.committed(response, candidate, 'updated', expectedRevision);
      } catch (error) {
        if (!this.isDuplicateKeyError(error)) {
          return this.unknownMutation(response, this.getErrorMessage(error));
        }
        try {
          const existing = this.mutationDocument(await collection.findOne({ redboxOid: oid }));
          if (existing === undefined)
            return this.unknownMutation(response, 'Tombstone ownership could not be observed');
          if (existing === null) return this.notApplied(response, 'lifecycle-conflict');
          if (!this.isRequestedBrand(existing, requestedBrandId)) return this.notApplied(response, 'brand-mismatch');
          const existingOperation = existing.lifecycleOperation;
          if (
            !isRecordRevision(existing.revision) ||
            existing.revision < targetRevision ||
            !isDeletedRecordLifecycleState(existing.lifecycleState) ||
            !isDeletedRecordLifecycleOperation(existingOperation) ||
            !isDeletedRecordLifecycleOperationForState(existing.lifecycleState, existingOperation.kind) ||
            existingOperation.operationId !== options.lifecycle.operationId ||
            existingOperation.kind !== operation.kind
          ) {
            return this.notApplied(response, 'lifecycle-conflict');
          }
          return this.committed(response, existing, 'updated');
        } catch (readError) {
          return this.unknownMutation(response, this.getErrorMessage(readError));
        }
      }
    }

    public async updateTombstone(
      brand: BrandingModel | null | undefined,
      oid: string,
      record: JsonMap,
      options?: RecordStorageMutationOptions
    ): Promise<StorageMutationResponse> {
      const response = this.createMutationResponse(oid, options);
      const expectedRevision = this.expectedRevision(options, response);
      if (expectedRevision === null) return response;
      if (expectedRevision === Number.MAX_SAFE_INTEGER) {
        return this.notApplied(response, 'capability-unavailable', 'The tombstone revision cannot be advanced safely');
      }
      const collection = this.getNativeTombstoneCollection();
      if (!this.supportsAtomicMutation(collection)) {
        return this.notApplied(response, 'capability-unavailable', 'Atomic tombstone update is unavailable');
      }
      if (expectedRevision === undefined || !options?.lifecycle?.expectedState) {
        return this.notApplied(response, 'capability-unavailable', 'Exact lifecycle state and revision are required');
      }

      const candidate = _.cloneDeep(record);
      for (const field of ['_id', 'id', 'redboxOid', 'revision', 'incarnationId', 'dateDeleted'])
        _.unset(candidate, field);
      if (this.unsafeCandidateField(candidate) !== undefined) {
        sails.log.error(`${this.logHeader} refusing a tombstone update for oid ${oid}: unsupported candidate field`);
        return this.notApplied(response, 'capability-unavailable', 'Tombstone candidate contains an unsupported field');
      }
      if (!isDeletedRecordLifecycleState(candidate.lifecycleState)) {
        return this.notApplied(response, 'lifecycle-conflict', 'Tombstone lifecycle state is invalid');
      }
      const operation = candidate.lifecycleOperation;
      if (
        !isDeletedRecordLifecycleOperation(operation) ||
        !isDeletedRecordLifecycleOperationForState(candidate.lifecycleState, operation.kind) ||
        operation.sourceRevision > expectedRevision ||
        operation.targetRevision !== nextRecordRevision(expectedRevision) ||
        (options.lifecycle.operationId !== undefined && operation.operationId !== options.lifecycle.operationId)
      ) {
        return this.notApplied(response, 'lifecycle-conflict', 'Tombstone lifecycle operation is invalid');
      }
      if (
        candidate.deletedRecordMetadata !== undefined &&
        (candidate.deletedRecordMetadata === null ||
          typeof candidate.deletedRecordMetadata !== 'object' ||
          Array.isArray(candidate.deletedRecordMetadata))
      ) {
        return this.notApplied(response, 'lifecycle-conflict', 'Tombstone record snapshot is invalid');
      }
      if (candidate.deletedRecordMetadata && typeof candidate.deletedRecordMetadata === 'object') {
        // The wrapper is the sole current lifecycle revision authority. Source
        // lineage lives in lifecycleOperation.sourceRevision.
        _.unset(candidate, 'deletedRecordMetadata.revision');
      }

      try {
        const current = this.mutationDocument(
          await collection.findOne(
            this.lifecycleMutationSelector(this.tombstoneIdentity(brand, oid), expectedRevision, options)
          )
        );
        if (current) {
          const incarnationId = await this.ensureRecordIdentity(oid, current);
          if (!incarnationId) {
            return this.notApplied(
              response,
              'capability-unavailable',
              'Durable record identity ownership is unavailable'
            );
          }
          if (candidate.deletedRecordMetadata && typeof candidate.deletedRecordMetadata === 'object') {
            (candidate.deletedRecordMetadata as JsonMap).incarnationId = incarnationId;
          }
        }
      } catch (error) {
        return this.unknownMutation(response, this.getErrorMessage(error));
      }

      const activeBrandId = this.brandIdOf(brand);
      const candidateBrandId = String(candidate.brandId ?? '').trim();
      const candidateSuppliesBrandId = Object.prototype.hasOwnProperty.call(candidate, 'brandId');
      const candidateSuppliesSnapshot = Object.prototype.hasOwnProperty.call(candidate, 'deletedRecordMetadata');
      const candidateSnapshotBrandId = String(
        _.get(candidate, 'deletedRecordMetadata.metaMetadata.brandId', '') ?? ''
      ).trim();
      if (
        activeBrandId &&
        ((candidateSuppliesBrandId && candidateBrandId !== activeBrandId) ||
          (candidateSuppliesSnapshot && candidateSnapshotBrandId !== activeBrandId))
      ) {
        return this.notApplied(response, 'brand-mismatch', 'Tombstone was not found');
      }

      return this.commitConditionalMutation({
        response,
        kind: 'updated',
        dispatch: () =>
          collection.findOneAndUpdate(
            this.lifecycleMutationSelector(this.tombstoneIdentity(brand, oid), expectedRevision, options),
            { $set: candidate, $inc: { revision: 1 } },
            { returnDocument: 'after', includeResultMetadata: false }
          ),
        classify: () => this.classifyLifecycleTombstoneNoMatch(brand, oid, expectedRevision, options),
        expectedRevision,
      });
    }

    public async removeTombstone(
      brand: BrandingModel | null | undefined,
      oid: string,
      options?: RecordStorageMutationOptions
    ): Promise<StorageMutationResponse> {
      const response = this.createMutationResponse(oid, options);
      const expectedRevision = this.expectedRevision(options, response);
      if (expectedRevision === null) return response;
      if (
        expectedRevision === undefined ||
        !options?.lifecycle?.expectedState ||
        !isCanonicalSaveRequestId(options.lifecycle.operationId)
      ) {
        return this.notApplied(response, 'capability-unavailable', 'Exact lifecycle removal ownership is required');
      }
      const collection = this.getNativeTombstoneCollection();
      if (!this.supportsAtomicMutation(collection)) {
        return this.notApplied(response, 'capability-unavailable', 'Atomic tombstone removal is unavailable');
      }

      try {
        const current = this.mutationDocument(
          await collection.findOne(
            this.lifecycleMutationSelector(this.tombstoneIdentity(brand, oid), expectedRevision, options)
          )
        );
        if (current && !(await this.ensureRecordIdentity(oid, current))) {
          return this.notApplied(
            response,
            'capability-unavailable',
            'Durable record identity ownership is unavailable'
          );
        }
      } catch (error) {
        return this.unknownMutation(response, this.getErrorMessage(error));
      }

      return this.commitConditionalMutation({
        response,
        kind: 'removed',
        dispatch: () =>
          collection.findOneAndDelete(
            this.lifecycleMutationSelector(this.tombstoneIdentity(brand, oid), expectedRevision, options),
            { includeResultMetadata: false }
          ),
        classify: () => this.classifyLifecycleTombstoneNoMatch(brand, oid, expectedRevision, options),
        expectedRevision,
      });
    }

    public async createActiveRecordFromTombstone(
      brand: BrandingModel | null | undefined,
      oid: string,
      record: JsonMap,
      options?: RecordStorageMutationOptions
    ): Promise<StorageMutationResponse> {
      const response = this.createMutationResponse(oid, options);
      const expectedRevision = this.expectedRevision(options, response);
      const operationId = options?.lifecycle?.operationId;
      if (
        expectedRevision === null ||
        expectedRevision === undefined ||
        !isCanonicalSaveRequestId(operationId) ||
        (options?.lifecycle?.expectedState !== 'restore-pending' &&
          options?.lifecycle?.expectedState !== 'recovery-required')
      ) {
        return this.notApplied(response, 'capability-unavailable', 'Exact restore ownership is required');
      }
      const records = this.getNativeRecordCollection();
      const tombstones = this.getNativeTombstoneCollection();
      if (
        !this.supportsAtomicMutation(records) ||
        !this.supportsAtomicMutation(tombstones) ||
        typeof records.insertOne !== 'function'
      ) {
        return this.notApplied(response, 'capability-unavailable', 'Atomic restore creation is unavailable');
      }

      let claimed: JsonMap | null | undefined;
      try {
        claimed = this.mutationDocument(
          await tombstones.findOne(
            this.lifecycleMutationSelector(this.tombstoneIdentity(brand, oid), expectedRevision, options)
          )
        );
      } catch (error) {
        return this.unknownMutation(response, this.getErrorMessage(error));
      }
      if (claimed === undefined) return this.unknownMutation(response, 'Restore ownership could not be observed');
      if (claimed === null) {
        const reason = await this.classifyLifecycleTombstoneNoMatch(brand, oid, expectedRevision, options).catch(
          () => 'capability-unavailable' as const
        );
        return this.notApplied(response, reason);
      }

      const targetRevision = nextRecordRevision(expectedRevision);
      const claimedOperation = claimed.lifecycleOperation;
      const claimedSnapshot = claimed.deletedRecordMetadata;
      if (
        !isDeletedRecordLifecycleState(claimed.lifecycleState) ||
        !isDeletedRecordLifecycleOperation(claimedOperation) ||
        !isDeletedRecordLifecycleOperationForState(claimed.lifecycleState, claimedOperation.kind) ||
        claimedOperation.kind !== 'restore' ||
        claimedOperation.operationId !== operationId ||
        claimedOperation.targetRevision !== expectedRevision ||
        !claimedSnapshot ||
        typeof claimedSnapshot !== 'object' ||
        Array.isArray(claimedSnapshot)
      ) {
        return this.notApplied(response, 'lifecycle-conflict', 'Claimed restore state is invalid');
      }
      let incarnationId: string | undefined;
      try {
        incarnationId = await this.ensureRecordIdentity(oid, claimed);
      } catch (error) {
        return this.unknownMutation(response, this.getErrorMessage(error));
      }
      if (!incarnationId) {
        return this.notApplied(response, 'capability-unavailable', 'Durable record identity ownership is unavailable');
      }
      const claimedIncarnationId =
        this.storedIncarnationId(claimed) ?? this.storedIncarnationId(claimedSnapshot as JsonMap);
      if (claimedIncarnationId && claimedIncarnationId !== incarnationId) {
        return this.notApplied(response, 'lifecycle-conflict', 'Restore incarnation identity diverged');
      }

      const restoredInput = _.cloneDeep(record);
      const restored = _.cloneDeep(claimedSnapshot as JsonMap);
      for (const field of ['_id', 'id', 'revision', 'incarnationId', 'lifecycleOperationId', 'lastSaveDate']) {
        _.unset(restored, field);
      }
      const requestedBrandId = this.brandIdOf(brand);
      if (
        restoredInput.redboxOid !== oid ||
        restored.redboxOid !== oid ||
        (requestedBrandId &&
          (String(_.get(restoredInput, 'metaMetadata.brandId', '') ?? '').trim() !== requestedBrandId ||
            String(_.get(restored, 'metaMetadata.brandId', '') ?? '').trim() !== requestedBrandId))
      ) {
        return this.notApplied(response, 'brand-mismatch', 'Record was not found');
      }
      if (this.unsafeCandidateField(restored) !== undefined) {
        return this.notApplied(response, 'lifecycle-conflict', 'Restored record contains an unsupported field');
      }
      const candidate = {
        ...restored,
        redboxOid: oid,
        revision: targetRevision,
        incarnationId,
        lifecycleOperationId: operationId,
        lastSaveDate: new Date().toISOString(),
      };
      try {
        await records.insertOne(candidate);
        return this.committed(response, candidate, 'updated', expectedRevision);
      } catch (error) {
        if (!this.isDuplicateKeyError(error)) {
          return this.unknownMutation(response, this.getErrorMessage(error));
        }
        try {
          const existing = this.mutationDocument(await records.findOne({ redboxOid: oid }));
          if (existing === undefined)
            return this.unknownMutation(response, 'Restored active state could not be observed');
          if (existing === null) return this.notApplied(response, 'lifecycle-conflict');
          if (!this.isRequestedBrand(existing, requestedBrandId)) return this.notApplied(response, 'brand-mismatch');
          if (
            existing.lifecycleOperationId !== operationId ||
            !isRecordRevision(existing.revision) ||
            existing.revision < targetRevision
          ) {
            return this.notApplied(response, 'lifecycle-conflict');
          }
          return this.committed(response, existing, 'updated');
        } catch (readError) {
          return this.unknownMutation(response, this.getErrorMessage(readError));
        }
      }
    }

    public async getTombstone(
      brand: BrandingModel | null | undefined,
      oid: string
    ): Promise<DeletedRecordModel | null> {
      if (!oid.trim()) throw new Error(`${this.logHeader} getTombstone() -> refusing to search using an empty OID`);
      const collection = this.getNativeTombstoneCollection();
      if (typeof collection?.findOne !== 'function') throw new Error('Tombstone reads are unavailable');
      const result = this.mutationDocument(await collection.findOne(this.tombstoneIdentity(brand, oid)));
      if (result === undefined) throw new Error('Storage returned an unrecognized tombstone result');
      return result as unknown as DeletedRecordModel | null;
    }

    public async getLifecycleTombstones(states: readonly string[], limit = 100): Promise<DeletedRecordModel[]> {
      const normalizedStates = states.filter(isDeletedRecordLifecycleState);
      if (normalizedStates.length === 0) return [];
      const collection = this.getNativeTombstoneCollection();
      if (typeof collection?.find !== 'function') throw new Error('Lifecycle recovery scans are unavailable');
      const boundedLimit = Math.max(1, Math.min(Number.isSafeInteger(limit) ? limit : 100, 1000));
      return (await collection
        .find({ lifecycleState: { $in: normalizedStates } })
        .limit(boundedLimit)
        .toArray()) as unknown as DeletedRecordModel[];
    }

    public async getMeta(oid: string): Promise<RecordModel> {
      if (_.isEmpty(oid)) {
        const msg = `${this.logHeader} getMeta() -> refusing to search using an empty OID`;
        sails.log.error(msg);
        throw new Error(msg);
      }
      const criteria = { redboxOid: oid };
      sails.log.verbose(`${this.logHeader} finding: `);
      sails.log.verbose(JSON.stringify(criteria));
      return (await Record.findOne(criteria)) as RecordModel;
    }

    public async getDeletedRecordMeta(oid: string): Promise<RecordModel | null> {
      if (_.isEmpty(oid)) {
        const msg = `${this.logHeader} getDeletedRecordMeta() -> refusing to search using an empty OID`;
        sails.log.error(msg);
        throw new Error(msg);
      }
      const criteria = { redboxOid: oid };
      sails.log.verbose(`${this.logHeader} finding deleted record: `);
      sails.log.verbose(JSON.stringify(criteria));
      const deletedRecord = await DeletedRecord.findOne(criteria);
      if (!deletedRecord?.deletedRecordMetadata) return null;
      const revision = isRecordRevision(deletedRecord.revision) ? deletedRecord.revision : INITIAL_RECORD_REVISION;
      // Tombstone wrapper revision is authoritative even when a legacy
      // embedded snapshot still contains a historical active revision.
      return { ...deletedRecord.deletedRecordMetadata, revision } as RecordModel;
    }

    public async createBatch(
      type: string,
      data: JsonMap[],
      harvestIdFldName: string
    ): Promise<StorageMutationResponse> {
      const response = new StorageMutationResponse();
      let notAppliedCount = 0;
      let unknownCount = 0;
      for (const [rowIndex, dataItem] of data.entries()) {
        dataItem.harvestId = _.get(dataItem, harvestIdFldName, '');
        _.set(dataItem, 'metaMetadata.type', type);
        try {
          const rowResponse = await this.create(null, dataItem, null, null);
          if (rowResponse.applicationState === 'applied' && rowResponse.success === true) {
            continue;
          }
          if (rowResponse.applicationState === 'not-applied') {
            notAppliedCount += 1;
            sails.log.error(`${this.logHeader} createBatch row was not applied`, {
              event: 'record_batch_create_row_not_applied',
              row_index: rowIndex,
            });
            continue;
          }
          unknownCount += 1;
          sails.log.error(`${this.logHeader} createBatch row outcome is unknown`, {
            event: 'record_batch_create_row_unknown',
            row_index: rowIndex,
          });
        } catch {
          unknownCount += 1;
          sails.log.error(`${this.logHeader} createBatch row outcome is unknown`, {
            event: 'record_batch_create_row_unknown',
            row_index: rowIndex,
          });
        }
      }
      response.success = notAppliedCount === 0 && unknownCount === 0;
      response.applicationState = unknownCount > 0 ? 'unknown' : notAppliedCount > 0 ? 'not-applied' : 'applied';
      response.message = response.success
        ? ''
        : `Batch create incomplete (${notAppliedCount} not applied, ${unknownCount} unknown).`;
      return response;
    }

    public async provideUserAccessAndRemovePendingAccess(
      oid: string,
      _userid: unknown,
      _pendingValue: unknown
    ): Promise<StorageMutationResponse> {
      return this.notApplied(
        this.createMutationResponse(oid),
        'capability-unavailable',
        'Permission rewrites require the authoritative RecordsService mutation pipeline'
      );
    }

    public async getRelatedRecords(
      oid: string,
      brand: BrandingModel,
      options: RecordRelationshipExpandOptions = {}
    ): Promise<RecordRelationshipGraph> {
      const mappingContext = await this.walkRelatedRecords(String(oid ?? ''), brand, options);
      return {
        rootOid: mappingContext.rootOid,
        edges: mappingContext.edges,
        relatedObjects: mappingContext.relatedObjects,
        omittedByAccess: mappingContext.omittedByAccess,
      };
    }

    private async walkRelatedRecords(
      oid: string,
      brand: BrandingModel,
      options: RecordRelationshipExpandOptions,
      recordTypeName: string | null = null,
      mappingContext: RelatedRecordsContext | null = null,
      currentDepth = 0
    ): Promise<RelatedRecordsContext> {
      const normalizedOid = String(oid ?? '').trim();
      if (!normalizedOid) {
        throw new Error('Record oid is required to load related records.');
      }

      const record = (await this.getMeta(normalizedOid)) as JsonMap;
      const currentRecordTypeName = String(recordTypeName ?? _.get(record, 'metaMetadata.type', '')).trim();
      const maxDepth =
        typeof options.depth === 'number' && options.depth >= 0 ? options.depth : Number.POSITIVE_INFINITY;
      const includeRecordTypes = new Set(
        (options.includeRecordTypes ?? []).map(value => String(value ?? '').trim()).filter(Boolean)
      );
      const includeRelationIds = new Set(
        (options.includeRelationIds ?? []).map(value => String(value ?? '').trim()).filter(Boolean)
      );

      if (_.isEmpty(mappingContext)) {
        mappingContext = {
          rootOid: normalizedOid,
          processedRelationships: [],
          relatedObjects: {},
          edges: [],
          omittedByAccess: {},
          visitedTraversalKeys: new Set<string>(),
          visitedEdgeKeys: new Set<string>(),
          visitedRelatedObjectKeys: new Set<string>(),
        };
      }

      this.addRelatedObject(mappingContext, currentRecordTypeName, record as MongoRecordDocument);
      if (!_.includes(mappingContext.processedRelationships, currentRecordTypeName)) {
        mappingContext.processedRelationships.push(currentRecordTypeName);
      }

      if (currentDepth >= maxDepth) {
        return mappingContext;
      }

      const recordType = await firstValueFrom(RecordTypesService.get(brand, currentRecordTypeName));
      const relatedTo = normalizeRecordRelations(currentRecordTypeName, _.get(recordType, 'relatedTo', []));
      if (_.isEmpty(relatedTo)) {
        sails.log.verbose(`${this.logHeader} RecordType has no relationships: ${currentRecordTypeName}`);
        return mappingContext;
      }

      for (const relationship of relatedTo) {
        if (includeRelationIds.size > 0 && !includeRelationIds.has(relationship.id)) {
          continue;
        }
        if (includeRecordTypes.size > 0 && !includeRecordTypes.has(relationship.recordType)) {
          continue;
        }

        const traversalKey = `${normalizedOid}::${relationship.id}`;
        if (mappingContext.visitedTraversalKeys.has(traversalKey)) {
          continue;
        }
        mappingContext.visitedTraversalKeys.add(traversalKey);

        sails.log.verbose(`${this.logHeader} Processing relationship:`);
        sails.log.verbose(JSON.stringify(relationship));

        const localValues = this.extractRelationshipLocalValues(record, relationship);
        if (_.isEmpty(localValues)) {
          continue;
        }

        const criteria = this.buildRelationshipCriteria(relationship, localValues);
        sails.log.verbose(`${this.logHeader} Finding related records criteria:`);
        sails.log.verbose(JSON.stringify(criteria));

        const relatedRecords = await this.findRelatedRecords(relationship, criteria);
        sails.log.verbose(`${this.logHeader} Got related records:`);
        sails.log.verbose(JSON.stringify(relatedRecords));

        for (const relatedRecord of relatedRecords as JsonMap[]) {
          const edge = this.buildRelationshipEdge(relationship, currentRecordTypeName, normalizedOid, relatedRecord);
          if (_.isNil(edge)) {
            continue;
          }
          const relatedRecordOid = edge.relatedRecordOid;

          this.addRelatedObject(mappingContext, relationship.recordType, relatedRecord as MongoRecordDocument);
          if (!_.includes(mappingContext.processedRelationships, relationship.recordType)) {
            mappingContext.processedRelationships.push(relationship.recordType);
          }

          const edgeKey = `${relationship.id}::${edge.sourceOid}::${edge.targetOid}`;
          if (!mappingContext.visitedEdgeKeys.has(edgeKey)) {
            mappingContext.visitedEdgeKeys.add(edgeKey);
            mappingContext.edges.push({
              relationId: relationship.id,
              label: relationship.label,
              sourceOid: edge.sourceOid,
              targetOid: edge.targetOid,
              targetRecordType: edge.targetRecordType,
            });
          }

          mappingContext = await this.walkRelatedRecords(
            relatedRecordOid,
            brand,
            options,
            null,
            mappingContext,
            currentDepth + 1
          );
        }
      }

      return mappingContext;
    }

    private addRelatedObject(
      mappingContext: RelatedRecordsContext,
      recordTypeName: string,
      record: MongoRecordDocument
    ) {
      const normalizedRecordTypeName = String(recordTypeName ?? '').trim();
      const recordOid = String((record as JsonMap).redboxOid ?? '').trim();
      if (!normalizedRecordTypeName || !recordOid) {
        return;
      }

      const relatedObjectKey = `${normalizedRecordTypeName}::${recordOid}`;
      if (mappingContext.visitedRelatedObjectKeys.has(relatedObjectKey)) {
        return;
      }
      mappingContext.visitedRelatedObjectKeys.add(relatedObjectKey);

      if (_.isEmpty(mappingContext.relatedObjects[normalizedRecordTypeName])) {
        mappingContext.relatedObjects[normalizedRecordTypeName] = [];
      }
      mappingContext.relatedObjects[normalizedRecordTypeName].push(record);
    }

    private extractRelationshipLocalValues(record: JsonMap, relationship: NormalizedRecordRelation): string[] {
      const rawValue = _.get(
        record,
        relationship.localField,
        relationship.localField === 'redboxOid' ? record.redboxOid : undefined
      );
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      return values.map(value => String(value ?? '').trim()).filter(value => value !== '');
    }

    private buildRelationshipCriteria(relationship: NormalizedRecordRelation, localValues: string[]): JsonMap {
      const criteria: JsonMap = {
        'metaMetadata.type': relationship.recordType,
      };

      criteria[relationship.foreignField] = localValues.length === 1 ? localValues[0] : { in: localValues };

      return criteria;
    }

    private async findRelatedRecords(relationship: NormalizedRecordRelation, criteria: JsonMap): Promise<JsonMap[]> {
      const query = Record.find(criteria) as {
        sort?: (value: string) => unknown;
        limit?: (value: number) => unknown;
        meta: (value: JsonMap) => Promise<JsonMap[]>;
      };

      if (relationship.cardinality === 'one' && typeof query.sort === 'function' && typeof query.limit === 'function') {
        const chainedQuery = query.sort('redboxOid ASC') as {
          limit?: (value: number) => unknown;
          meta: (value: JsonMap) => Promise<JsonMap[]>;
        };
        if (typeof chainedQuery.limit === 'function') {
          return await (chainedQuery.limit(1) as { meta: (value: JsonMap) => Promise<JsonMap[]> }).meta({
            enableExperimentalDeepTargets: true,
          });
        }
      }

      const relatedRecords = await query.meta({ enableExperimentalDeepTargets: true });
      if (relationship.cardinality !== 'one') {
        return relatedRecords;
      }

      return [...relatedRecords]
        .sort((left, right) =>
          String(_.get(left, 'redboxOid', '')).localeCompare(String(_.get(right, 'redboxOid', '')))
        )
        .slice(0, 1);
    }

    private buildRelationshipEdge(
      relationship: NormalizedRecordRelation,
      currentRecordTypeName: string,
      currentOid: string,
      relatedRecord: JsonMap
    ): { relatedRecordOid: string; sourceOid: string; targetOid: string; targetRecordType: string } | undefined {
      const relatedRecordOid = String(_.get(relatedRecord, 'redboxOid', '')).trim();
      if (!relatedRecordOid) {
        return undefined;
      }

      if (relationship.direction === 'inbound') {
        return {
          relatedRecordOid,
          sourceOid: relatedRecordOid,
          targetOid: currentOid,
          targetRecordType: currentRecordTypeName,
        };
      }

      return {
        relatedRecordOid,
        sourceOid: currentOid,
        targetOid: relatedRecordOid,
        targetRecordType: relationship.recordType,
      };
    }
    public async delete(
      oid: string,
      _permanentlyDelete: boolean = false,
      options?: RecordStorageMutationOptions
    ): Promise<StorageServiceResponse> {
      return this.notApplied(
        this.createMutationResponse(oid, options),
        'capability-unavailable',
        'Record deletion requires staged lifecycle orchestration'
      );
    }

    public async updateNotificationLog(oid: string, record: JsonMap, options: JsonMap): Promise<unknown> {
      if (super.metTriggerCondition(oid, record, options) == 'true') {
        if (_.get(options, 'saveRecord', false)) {
          return this.notApplied(
            this.createMutationResponse(oid),
            'capability-unavailable',
            'Notification writes require the authoritative RecordsService mutation pipeline'
          );
        }
        sails.log.verbose(`${this.logHeader} Updating notification log for oid: ${oid}`);
        const logName = _.get(options, 'logName', null);
        if (logName) {
          let log = _.get(record, logName, null);
          const entry = { date: DateTime.now().toFormat("yyyy-LL-dd'T'HH:mm:ss") };
          if (log) {
            log.push(entry);
          } else {
            log = [entry];
          }
          _.set(record, logName, log);
        }
        const updateFlagName = _.get(options, 'flagName', null);
        if (updateFlagName) {
          _.set(record, updateFlagName, _.get(options, 'flagVal', null));
        }
        sails.log.verbose(`======== Notification log updates =========`);
        sails.log.verbose(JSON.stringify(record));
        sails.log.verbose(`======== End update =========`);
      } else {
        sails.log.verbose(
          `Notification log name: '${options.name}', for oid: ${oid}, not running, condition not met: ${options.triggerCondition}`
        );
        sails.log.verbose(JSON.stringify(record));
      }
      return record;
    }

    public async getDeletedRecords(
      workflowState: string,
      recordType = undefined,
      start: number,
      rows = 10,
      username: string,
      roles: RoleModel[],
      brand: BrandingModel,
      _editAccessOnly = undefined,
      packageType = undefined,
      sort = undefined,
      filterFields = undefined,
      filterString = undefined,
      filterMode: string = 'regex',
      secondarySort = undefined
    ) {
      const query = {
        'deletedRecordMetadata.metaMetadata.brandId': brand.id,
      };
      const options = {
        limit: _.toNumber(rows),
        skip: _.toNumber(start),
      };
      if (_.isEmpty(sort)) {
        sort = '{"lastSaveDate": -1}';
      }
      sails.log.verbose(`Sort is: ${sort}`);
      if (_.indexOf(`${sort}`, '1') == -1) {
        sort = `{"${sort}":-1}`;
      } else {
        try {
          options['sort'] = JSON.parse(sort);
        } catch (_error) {
          options['sort'] = {};
          options['sort'][`${sort.substring(0, sort.indexOf(':'))}`] = _.toNumber(
            sort.substring(sort.indexOf(':') + 1)
          );
        }
      }

      if (!_.isEmpty(secondarySort)) {
        options['sort'][`${secondarySort.substring(0, secondarySort.indexOf(':'))}`] = _.toNumber(
          secondarySort.substring(secondarySort.indexOf(':') + 1)
        );
      }

      const roleNames = this.getRoleNames(roles, brand);
      const andArray = [];
      const permissions = {
        $or: [
          { 'deletedRecordMetadata.authorization.view': username },
          { 'deletedRecordMetadata.authorization.edit': username },
          { 'deletedRecordMetadata.authorization.editRoles': { $in: roleNames } },
          { 'deletedRecordMetadata.authorization.viewRoles': { $in: roleNames } },
        ],
      };
      andArray.push(permissions);
      if (!_.isUndefined(recordType) && !_.isEmpty(recordType)) {
        const typeArray = [];
        _.each(recordType, rType => {
          typeArray.push({ 'deletedRecordMetadata.metaMetadata.type': rType });
        });
        andArray.push({ $or: typeArray });
      }
      if (!_.isUndefined(packageType) && !_.isEmpty(packageType)) {
        const typeArray = [];
        _.each(packageType, rType => {
          typeArray.push({ 'deletedRecordMetadata.metaMetadata.packageType': rType });
        });
        andArray.push({ $or: typeArray });
      }
      if (workflowState != undefined) {
        query['deletedRecordMetadata.workflow.stage'] = workflowState;
      }
      if (!_.isEmpty(filterString) && !_.isEmpty(filterFields)) {
        const escapedFilterString = this.escapeRegExp(filterString);
        sails.log.verbose('escapedFilterString ' + escapedFilterString);
        for (const filterField of filterFields) {
          const filterQuery = {};
          if (filterMode == 'equal') {
            filterQuery[filterField] = filterString;
          } else if (filterMode == 'regex') {
            filterQuery[filterField] = new RegExp(`.*${escapedFilterString}.*`);
            sails.log.verbose(filterQuery);
          }
          andArray.push(filterQuery);
        }
      }

      query['$and'] = andArray;

      sails.log.verbose(`Query: ${JSON.stringify(query)}`);
      sails.log.verbose(`Options: ${JSON.stringify(options)}`);
      const { items, totalItems } = await this.runDeletedRecordQuery(Record.tableName, query, options);
      const response = new StorageServiceResponse();
      response.success = true;
      response.items = items;
      response.totalItems = totalItems;
      return response;
    }

    public async getRecords(
      workflowState: string,
      recordType: string = undefined,
      start: number,
      rows: number = 10,
      username: string,
      roles: RoleModel[],
      brand: BrandingModel,
      _editAccessOnly = undefined,
      packageType = undefined,
      sort = undefined,
      filterFields = undefined,
      filterString = undefined,
      filterMode = undefined,
      secondarySort = undefined
    ) {
      if (_.isUndefined(filterMode) || _.isNull(filterMode) || _.isEmpty(filterMode)) {
        filterMode = 'regex';
      }
      const query = {
        'metaMetadata.brandId': brand.id,
      };
      const options = {
        limit: _.toNumber(rows),
        skip: _.toNumber(start),
      };
      if (_.isEmpty(sort)) {
        sort = '{"lastSaveDate": -1}';
      }
      sails.log.verbose(`Sort is: ${sort}`);
      if (_.indexOf(`${sort}`, '1') == -1) {
        sort = `{"${sort}":-1}`;
      } else {
        try {
          options['sort'] = JSON.parse(sort);
        } catch (_error) {
          options['sort'] = {};
          options['sort'][`${sort.substring(0, sort.indexOf(':'))}`] = _.toNumber(
            sort.substring(sort.indexOf(':') + 1)
          );
        }
      }

      if (!_.isEmpty(secondarySort)) {
        options['sort'][`${secondarySort.substring(0, secondarySort.indexOf(':'))}`] = _.toNumber(
          secondarySort.substring(secondarySort.indexOf(':') + 1)
        );
      }

      const roleNames = this.getRoleNames(roles, brand);
      const andArray = [];
      const permissions = {
        $or: [
          { 'authorization.view': username },
          { 'authorization.edit': username },
          { 'authorization.editRoles': { $in: roleNames } },
          { 'authorization.viewRoles': { $in: roleNames } },
        ],
      };
      andArray.push(permissions);
      if (_.isArray(recordType)) {
        if (recordType.length > 1) {
          const typeArray = [];
          _.each(recordType, rType => {
            typeArray.push({ 'metaMetadata.type': rType });
          });
          query['$or'] = typeArray;
        } else {
          const recType = recordType[0];
          if (!_.isUndefined(recType) && !_.isEmpty(recType)) {
            query['metaMetadata.type'] = recType;
          }
        }
      } else if (recordType != undefined && recordType != '') {
        query['metaMetadata.type'] = recordType;
      }
      if (_.isArray(packageType)) {
        if (packageType.length > 1) {
          const typeArray = [];
          _.each(packageType, rType => {
            typeArray.push({ 'metaMetadata.packageType': rType });
          });
          query['metaMetadata.packageType'] = { $or: typeArray };
        } else {
          const packType = packageType[0];
          if (!_.isUndefined(packType) && !_.isEmpty(packType)) {
            query['metaMetadata.packageType'] = packType;
          }
        }
      } else if (packageType != undefined && packageType != '') {
        query['metaMetadata.packageType'] = packageType;
      }
      if (workflowState != undefined && workflowState != '') {
        query['workflow.stage'] = workflowState;
      }
      if (!_.isEmpty(filterString) && !_.isEmpty(filterFields)) {
        const escapedFilterString = this.escapeRegExp(filterString);
        sails.log.verbose('escapedFilterString ' + escapedFilterString);
        for (const filterField of filterFields) {
          if (filterMode == 'equal') {
            query[filterField] = filterString;
          } else if (filterMode == 'regex') {
            query[filterField] = new RegExp(`.*${escapedFilterString}.*`, 'i');
          }
        }
      }

      query['$and'] = andArray;

      sails.log.verbose(query);
      sails.log.verbose(`Query: ${JSON.stringify(query)}`);
      sails.log.verbose(`Options: ${JSON.stringify(options)}`);
      const { items, totalItems } = await this.runRecordQuery(Record.tableName, query, options);
      const response = new StorageServiceResponse();
      response.success = true;
      response.items = items;
      response.totalItems = totalItems;
      return response;
    }

    private escapeRegExp(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    protected async runRecordQuery(colName, query, options) {
      return {
        items: await this.recordCol.find(query, options).toArray(),
        totalItems: await this.recordCol.count(query),
      };
    }

    protected async runDeletedRecordQuery(colName, query, options) {
      return {
        items: await this.deletedRecordCol.find(query, options).toArray(),
        totalItems: await this.deletedRecordCol.count(query),
      };
    }

    private async *fetchAllRecords(query, options, stringifyJSON: boolean = false) {
      let skip = 0;
      const limit = options.limit;
      options.skip = skip;
      let result = await this.recordCol.find(query, options).toArray();

      while (result.length > 0) {
        for (const record of result) {
          if (stringifyJSON) {
            yield JSON.stringify(record);
          } else {
            yield record;
          }
        }
        skip = skip + limit;
        options.skip = skip;
        result = await this.recordCol.find(query, options).toArray();
      }
    }

    public exportAllPlans(username, roles, brand, format, modBefore, modAfter, recType): stream.Readable {
      const andArray = [];
      const query = {
        'metaMetadata.brandId': brand.id,
        'metaMetadata.type': recType,
      };
      const roleNames = this.getRoleNames(roles, brand);
      const permissions = {
        $or: [
          { 'authorization.view': username },
          { 'authorization.edit': username },
          { 'authorization.editRoles': { $in: roleNames } },
          { 'authorization.viewRoles': { $in: roleNames } },
        ],
      };
      andArray.push(permissions);
      const options = {
        limit: _.toNumber(sails.config.record.export.maxRecords),
        sort: {
          lastSaveDate: -1,
        },
      };
      if (!_.isEmpty(modAfter)) {
        andArray.push({
          lastSaveDate: {
            $gte: `${modAfter}`,
          },
        });
      }
      if (!_.isEmpty(modBefore)) {
        andArray.push({
          lastSaveDate: {
            $lte: `${modBefore}`,
          },
        });
      }
      query['$and'] = andArray;
      sails.log.verbose(`Query: ${JSON.stringify(query)}`);
      sails.log.verbose(`Options: ${JSON.stringify(options)}`);
      if (format == 'csv') {
        // CSV needs the complete column set before the header row, but streaming json2csv derives
        // its columns from the first record only, dropping fields that appear in later records.
        // Stream the export in two passes over Mongo, both bounded to a single page of records in
        // memory: pass 1 collects the union of flattened column keys, pass 2 streams the CSV with
        // that full field set so every record's columns are represented.
        const passThrough = new stream.PassThrough();
        (async () => {
          try {
            // The client (e.g. the HTTP response) can disconnect mid-export; once the returned
            // PassThrough is destroyed there is no point continuing to page Mongo, so both passes
            // bail out when it is no longer writable.
            const isCancelled = () => passThrough.destroyed;
            const fields = await this.collectCsvFields(query, options, isCancelled);
            if (isCancelled()) {
              return;
            }
            if (_.isEmpty(fields)) {
              // No matching records means no columns to derive a header from; emit an empty file
              // deterministically rather than relying on json2csv's empty-fields behaviour.
              passThrough.end();
              return;
            }
            // Populated CSVs retain a UTF-8 BOM so spreadsheet apps detect their encoding correctly.
            passThrough.write(UTF8_BOM);
            const sanitize = new stream.Transform({
              objectMode: true,
              transform(record: Record<string, unknown>, _encoding, callback) {
                callback(null, sanitizeCsvRecord(record));
              },
            });
            const json2csv = new Transform({ fields, transforms: [flatten()] }, { objectMode: true });
            await pipeline(
              stream.Readable.from(this.fetchAllRecords(query, { ...options })),
              sanitize,
              json2csv,
              passThrough
            );
          } catch (err) {
            sails.log.error(`${this.logHeader} Failed to export records as CSV:`);
            sails.log.error(err);
            passThrough.destroy(err as Error);
          }
        })();
        return passThrough;
      }

      const jsonTransformer = new ExportJSONTransformer(recType, modBefore, modAfter);
      return stream.Readable.from(this.fetchAllRecords(query, options, true)).pipe(jsonTransformer);
    }

    // First export pass: iterate every matching record and accumulate the union of flattened column
    // keys (first-seen order) so the CSV header covers every record. A clone of options is used
    // because fetchAllRecords mutates options.skip while paging.
    private async collectCsvFields(query, options, isCancelled: () => boolean = () => false): Promise<string[]> {
      const flattener = flatten();
      const fields = new Set<string>();
      for await (const record of this.fetchAllRecords(query, { ...options })) {
        // Stop paging Mongo if the consumer has disconnected so cancelled exports don't keep
        // scanning every matching record.
        if (isCancelled()) {
          break;
        }
        for (const field of Object.keys(flattener(record))) {
          fields.add(field);
        }
      }
      return [...fields];
    }

    protected getRoleNames(roles, brand) {
      const roleNames = [];

      for (let i = 0; i < roles.length; i++) {
        const role = roles[i];
        if (role.branding == brand.id) {
          roleNames.push(roles[i].name);
        }
      }

      return roleNames;
    }

    public async addDatastreams(oid: string, fileIds: Datastream[]): Promise<DatastreamServiceResponse> {
      const response = new DatastreamServiceResponse();
      response.message = '';
      let hasFailure = false;
      for (const fileId of fileIds) {
        try {
          await this.addDatastream(oid, fileId, StorageManagerService.stagingDisk());
          const successMessage = `Successfully uploaded: ${JSON.stringify(fileId)}`;
          response.message = _.isEmpty(response.message) ? successMessage : `${response.message}\n${successMessage}`;
        } catch (err) {
          hasFailure = true;
          sails.log.error(`${this.logHeader} Failed to upload datastream for oid '${oid}':`);
          sails.log.error(err);
          const failureMessage = `Failed to upload: ${JSON.stringify(fileId)}, error is:\n${this.getErrorMessage(err)}`;
          response.message = _.isEmpty(response.message) ? failureMessage : `${response.message}\n${failureMessage}`;
        }
      }
      response.success = !hasFailure;
      return response;
    }

    public updateDatastream(
      oid: string,
      record: StorageRecord,
      newMetadata: JsonMap,
      fileRoot: string | StorageManagerServiceTypes.Services.IDisk | null,
      fileIdsAdded: Datastream[]
    ): Observable<Promise<unknown>[]> {
      let stagingDisk: StorageManagerServiceTypes.Services.IDisk;
      if (typeof fileRoot === 'string') {
        stagingDisk = StorageManagerService.disk(fileRoot);
      } else if (fileRoot && typeof fileRoot.getStream === 'function') {
        stagingDisk = fileRoot as StorageManagerServiceTypes.Services.IDisk;
      } else {
        throw new Error(
          `${this.logHeader} updateDatastream requires fileRoot to be a disk name or an IDisk instance with getStream()`
        );
      }
      return FormsService.getFormByName(record.metaMetadata.form, true, record.metaMetadata.brandId).pipe(
        mergeMap(form => {
          const formConfig = form;
          const attachmentFields = _.get(
            formConfig,
            'configuration.attachmentFields',
            _.get(formConfig, 'attachmentFields', [])
          ) as string[];
          const reqs: Promise<unknown>[] = [];
          record.metaMetadata.attachmentFields = attachmentFields;
          _.each(attachmentFields, async attField => {
            const oldAttachments = record.metadata[attField] as AttachmentDescriptor[] | undefined;
            const newAttachments = newMetadata[attField] as AttachmentDescriptor[] | undefined;
            const removeIds: Datastream[] = [];
            if (!_.isUndefined(oldAttachments) && !_.isNull(oldAttachments) && !_.isNull(newAttachments)) {
              const toRemove = _.differenceBy(oldAttachments, newAttachments, 'fileId');
              _.each(toRemove, removeAtt => {
                if (removeAtt.type == 'attachment') {
                  removeIds.push(new Datastream(removeAtt));
                }
              });
            }
            if (!_.isUndefined(newAttachments) && !_.isNull(newAttachments)) {
              const toAdd = _.differenceBy(newAttachments, oldAttachments, 'fileId');
              _.each(toAdd, addAtt => {
                if (addAtt.type == 'attachment') {
                  fileIdsAdded.push(new Datastream(addAtt));
                }
              });
            }
            reqs.push(this.addAndRemoveDatastreams(oid, fileIdsAdded, removeIds, stagingDisk));
          });
          if (_.isEmpty(reqs)) {
            reqs.push(Promise.resolve({ request: 'dummy' }));
          }
          return of(reqs);
        })
      );
    }

    public async removeDatastream(oid, datastream: Datastream) {
      const fileId = datastream.fileId;
      const fileName = `${oid}/${fileId}`;
      const fileRes = await this.getFileWithName(fileName).toArray();
      if (!_.isEmpty(fileRes)) {
        const fileDoc = fileRes[0];
        sails.log.verbose(`${this.logHeader} removeDatastream() -> Deleting:`);
        sails.log.verbose(JSON.stringify(fileDoc));
        try {
          await this.gridFsBucket.delete(fileDoc._id);
        } catch (err) {
          sails.log.error(`Error deleting: ${fileDoc._id}`);
          sails.log.error(JSON.stringify(err));
        }
        sails.log.verbose(`${this.logHeader} removeDatastream() -> Delete successful.`);
      } else {
        sails.log.verbose(`${this.logHeader} removeDatastream() -> File not found: ${fileName}`);
      }
    }

    public async removeStagedDatastream(fileId: string): Promise<void> {
      const normalizedFileId = normalizeAttachmentStagingFileId(fileId);
      if (!normalizedFileId) throw new Error('Invalid staged attachment identity.');
      const stagingDisk = StorageManagerService.stagingDisk();
      if (await stagingDisk.exists(normalizedFileId)) {
        await stagingDisk.delete(normalizedFileId);
      }
    }

    public async addDatastream(oid, datastream: Datastream, stagingDisk?: StorageManagerServiceTypes.Services.IDisk) {
      const fileId = datastream.fileId;
      sails.log.verbose(`${this.logHeader} addDatastream() -> Meta: ${fileId}`);
      sails.log.verbose(JSON.stringify(datastream));
      const metadata = _.merge(datastream.metadata, { redboxOid: oid });
      const fileName = `${oid}/${fileId}`;
      sails.log.verbose(`${this.logHeader} addDatastream() -> Adding: ${fileName}`);
      const effectiveStagingDisk = stagingDisk ?? StorageManagerService.stagingDisk();
      const readable = await effectiveStagingDisk.getStream(fileId);
      await this.streamFileToBucket(readable, fileName, metadata);
      sails.log.verbose(`${this.logHeader} addDatastream() -> Successfully added: ${fileName}`);
    }

    private streamFileToBucket(readable: NodeJS.ReadableStream, fileName: string, metadata: unknown) {
      const uploadStream = this.gridFsBucket.openUploadStream(fileName, { metadata });
      readable.pipe(uploadStream);

      return new Promise((resolve, reject) => {
        uploadStream.on('finish', () => {
          resolve(uploadStream.gridFSFile);
        });

        uploadStream.on('error', err => {
          sails.log.error(`${this.logHeader} streamFileToBucket() -> Failed uploading '${fileName}':`);
          sails.log.error(err);
          reject(err);
        });

        readable.on('error', err => {
          sails.log.error(`${this.logHeader} streamFileToBucket() -> Failed reading source for '${fileName}':`);
          sails.log.error(err);
          reject(err);
        });
      });
    }

    public async addAndRemoveDatastreams(
      oid,
      addIds: Datastream[],
      removeIds: Datastream[],
      stagingDisk?: StorageManagerServiceTypes.Services.IDisk
    ) {
      if (!stagingDisk) {
        throw new Error('MongoStorageService.addAndRemoveDatastreams requires a staging disk');
      }
      for (const addId of addIds) {
        await this.addDatastream(oid, addId, stagingDisk);
      }
      for (const removeId of removeIds) {
        await this.removeDatastream(oid, removeId);
      }
    }

    public async getDatastream(oid: string, fileId: string): Promise<DatastreamContent> {
      return this.getDatastreamAsync(oid, fileId);
    }

    private async getDatastreamAsync(oid: string, fileId: string): Promise<DatastreamContent> {
      const fileName = `${oid}/${fileId}`;
      const fileRes = await this.getFileWithName(fileName).toArray();
      if (_.isArray(fileRes) && fileRes.length === 0) {
        throw new Error(TranslationService.t('attachment-not-found'));
      }
      const response = new Attachment() as Attachment & DatastreamContent;
      response.readstream = this.gridFsBucket.openDownloadStreamByName(fileName);
      return response;
    }

    public async listDatastreams(oid: string, fileId?: string | null): Promise<Record<string, unknown>[]> {
      let query: JsonMap = { 'metadata.redboxOid': oid };
      if (!_.isEmpty(fileId)) {
        const fileName = `${oid}/${fileId}`;
        query = { filename: fileName };
      }
      sails.log.verbose(`${this.logHeader} listDatastreams() -> Listing attachments of oid: ${oid}`);
      sails.log.verbose(JSON.stringify(query));
      return (await this.gridFsBucket.find(query, {}).toArray()) as unknown as Record<string, unknown>[];
    }

    private toJsonSafe(value: unknown): unknown {
      if (_.isUndefined(value)) {
        return undefined;
      }
      if (_.isObject(value) && !_.isPlainObject(value) && !_.isArray(value)) {
        return undefined;
      }
      try {
        const json = JSON.stringify(value);
        if (_.isUndefined(json)) {
          return undefined;
        }
        return JSON.parse(json);
      } catch (_err) {
        return undefined;
      }
    }

    private sanitizeRecordHookExecutionSummary(value: unknown): Record<string, unknown> | undefined {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
      }
      const source = value as Record<string, unknown>;
      if (source.schemaVersion !== 1 || source.trigger !== 'record-hook') {
        return undefined;
      }
      const safeStatuses = new Set(['succeeded', 'failed', 'timed_out', 'interrupted', 'skipped', 'dispatched']);
      const safeKinds = new Set([
        'configuration',
        'validation',
        'domain',
        'transient',
        'timeout',
        'interrupted',
        'unexpected',
      ]);
      const safeReasons = new Set([
        'prior_action_failed',
        'phase_not_reached',
        'save_not_persisted',
        'trigger_disabled',
      ]);
      const actions = Array.isArray(source.actions)
        ? source.actions.slice(0, 100).flatMap(item => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
            const action = item as Record<string, unknown>;
            if (
              typeof action.actionId !== 'string' ||
              typeof action.mode !== 'string' ||
              typeof action.phase !== 'string' ||
              typeof action.status !== 'string' ||
              !safeStatuses.has(action.status)
            )
              return [];
            const result: Record<string, unknown> = {
              actionId: action.actionId.slice(0, 128),
              mode: action.mode,
              phase: action.phase,
              status: action.status,
              attempts: Number.isInteger(action.attempts) && Number(action.attempts) >= 0 ? Number(action.attempts) : 0,
              durationMs:
                Number.isInteger(action.durationMs) && Number(action.durationMs) >= 0 ? Number(action.durationMs) : 0,
            };
            if (typeof action.failureKind === 'string' && safeKinds.has(action.failureKind))
              result.failureKind = action.failureKind;
            if (typeof action.failureCode === 'string' && action.failureCode.length <= 128)
              result.failureCode = action.failureCode;
            if (typeof action.skippedReason === 'string' && safeReasons.has(action.skippedReason))
              result.skippedReason = action.skippedReason;
            return [result];
          })
        : [];
      const counts: Record<string, number> = {};
      if (source.counts && typeof source.counts === 'object' && !Array.isArray(source.counts)) {
        for (const [key, count] of Object.entries(source.counts as Record<string, unknown>)) {
          if (safeStatuses.has(key) && Number.isInteger(count) && Number(count) >= 0) counts[key] = Number(count);
        }
      }
      const summary: Record<string, unknown> = {
        schemaVersion: 1,
        executionId: typeof source.executionId === 'string' ? source.executionId.slice(0, 128) : '',
        trigger: 'record-hook',
        operation: ['create', 'update', 'delete', 'transition'].includes(String(source.operation))
          ? source.operation
          : 'update',
        partial: source.partial === true,
        durationMs:
          Number.isInteger(source.durationMs) && Number(source.durationMs) >= 0 ? Number(source.durationMs) : 0,
        totalActions:
          Number.isInteger(source.totalActions) && Number(source.totalActions) >= 0
            ? Number(source.totalActions)
            : actions.length,
        counts,
        actions,
        truncated: source.truncated === true,
      };
      if (typeof source.requestId === 'string' && source.requestId.length <= 128) summary.requestId = source.requestId;
      if (['pre', 'persistence', 'postSync', 'post-dispatch'].includes(String(source.completedThrough))) {
        summary.completedThrough = source.completedThrough;
      }
      if (['complete', 'grace-expired'].includes(String(source.detachedFinalization))) {
        summary.detachedFinalization = source.detachedFinalization;
      }
      if (Number.isInteger(source.detachedPending) && Number(source.detachedPending) > 0) {
        summary.detachedPending = Number(source.detachedPending);
      }
      return summary;
    }

    private sanitizeRecordAudit(recordAudit: RecordAuditModel): RecordAuditModel {
      const payload: RecordAuditModel = {
        redboxOid: recordAudit.redboxOid,
        action: recordAudit.action,
        user: this.toJsonSafe(recordAudit.user) as Record<string, unknown> | undefined,
        record: this.toJsonSafe(recordAudit.record) as Record<string, unknown> | undefined,
        executionSummary: this.sanitizeRecordHookExecutionSummary(
          recordAudit.executionSummary
        ) as unknown as RecordAuditModel['executionSummary'],
      };

      if (_.isUndefined(payload.user)) {
        delete payload.user;
      }

      if (_.isUndefined(payload.record)) {
        delete payload.record;
      }

      if (_.isUndefined(payload.executionSummary)) {
        delete payload.executionSummary;
      }

      return payload;
    }

    private sanitizeIntegrationAudit(audit: IntegrationAuditModel): Partial<IntegrationAuditModel> {
      const payload: Partial<IntegrationAuditModel> = {
        redboxOid: audit.redboxOid,
        brandId: audit.brandId,
        integrationName: audit.integrationName,
        integrationAction: audit.integrationAction,
        triggeredBy: audit.triggeredBy,
        status: audit.status,
        message: audit.message,
        errorDetail: audit.errorDetail,
        httpStatusCode: audit.httpStatusCode,
        traceId: audit.traceId,
        spanId: audit.spanId,
        parentSpanId: audit.parentSpanId,
        startedAt: audit.startedAt,
        completedAt: audit.completedAt,
        durationMs: audit.durationMs,
        requestSummary: this.toJsonSafe(audit.requestSummary) as Record<string, unknown> | undefined,
        responseSummary: this.toJsonSafe(audit.responseSummary) as Record<string, unknown> | undefined,
      };

      if (_.isUndefined(payload.requestSummary)) {
        delete payload.requestSummary;
      }
      if (_.isUndefined(payload.brandId)) {
        delete payload.brandId;
      }
      if (_.isUndefined(payload.triggeredBy)) {
        delete payload.triggeredBy;
      }
      if (_.isUndefined(payload.message)) {
        delete payload.message;
      }
      if (_.isUndefined(payload.errorDetail)) {
        delete payload.errorDetail;
      }
      if (_.isUndefined(payload.httpStatusCode)) {
        delete payload.httpStatusCode;
      }
      if (_.isUndefined(payload.parentSpanId)) {
        delete payload.parentSpanId;
      }
      if (_.isUndefined(payload.completedAt)) {
        delete payload.completedAt;
      }
      if (_.isUndefined(payload.durationMs)) {
        delete payload.durationMs;
      }
      if (_.isUndefined(payload.responseSummary)) {
        delete payload.responseSummary;
      }

      return payload;
    }

    public async createRecordAudit(recordAudit: RecordAuditModel): Promise<StorageServiceResponse> {
      const response = new StorageServiceResponse();
      const payload = this.sanitizeRecordAudit(recordAudit);
      try {
        sails.log.verbose(`${this.logHeader} Saving to DB...`);
        const savedRecordAudit = await RecordAudit.create(payload);
        response.oid = String(savedRecordAudit._id ?? '');
        response.success = true;
        sails.log.verbose(`${this.logHeader} Record Audit created...`);
      } catch (err) {
        sails.log.error(`${this.logHeader} Failed to create Record Audit:`);
        sails.log.error(JSON.stringify(err));
        response.success = false;
        response.message = this.getErrorMessage(err);
        return response;
      }
      sails.log.verbose(JSON.stringify(response));
      sails.log.verbose(`${this.logHeader} create() -> End`);
      return response;
    }

    public async getRecordAudit(params: RecordAuditParams): Promise<unknown> {
      const oid = params.oid;
      const dateFrom = params.dateFrom;
      const dateTo = params.dateTo;

      if (_.isEmpty(oid)) {
        const msg = `${this.logHeader} getMeta() -> refusing to search using an empty OID`;
        sails.log.error(msg);
        throw new Error(msg);
      }

      const criteria = { redboxOid: oid };

      if (_.isDate(dateFrom)) {
        criteria['createdAt'] = { ['>=']: dateFrom };
      }

      if (_.isDate(dateTo)) {
        if (_.isUndefined(criteria['createdAt'])) {
          criteria['createdAt'] = {};
        }
        criteria['createdAt']['<='] = dateTo;
        sails.log.verbose(criteria);
      }

      sails.log.verbose(`${this.logHeader} finding: `);
      sails.log.verbose(JSON.stringify(criteria));
      return RecordAudit.find(criteria);
    }

    public async createIntegrationAudit(audit: IntegrationAuditModel): Promise<StorageServiceResponse> {
      const response = new StorageServiceResponse();
      const payload = this.sanitizeIntegrationAudit(audit);
      try {
        sails.log.verbose(`${this.logHeader} Saving Integration Audit to DB...`);
        const savedAudit = await IntegrationAudit.create(payload);
        response.oid = String(savedAudit._id ?? '');
        response.success = true;
        sails.log.verbose(`${this.logHeader} Integration Audit created...`);
      } catch (err) {
        sails.log.error(`${this.logHeader} Failed to create Integration Audit:`);
        sails.log.error(JSON.stringify(err));
        response.success = false;
        response.message = this.getErrorMessage(err);
        return response;
      }
      sails.log.verbose(JSON.stringify(response));
      sails.log.verbose(`${this.logHeader} createIntegrationAudit() -> End`);
      return response;
    }

    private buildIntegrationAuditStartedAtCriteria(
      params: IntegrationAuditParams
    ): Record<string, unknown> | undefined {
      const criteria: Record<string, unknown> = {};
      if (_.isDate(params.dateFrom)) {
        criteria['>='] = params.dateFrom.toISOString();
      }
      if (_.isDate(params.dateTo)) {
        criteria['<='] = params.dateTo.toISOString();
      }

      return Object.keys(criteria).length > 0 ? criteria : undefined;
    }

    public async getIntegrationAudit(params: IntegrationAuditParams): Promise<unknown> {
      const oid = params.oid;
      if (_.isEmpty(oid)) {
        const msg = `${this.logHeader} getIntegrationAudit() -> refusing to search using an empty OID`;
        sails.log.error(msg);
        throw new Error(msg);
      }

      const criteria: Record<string, unknown> = { redboxOid: oid };
      if (!_.isEmpty(params.status)) {
        criteria['status'] = params.status;
      }
      const startedAtCriteria = this.buildIntegrationAuditStartedAtCriteria(params);
      if (!_.isUndefined(startedAtCriteria)) {
        criteria['startedAt'] = startedAtCriteria;
      }

      const page = _.toInteger(params.page) > 0 ? _.toInteger(params.page) : 1;
      const pageSize = _.toInteger(params.pageSize) > 0 ? _.toInteger(params.pageSize) : 20;
      const skip = (page - 1) * pageSize;

      sails.log.verbose(`${this.logHeader} finding Integration Audit: `);
      sails.log.verbose(JSON.stringify(criteria));

      const query = IntegrationAudit.find(criteria);
      query.sort([{ startedAt: 'DESC' }, { dateCreated: 'DESC' }]);
      query.skip(skip);
      query.limit(pageSize);
      return query;
    }

    public async countIntegrationAudit(params: IntegrationAuditParams): Promise<number> {
      const oid = params.oid;
      if (_.isEmpty(oid)) {
        const msg = `${this.logHeader} countIntegrationAudit() -> refusing to search using an empty OID`;
        sails.log.error(msg);
        throw new Error(msg);
      }

      const criteria: Record<string, unknown> = { redboxOid: oid };
      if (!_.isEmpty(params.status)) {
        criteria['status'] = params.status;
      }
      const startedAtCriteria = this.buildIntegrationAuditStartedAtCriteria(params);
      if (!_.isUndefined(startedAtCriteria)) {
        criteria['startedAt'] = startedAtCriteria;
      }

      sails.log.verbose(`${this.logHeader} counting Integration Audit: `);
      sails.log.verbose(JSON.stringify(criteria));
      return await IntegrationAudit.count(criteria);
    }

    async restoreRecord(oid: string, options?: RecordStorageMutationOptions): Promise<StorageServiceResponse> {
      return this.notApplied(
        this.createMutationResponse(oid, options),
        'capability-unavailable',
        'Record restoration requires staged lifecycle orchestration'
      );
    }

    async destroyDeletedRecord(oid: string, options?: RecordStorageMutationOptions): Promise<StorageServiceResponse> {
      return this.notApplied(
        this.createMutationResponse(oid, options),
        'capability-unavailable',
        'Tombstone destruction requires staged lifecycle orchestration'
      );
    }

    protected getFileWithName(fileName: string, options: FindOptions = { limit: 1 }): FindCursor<GridFSFile> {
      return this.gridFsBucket.find({ filename: fileName }, options);
    }

    public async exists(oid: string): Promise<boolean> {
      return (await Record.count({ redboxOid: oid })) > 0;
    }
  }
}
