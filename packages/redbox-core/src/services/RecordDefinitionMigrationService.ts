import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import { isProxy, isDate } from 'node:util/types';
import {
  parseRecordDefinitionBrandId,
  parseRecordDefinitionKey,
  RECORD_DEFINITION_LABEL_MAX_LENGTH,
  RECORD_DEFINITION_REFERENCE_MAX_LENGTH,
  RECORD_DEFINITION_REFERENCE_PATTERN,
} from '@researchdatabox/sails-ng-common';
import { type RuntimeRecord, type RuntimeValue, isRuntimeRecord } from '../runtimeValues';
import {
  RECORD_DEFINITION_REVISION_NUMBER_MAX,
  RECORD_DEFINITION_VALIDATION_LIMITS,
  deriveRecordDefinitionId,
  deriveRecordDefinitionRevisionId,
  validateRecordDefinitionForPublication,
  persistedRecordDefinitionDraftSchema,
  recordDefinitionRevisionSchema,
  recordTypeIdentitySchema,
  recordDefinitionHistorySummarySchema,
  recordDefinitionValidationReportSchema,
  recordDefinitionImpactReportSchema,
  hashRecordDefinition,
  canonicalizeRecordDefinition,
  type ValidatedRecordDefinitionPublication,
} from '../record-workflow-administration';
import {
  transformLegacyRecordDefinition,
  assertLegacyMigrationData,
  LegacyDatabaseMigrationError,
  type LegacyDatabaseTransformation,
} from '../record-workflow-administration/legacyDatabaseMigration';
import {
  DefaultRecordDefinitionPublicationAuthority,
  type RecordDefinitionPublicationAuthority,
  type RecordDefinitionPublicationAuthoritySnapshot,
} from './RecordDefinitionPublicationService';
import type { RecordDefinitionHistoryAttributes } from '../waterline-models/RecordDefinitionHistory';
import type { RecordDefinitionRevisionAttributes } from '../waterline-models/RecordDefinitionRevision';
import type { RecordDefinitionDraftAttributes } from '../waterline-models/RecordDefinitionDraft';

export const RECORD_DEFINITION_MIGRATION_NAME = '@researchdatabox/redbox-core:20260905T000000-record-definitions';
const MAX_IDENTITIES = 256;
const MAX_STEPS = 64;
const ACTOR = Object.freeze({ id: 'record-definition-migration', displayName: 'Legacy database migration v1' });
// Waterline's verifier logs raw malformed values. B11 validates original rows itself, with bounded diagnostics.
const READ_META = Object.freeze({ skipRecordVerification: true });
const SOURCE = Object.freeze({ operation: 'migration' as const, sourceRevisionNumber: null });

interface BoundedQuery extends PromiseLike<RuntimeValue[]> {
  meta(options: { skipRecordVerification: true }): BoundedQuery;
  limit(maximum: number): BoundedQuery;
  sort(criteria: string): BoundedQuery;
  skip(offset: number): BoundedQuery;
}

interface NativeHistoryCursor extends AsyncIterable<RuntimeRecord> {
  sort(criteria: { _id: 1 }): NativeHistoryCursor;
  limit(maximum: number): NativeHistoryCursor;
  maxTimeMS(milliseconds: number): NativeHistoryCursor;
  batchSize(size: number): NativeHistoryCursor;
  close(): Promise<void>;
}

interface IdentityCollection {
  updateOne(filter: RuntimeRecord, update: { $set: RuntimeRecord }): Promise<RuntimeValue>;
  createIndex(fields: Readonly<Record<string, 1>>, options: { name: string; unique: true }): Promise<string>;
}
interface MigrationMongoManager {
  collection(name: string): IdentityCollection;
}

export interface RecordDefinitionMigrationReader {
  recordTypes(): Promise<readonly RuntimeValue[]>;
  workflowSteps(recordTypeId: string): Promise<readonly RuntimeValue[]>;
  revisionAt?(recordType: string, revisionNumber: number): Promise<RecordDefinitionRevisionAttributes | null>;
  activeRevision?(revisionId: string): Promise<RecordDefinitionRevisionAttributes | null>;
  history?(criteria: RuntimeRecord): Promise<RecordDefinitionHistoryAttributes | null>;
  latestRetirement?(recordType: string): Promise<RuntimeValue | null>;
  histories?(recordType: string): Promise<readonly RuntimeValue[]>;
  draft?(draftId: string): Promise<RecordDefinitionDraftAttributes | null>;
}

export class WaterlineRecordDefinitionMigrationReader implements RecordDefinitionMigrationReader {
  private async readRows(query: () => BoundedQuery, maximum: number): Promise<readonly RuntimeValue[]> {
    const rows: RuntimeValue[] = [];
    let bytes = 0;
    for (let index = 0; index <= maximum; index++) {
      // schema:false models reject select; bounded one-row pages are supported.
      const page = await query().meta(READ_META).sort('id ASC').skip(index).limit(1);
      if (page.length === 0) break;
      if (page.length !== 1 || index === maximum) return fail('$', 'database-row-limit');
      const row = dataRow(page[0], `$.rows[${index}]`);
      assertLegacyMigrationData(row);
      bytes += Buffer.byteLength(JSON.stringify(row), 'utf8');
      if (bytes > 8_000_000) return fail('$', 'database-byte-limit');
      rows.push(row);
    }
    return rows;
  }

  public async recordTypes(): Promise<readonly RuntimeValue[]> {
    return this.readRows(() => RecordType.find({}) as object as BoundedQuery, MAX_IDENTITIES);
  }
  public async workflowSteps(recordTypeId: string): Promise<readonly RuntimeValue[]> {
    return this.readRows(() => WorkflowStep.find({ recordType: recordTypeId }) as object as BoundedQuery, MAX_STEPS);
  }
  public async activeRevision(revisionId: string): Promise<RecordDefinitionRevisionAttributes | null> {
    return (await RecordDefinitionRevision.findOne({ id: revisionId }).meta(READ_META)) ?? null;
  }
  public async history(criteria: RuntimeRecord): Promise<RecordDefinitionHistoryAttributes | null> {
    const stored = await RecordDefinitionHistory.findOne(criteria).meta(READ_META);
    if (stored || typeof criteria.recordType !== 'string') return stored ?? null;
    // Coordinate lookups must also find string-linked recovery evidence that
    // complete enumeration found; otherwise valid lifecycle replay fails.
    const rows = await this.histories(criteria.recordType);
    const match = rows.find(
      value =>
        isRuntimeRecord(value) &&
        Object.entries(criteria).every(([key, expected]) => isDeepStrictEqual(value[key], expected))
    );
    return (match as object as RecordDefinitionHistoryAttributes) ?? null;
  }
  public async latestRetirement(recordTypeId: string): Promise<RuntimeValue | null> {
    const rows = (await this.histories(recordTypeId)).filter(
      (value): value is RuntimeRecord =>
        isRuntimeRecord(value) && ['retire', 'unretire'].includes(String(value.operation))
    );
    rows.sort((left, right) => Number(right.resultingIdentityVersion) - Number(left.resultingIdentityVersion));
    return rows[0] ?? null;
  }
  public async draft(draftId: string): Promise<RecordDefinitionDraftAttributes | null> {
    return (await RecordDefinitionDraft.findOne({ id: draftId }).meta(READ_META)) ?? null;
  }

  public async histories(recordTypeId: string): Promise<readonly RuntimeValue[]> {
    // Shared bounded complete enumeration used by service and CLI parity.
    // Validates every row before trusting coordinates; fails closed on
    // malformed, duplicate or out-of-range evidence with consistent bounds.
    const rows: RuntimeValue[] = [];
    let bytes = 0;
    const retain = (value: RuntimeValue): void => {
      if (rows.length >= 512) return fail('$', 'database-row-limit');
      const row = historyRow(value, `$.histories[${rows.length}]`);
      bytes += Buffer.byteLength(JSON.stringify(row), 'utf8');
      if (bytes > 8_000_000) return fail('$', 'database-byte-limit');
      rows.push(row);
    };
    for (let index = 0; index <= 512; index++) {
      const query = RecordDefinitionHistory.find({ recordType: recordTypeId }) as object as BoundedQuery;
      const page = await query.meta(READ_META).sort('id ASC').skip(index).limit(1);
      if (!Array.isArray(page) || page.length > 1) return fail('$', 'database-row-limit');
      if (page.length === 0) break;
      retain(page[0]);
    }
    // sails-mongo coerces hex relation strings to ObjectIds, and Waterline
    // overwrites modelsNotUsingObjectIds metadata. Read the string-only side
    // natively so both representations reach the same validation as the CLI.
    if (/^[a-f0-9]{24}$/i.test(recordTypeId)) {
      const manager = RecordDefinitionHistory.getDatastore().manager as object as {
        collection(name: string): {
          find(filter: { recordType: string }): NativeHistoryCursor;
        };
      };
      const cursor = manager
        .collection('recorddefinitionhistory')
        .find({ recordType: recordTypeId })
        .sort({ _id: 1 })
        .limit(513 - rows.length)
        .maxTimeMS(10000)
        .batchSize(1);
      try {
        for await (const native of cursor) {
          if (rows.length >= 512) return fail('$', 'database-row-limit');
          const row: RuntimeRecord = { ...native, id: native._id };
          delete row._id;
          // These objects come directly from BSON decoding, not caller input.
          // Keep all other values intact for the strict history-row validator.
          for (const key of ['id', 'branding', 'recordType']) {
            const value = row[key];
            if (isRuntimeRecord(value) && typeof value.toHexString === 'function') {
              row[key] = (value as object as { toHexString(): string }).toHexString();
            }
          }
          retain(row);
        }
      } finally {
        await cursor.close();
      }
    }
    return rows;
  }
}

function fail(path: string, code: string): never {
  throw new LegacyDatabaseMigrationError(path, code);
}

/** Waterline timestamps/association metadata are excluded without calling serialization methods. */
function dataRow(value: RuntimeValue, path: string, keepTimestamps = false): RuntimeRecord {
  if (!isRuntimeRecord(value) || isProxy(value)) return fail(path, 'invalid-storage-row');
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) return fail(path, 'invalid-storage-prototype');
  if (Reflect.ownKeys(value).length > 128) return fail(path, 'unbounded-storage-row');
  const row: RuntimeRecord = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key))
      return fail(path, 'unsafe-storage-property');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return fail(path, 'unsafe-storage-property');
    // Waterline adds the exact code-owned RecordType/Draft non-enumerable serializers during reads.
    // Exclude it by identity, without invoking it or accepting a persisted substitute.
    if (
      key === 'toJSON' &&
      !descriptor.enumerable &&
      typeof descriptor.value === 'function' &&
      ((typeof RecordType !== 'undefined' &&
        descriptor.value === (RecordType as object as { customToJSON?: RuntimeValue }).customToJSON) ||
        (keepTimestamps &&
          typeof RecordDefinitionDraft !== 'undefined' &&
          descriptor.value === (RecordDefinitionDraft as object as { customToJSON?: RuntimeValue }).customToJSON))
    )
      continue;
    if (!descriptor.enumerable) return fail(path, 'unsafe-storage-property');
    if (['createdAt', 'updatedAt'].includes(key)) {
      const metadata = descriptor.value;
      if (metadata === null) return fail(path, 'invalid-artifact-timestamp');
      if (metadata !== undefined) {
        // Waterline auto timestamps may be epoch milliseconds; they are not immutable event times.
        if (
          typeof metadata !== 'number' ||
          !Number.isSafeInteger(metadata) ||
          metadata < 0 ||
          metadata > 8_640_000_000_000_000
        )
          timestamp(metadata);
        if (keepTimestamps)
          row[key] = typeof metadata === 'number' ? new Date(metadata).toISOString() : timestamp(metadata);
      }
      continue;
    }
    if (['retiredAt', 'publishedAt', 'occurredAt'].includes(key) && isDate(descriptor.value)) {
      Object.defineProperty(row, key, { value: timestamp(descriptor.value), enumerable: true });
      continue;
    }
    Object.defineProperty(row, key, { value: descriptor.value, enumerable: true });
  }
  assertLegacyMigrationData(row);
  return row;
}

const storedTimestampSchema = z.iso.datetime({ offset: true });

function timestamp(value: RuntimeValue): string {
  if (
    typeof value === 'object' &&
    value !== null &&
    !isProxy(value) &&
    isDate(value) &&
    Object.getPrototypeOf(value) === Date.prototype &&
    Reflect.ownKeys(value).length === 0 &&
    Number.isFinite(Date.prototype.getTime.call(value))
  )
    return Date.prototype.toISOString.call(value);
  if (typeof value !== 'string' || value.length > 64 || !storedTimestampSchema.safeParse(value).success)
    return fail('$', 'invalid-artifact-timestamp');
  return value;
}

function revisionPayload(row: RuntimeRecord): RuntimeRecord {
  const {
    branding,
    recordType: _recordType,
    recordTypeId: _recordTypeId,
    createdBy: _createdBy,
    publicationNote,
    ...fields
  } = row;
  return {
    ...fields,
    brandId: branding,
    publishedAt: timestamp(row.publishedAt),
    ...(publicationNote == null || publicationNote === '' ? {} : { publicationNote }),
  };
}

/** Normalize and validate history properties before bounded readers retain a row. */
export function historyRow(value: RuntimeValue, path: string): RuntimeRecord {
  const row = dataRow(value, path);
  const allowed = [
    'id',
    'schemaVersion',
    'branding',
    'recordType',
    'recordTypeId',
    'recordTypeKey',
    'operation',
    'operationId',
    'expectedIdentityVersion',
    'resultingIdentityVersion',
    'expectedDraftVersion',
    'expectedActiveRevisionNumber',
    'revision',
    'revisionNumber',
    'canonicalHash',
    'source',
    'occurredAt',
    'actor',
    'validation',
    'impact',
    'changes',
    'redactions',
    'truncated',
    'note',
  ];
  if (Object.keys(row).some(key => !allowed.includes(key))) return fail(path, 'invalid-history-property');
  return row;
}

const MIGRATION_WARNINGS = Object.freeze([
  'legacy-stage-stopping-preserved',
  'manual-transitions-require-source-edit-role',
  'labels-use-persisted-key',
] as const);

/**
 * Strict migration provenance note: exact allowed envelope, workflow-step
 * count equal to the migrated definition's stages, no forged extra fields.
 */
function isValidMigrationNote(note: RuntimeValue, expectedStages: number): boolean {
  if (typeof note !== 'string') return false;
  let parsedNote: RuntimeValue;
  try {
    parsedNote = JSON.parse(note) as RuntimeValue;
  } catch {
    return false;
  }
  if (!isRuntimeRecord(parsedNote) || isProxy(parsedNote)) return false;
  const keys = Object.keys(parsedNote);
  if (keys.length !== 3) return false;
  if (!['migration', 'workflowSteps', 'warnings'].every(key => keys.includes(key))) return false;
  if (parsedNote.migration !== RECORD_DEFINITION_MIGRATION_NAME) return false;
  const steps = parsedNote.workflowSteps;
  if (typeof steps !== 'number' || !Number.isSafeInteger(steps)) return false;
  if (steps < 0 || steps > 64) return false;
  if (steps !== expectedStages) return false;
  if (!isDeepStrictEqual(parsedNote.warnings, [...MIGRATION_WARNINGS])) return false;
  return true;
}

function revisionStagesLength(revision: RuntimeRecord): number | null {
  const definition = (revision as RuntimeRecord).definition;
  if (!isRuntimeRecord(definition) || isProxy(definition)) return null;
  const stages = (definition as RuntimeRecord).stages;
  if (!Array.isArray(stages)) return null;
  return stages.length;
}

function hasSafeDisplayText(value: string, maximum: number): boolean {
  if (value.length === 0 || value.length > maximum || value.trim().length === 0) return false;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127)) return false;
  }
  return true;
}

/**
 * Complete strict actor contract for every retirement and unretirement event,
 * including historical and future rows. Mirrors the publication/draft actor
 * contract and the record-workflow actor schema: plain-object actor with
 * exactly `id` (reference) and optional `displayName` (safe label), no extra
 * fields, enumerable data descriptors only and no secret-bearing values.
 * Returns false fail-closed with no secret leakage; callers map to bounded
 * secret-free diagnostics with zero writes.
 */
function isValidStrictActor(actor: RuntimeValue): boolean {
  if (!isRuntimeRecord(actor) || isProxy(actor)) return false;
  const prototype = Object.getPrototypeOf(actor);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Object.keys(actor);
  if (keys.length < 1 || keys.length > 2) return false;
  if (!keys.includes('id')) return false;
  if (keys.some(key => key !== 'id' && key !== 'displayName')) return false;
  if (Reflect.ownKeys(actor).length !== keys.length) return false;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(actor, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return false;
    if ((descriptor as PropertyDescriptor).get !== undefined || (descriptor as PropertyDescriptor).set !== undefined)
      return false;
  }
  const id = (actor as RuntimeRecord).id;
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    id.length > RECORD_DEFINITION_REFERENCE_MAX_LENGTH ||
    !RECORD_DEFINITION_REFERENCE_PATTERN.test(id)
  )
    return false;
  if (keys.includes('displayName')) {
    const displayName = (actor as RuntimeRecord).displayName;
    if (typeof displayName !== 'string' || !hasSafeDisplayText(displayName, RECORD_DEFINITION_LABEL_MAX_LENGTH))
      return false;
  }
  return true;
}

interface PreparedMigration {
  readonly original: RuntimeRecord;
  readonly transformed: LegacyDatabaseTransformation;
  readonly publication: ValidatedRecordDefinitionPublication;
}

export interface RecordDefinitionMigrationReport {
  readonly migration: string;
  readonly identities: number;
  readonly skipped: number;
  readonly workflowSteps: number;
  readonly entries: readonly {
    readonly identity: string;
    readonly canonicalHash: string;
    readonly warnings: readonly string[];
    readonly stages: number;
    readonly bindings: number;
    readonly transitions: number;
  }[];
}

/** Read-only prepare is shared verbatim by preflight and the Umzug up handler. */
export class RecordDefinitionMigrationService {
  constructor(
    private readonly reader: RecordDefinitionMigrationReader = new WaterlineRecordDefinitionMigrationReader(),
    private readonly authority: RecordDefinitionPublicationAuthority = new DefaultRecordDefinitionPublicationAuthority()
  ) {}

  private async prepare(): Promise<{ prepared: PreparedMigration[]; report: RecordDefinitionMigrationReport }> {
    const rows = await this.reader.recordTypes();
    if (rows.length > MAX_IDENTITIES) return fail('$', 'identity-limit-exceeded');
    const prepared: PreparedMigration[] = [];
    const seen = new Set<string>();
    let skipped = 0;
    for (let index = 0; index < rows.length; index++) {
      const path = `$.recordTypes[${index}]`;
      const row = dataRow(rows[index], path);
      if (
        typeof row.id !== 'string' ||
        !row.id.length ||
        row.id.length > 256 ||
        typeof row.branding !== 'string' ||
        typeof row.name !== 'string'
      )
        return fail(path, 'invalid-identity');
      const identity = {
        brandId: parseRecordDefinitionBrandId(row.branding),
        recordTypeKey: parseRecordDefinitionKey(row.name),
      };
      const definitionId = deriveRecordDefinitionId(identity);
      for (const key of ['packageType', 'searchCore']) {
        if (row[key] != null && typeof row[key] !== 'string') return fail(path, 'invalid-deployment-field');
      }
      if (row.key !== `${row.branding}_${row.name}`) return fail(path, 'invalid-legacy-identity-key');
      if (row.schemaVersion != null && row.schemaVersion !== 1) return fail(path, 'unsupported-identity-schema');
      if (seen.has(definitionId)) return fail(path, 'duplicate-identity');
      seen.add(definitionId);
      if (row.definitionId != null && row.definitionId !== '' && row.definitionId !== definitionId)
        return fail(path, 'conflicting-identity');
      for (const key of [
        'draftLifecycleToken',
        'draftLifecycleKind',
        'draftLifecycleOperation',
        'definitionLifecycleToken',
        'definitionLifecycleOperation',
        'recordCreationToken',
        'recordCreationFence',
        'secretMutationToken',
      ]) {
        if (row[key] != null && row[key] !== '') return fail(path, 'identity-is-not-quiescent');
      }
      if (row.draftId != null && row.draftId !== '' && typeof row.draftId !== 'string')
        return fail(path, 'invalid-managed-draft');
      if (typeof row.draftId === 'string' && row.draftId !== '') await this.validateDraft(row, path);
      if (row.activeRevisionId != null && row.activeRevisionId !== '') {
        // Published B10/admin identities are already authoritative. Never reinterpret administrative state.
        if (typeof row.activeRevisionId !== 'string') return fail(path, 'invalid-active-pointer');
        const revision = this.reader.activeRevision
          ? await this.reader.activeRevision(row.activeRevisionId)
          : await RecordDefinitionRevision.findOne({ id: row.activeRevisionId }).meta(READ_META);
        if (!revision) return fail(path, 'invalid-active-revision');
        const migration = await this.validateActive(row, dataRow(revision as object as RuntimeRecord, path), path);
        if (!migration || row.version !== 1) {
          skipped++;
          continue;
        }
      } else if (row.activeRevisionNumber != null) return fail(path, 'inconsistent-active-pointer');
      if (typeof row.draftId === 'string' && row.draftId !== '') {
        this.validateRetirement(row, path);
        skipped++;
        continue;
      }
      // Legacy identities lack managed DTO metadata; validate retirement before excluding it below.
      this.validateRetirement({ ...row, schemaVersion: 1, definitionId, version: 0 }, path);
      for (const key of [
        'draftId',
        'draftLifecycleToken',
        'draftLifecycleOperation',
        'definitionLifecycleToken',
        'definitionLifecycleOperation',
        'recordCreationToken',
        'recordCreationFence',
        'secretMutationToken',
        'retiredAt',
      ]) {
        if (row[key] != null && row[key] !== '') return fail(path, 'identity-is-not-quiescent');
      }
      if (row.version != null && row.version !== 0 && !(row.version === 1 && row.activeRevisionNumber === 1))
        return fail(path, 'unexpected-identity-version');
      const steps = await this.reader.workflowSteps(row.id);
      if (steps.length > MAX_STEPS) return fail(path, 'stage-limit-exceeded');
      const legacy: RuntimeRecord = {};
      const managed = [
        'schemaVersion',
        'definitionId',
        'version',
        'activeRevisionId',
        'activeRevisionNumber',
        'draftId',
        'draftLifecycleToken',
        'draftLifecycleKind',
        'draftLifecycleOperation',
        'definitionLifecycleToken',
        'definitionLifecycleOperation',
        'recordCreationToken',
        'recordCreationFence',
        'secretMutationToken',
        'retiredAt',
        'retiredBy',
        'retirementReason',
        'createdBy',
        'updatedBy',
      ];
      for (const key of Object.keys(row)) if (!managed.includes(key)) legacy[key] = row[key];
      let transformed: LegacyDatabaseTransformation;
      try {
        transformed = transformLegacyRecordDefinition({
          recordType: legacy,
          workflowSteps: steps.map((step, stepIndex) => dataRow(step, `${path}.workflowSteps[${stepIndex}]`)),
        });
      } catch (error) {
        if (error instanceof LegacyDatabaseMigrationError) return fail(`${path}${error.path.slice(1)}`, error.code);
        throw error;
      }
      const definition = { ...transformed.definition, definitionState: 'draft-incomplete' as const };
      const authority = await this.authority.load({ ...identity, definition, activeDefinition: null });
      this.validateAuthoritySnapshot(authority as RuntimeValue, path);
      const publication = validateRecordDefinitionForPublication({
        ...authority,
        ...identity,
        definition,
        activeDefinition: null,
        draftVersion: 0,
        activeRevisionNumber: null,
        administrativeRole: 'Admin',
      });
      if (!publication.ok) return fail(path, 'publication-validation-failed');
      // Initial-migration enumeration: inactive legacy identities must have no
      // durable history except a single legitimate migration recovery artifact.
      // Every history row is validated (operation-specific provenance, versions,
      // object-timestamp) before any writes/indexes; forged extra rows
      // (distinct IDs, negative versions, missing provenance, object occurredAt)
      // fail closed with bounded secret-free diagnostics, zero writes and
      // unchanged state, with service/CLI/native parity.
      await this.validateInactiveLegacyHistories(row, transformed, publication, definitionId, path);
      const entry = { original: row, transformed, publication };
      await this.persist(entry, true);
      prepared.push(entry);
    }
    return {
      prepared,
      report: {
        migration: RECORD_DEFINITION_MIGRATION_NAME,
        identities: prepared.length,
        skipped,
        workflowSteps: prepared.reduce((sum, entry) => sum + entry.transformed.workflowStepCount, 0),
        entries: prepared.map(({ transformed, publication }) => ({
          identity: deriveRecordDefinitionId(transformed),
          canonicalHash: publication.canonicalHash,
          warnings: transformed.warnings,
          stages: publication.definition.stages.length,
          transitions: publication.definition.transitions.length,
          bindings: publication.definition.actionBindings.length,
        })),
      },
    };
  }

  public async preflight(): Promise<RecordDefinitionMigrationReport> {
    return this.run(false);
  }

  public async migrate(): Promise<RecordDefinitionMigrationReport> {
    return this.run(true);
  }

  private async run(write: boolean): Promise<RecordDefinitionMigrationReport> {
    try {
      const { prepared, report } = await this.prepare();
      if (!write) return report;
      if (prepared.length > 0) {
        const manager = RecordType.getDatastore().manager as object as MigrationMongoManager;
        if (!manager || typeof manager.collection !== 'function') return fail('$', 'native-mongo-required');
        try {
          await manager
            .collection('recorddefinitionrevision')
            .createIndex(
              { recordType: 1, revisionNumber: 1 },
              { name: 'recorddefinitionrevision_record_type_number', unique: true }
            );
          await manager
            .collection('recorddefinitionhistory')
            .createIndex({ operationId: 1 }, { name: 'recorddefinitionhistory_operation', unique: true });
          await manager
            .collection('recorddefinitionhistory')
            .createIndex(
              { recordType: 1, resultingIdentityVersion: 1 },
              { name: 'recorddefinitionhistory_record_type_identity_version', unique: true }
            );
        } catch {
          return fail('$', 'migration-index-prerequisite-failed');
        }
      }
      for (const entry of prepared) await this.persist(entry);
      return report;
    } catch (error) {
      if (error instanceof LegacyDatabaseMigrationError) throw error;
      return fail('$', 'migration-operation-failed');
    }
  }

  private async readRevision(id: string): Promise<RecordDefinitionRevisionAttributes | null> {
    return this.reader.activeRevision
      ? this.reader.activeRevision(id)
      : ((await RecordDefinitionRevision.findOne({ id }).meta(READ_META)) ?? null);
  }

  private async readHistory(criteria: RuntimeRecord): Promise<RecordDefinitionHistoryAttributes | null> {
    return this.reader.history
      ? this.reader.history(criteria)
      : ((await RecordDefinitionHistory.findOne(criteria).meta(READ_META)) ?? null);
  }

  private async readLatestRetirement(recordTypeId: string): Promise<RuntimeValue | null> {
    if (this.reader.latestRetirement) return this.reader.latestRetirement(recordTypeId);
    const query = RecordDefinitionHistory.find({
      recordType: recordTypeId,
      operation: { in: ['retire', 'unretire'] },
    }) as object as BoundedQuery;
    const rows = await query.meta(READ_META).sort('resultingIdentityVersion DESC').limit(1);
    return rows[0] ?? null;
  }

  private async validateDraft(row: RuntimeRecord, path: string): Promise<void> {
    if (typeof row.draftId !== 'string') return fail(path, 'invalid-managed-draft');
    const stored = this.reader.draft
      ? await this.reader.draft(row.draftId)
      : await RecordDefinitionDraft.findOne({ id: row.draftId }).meta(READ_META);
    if (!stored) return fail(path, 'invalid-managed-draft');
    const draft = dataRow(stored as object as RuntimeRecord, path, true);
    const { branding, recordType, lifecycleOperationToken, ...fields } = draft;
    // The persisted-draft schema refinement may throw a raw error for
    // malformed base values instead of returning a failure. Map that to the
    // same bounded managed-draft diagnostic to preserve fail-closed parity.
    const inspected = (() => {
      try {
        return persistedRecordDefinitionDraftSchema.safeParse({ ...fields, brandId: branding });
      } catch {
        return null;
      }
    })();
    // B04 clone creates drafts with a null base and B05 publication retains the
    // draft's original base: a managed draft base may be null or any historical
    // revision at or before the current active revision. It is never advanced
    // by publication. Require exact null-pairing, the derived base ID binding
    // and (when active) a base within the published range; malformed, future
    // or orphan bases still fail closed. The save-time validation report is a
    // separate contract: B04 stamps its active revision from the current
    // active pointer at save time, not from the retained base, and an
    // untouched retained draft keeps its clone-time report referencing no
    // active revision. Validate the report's active revision independently as
    // null or a published revision at or before the current active revision
    // (covering clone/publish/rollback saves) while preserving identity,
    // draft-version, base and revision-bound checks; malformed, future,
    // wrong-identity or mismatched values fail closed.
    const activeId = (row.activeRevisionId ?? null) as string | null;
    const activeNumber = (row.activeRevisionNumber ?? null) as number | null;
    const baseId = (draft.baseRevisionId ?? null) as string | null;
    const baseNumber = (draft.baseRevisionNumber ?? null) as number | null;
    let baseOk = false;
    if (baseId === null && baseNumber === null) {
      baseOk = true;
    } else if (
      typeof baseNumber === 'number' &&
      Number.isSafeInteger(baseNumber) &&
      baseNumber >= 1 &&
      baseNumber <= RECORD_DEFINITION_REVISION_NUMBER_MAX &&
      typeof activeNumber === 'number' &&
      Number.isSafeInteger(activeNumber) &&
      activeNumber >= 1 &&
      activeNumber <= RECORD_DEFINITION_REVISION_NUMBER_MAX &&
      baseNumber <= activeNumber &&
      typeof row.branding === 'string' &&
      typeof row.name === 'string'
    ) {
      try {
        baseOk =
          baseId ===
          deriveRecordDefinitionRevisionId(
            {
              brandId: parseRecordDefinitionBrandId(row.branding as string),
              recordTypeKey: parseRecordDefinitionKey(row.name as string),
            },
            baseNumber
          );
      } catch {
        baseOk = false;
      }
    }
    // The report's active revision is independent of the retained base: null
    // covers untouched clone-time reports, otherwise it must be a published
    // revision at or before the current active revision. The schema already
    // bounds non-null values to 1..MAX; future or dangling values fail closed.
    const reportActive =
      inspected !== null && inspected.success && inspected.data.validation !== null
        ? inspected.data.validation.validatedActiveRevisionNumber
        : null;
    const reportActiveOk =
      inspected === null ||
      !inspected.success ||
      inspected.data.validation === null ||
      reportActive === null ||
      (typeof activeNumber === 'number' &&
        Number.isSafeInteger(activeNumber) &&
        typeof reportActive === 'number' &&
        reportActive <= activeNumber);
    if (
      recordType !== row.id ||
      branding !== row.branding ||
      draft.recordTypeId !== row.definitionId ||
      draft.recordTypeKey !== row.name ||
      draft.id !== row.draftId ||
      (lifecycleOperationToken != null &&
        lifecycleOperationToken !== '' &&
        (typeof lifecycleOperationToken !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(lifecycleOperationToken))) ||
      !baseOk ||
      (activeId === null && (baseId !== null || baseNumber !== null)) ||
      typeof row.version !== 'number' ||
      !Number.isSafeInteger(row.version) ||
      row.version < 0 ||
      row.version > RECORD_DEFINITION_REVISION_NUMBER_MAX ||
      row.schemaVersion !== 1 ||
      inspected === null ||
      !inspected.success ||
      inspected.data.version > row.version ||
      (inspected.data.validation !== null &&
        (inspected.data.validation.validatedDraftVersion !== inspected.data.version || !reportActiveOk))
    )
      return fail(path, 'invalid-managed-draft');
  }

  private validateAuthoritySnapshot(authority: RuntimeValue, path: string): void {
    // B11 preparation shares publication authority lookups. Malformed persisted
    // catalog values must fail closed with bounded diagnostics and never expose
    // raw persisted values. This mirrors the Default authority's safe-read checks
    // so custom/standalone authorities cannot broaden trust.
    if (!isRuntimeRecord(authority) || isProxy(authority)) return fail(path, 'invalid-authority');
    const roles = (authority as RuntimeRecord).roles;
    const forms = (authority as RuntimeRecord).forms;
    const keys = (authority as RuntimeRecord).availableRecordTypeKeys;
    if (!Array.isArray(roles) || roles.length > RECORD_DEFINITION_VALIDATION_LIMITS.maxCatalogEntries)
      return fail(path, 'invalid-authority');
    const seenRoles = new Set<string>();
    for (const name of roles) {
      if (
        typeof name !== 'string' ||
        name.length === 0 ||
        name.length > RECORD_DEFINITION_REFERENCE_MAX_LENGTH ||
        !RECORD_DEFINITION_REFERENCE_PATTERN.test(name) ||
        seenRoles.has(name)
      )
        return fail(path, 'invalid-authority');
      seenRoles.add(name);
    }
    if (!Array.isArray(forms) || forms.length > RECORD_DEFINITION_VALIDATION_LIMITS.maxFormCapabilities)
      return fail(path, 'invalid-authority');
    const seenForms = new Set<string>();
    for (const form of forms) {
      if (!isRuntimeRecord(form) || isProxy(form)) return fail(path, 'invalid-authority');
      const reference = (form as RuntimeRecord).reference;
      const operations = (form as RuntimeRecord).validationOperations;
      const groups = (form as RuntimeRecord).validationGroups;
      if (
        typeof reference !== 'string' ||
        reference.length === 0 ||
        reference.length > RECORD_DEFINITION_REFERENCE_MAX_LENGTH ||
        !RECORD_DEFINITION_REFERENCE_PATTERN.test(reference) ||
        seenForms.has(reference) ||
        (operations !== undefined && (!isRuntimeRecord(operations) || isProxy(operations))) ||
        (groups !== undefined && (!isRuntimeRecord(groups) || isProxy(groups)))
      )
        return fail(path, 'invalid-authority');
      seenForms.add(reference);
    }
    if (!Array.isArray(keys) || keys.length > RECORD_DEFINITION_VALIDATION_LIMITS.maxCatalogEntries)
      return fail(path, 'invalid-authority');
    for (const key of keys) {
      if (typeof key !== 'string') return fail(path, 'invalid-authority');
      try {
        parseRecordDefinitionKey(key);
      } catch {
        return fail(path, 'invalid-authority');
      }
    }
  }

  private validateRetirement(row: RuntimeRecord, path: string): void {
    const retired = row.retiredAt != null;
    if (
      (!retired && (row.retiredBy != null || (row.retirementReason != null && row.retirementReason !== ''))) ||
      !recordTypeIdentitySchema.safeParse({
        schemaVersion: row.schemaVersion,
        id: row.definitionId,
        brandId: row.branding,
        key: row.name,
        // Validate retirement through the existing DTO contract; deployment was checked separately.
        deployment: { packageType: 'migration', searchCore: 'migration' },
        version: row.version,
        activeRevision: null,
        draft: null,
        retirement: retired
          ? {
              retiredAt: timestamp(row.retiredAt),
              retiredBy: row.retiredBy,
              ...(row.retirementReason == null || row.retirementReason === '' ? {} : { reason: row.retirementReason }),
            }
          : null,
      }).success
    )
      return fail(path, 'invalid-retirement');
  }

  private async readRevisionAt(recordTypeId: string, revisionNumber: number): Promise<RuntimeRecord | null> {
    try {
      const stored = this.reader.revisionAt
        ? await this.reader.revisionAt(recordTypeId, revisionNumber)
        : await RecordDefinitionRevision.findOne({ recordType: recordTypeId, revisionNumber }).meta(READ_META);
      if (!stored) return null;
      return dataRow(stored as object as RuntimeRecord, '$');
    } catch {
      return null;
    }
  }

  private isValidPublicationEvidence(history: RuntimeRecord, row: RuntimeRecord, revision: RuntimeRecord): boolean {
    if (history.schemaVersion !== 1) return false;
    if (history.branding !== row.branding) return false;
    if (history.recordType !== row.id) return false;
    if (history.recordTypeId !== row.definitionId) return false;
    if (history.recordTypeKey !== row.name) return false;
    if (typeof history.id !== 'string' || !/^rdh_[a-f0-9]{32}$/.test(history.id)) return false;
    if (history.revision !== revision.id) return false;
    if (history.revisionNumber !== revision.revisionNumber) return false;
    if (history.canonicalHash !== revision.canonicalHash) return false;
    const operation = history.operation;
    if (typeof operation !== 'string') return false;
    if (!['publish', 'rollback', 'migration', 'bootstrap'].includes(operation)) return false;
    const source = revision.source;
    if (!isRuntimeRecord(source) || isProxy(source)) return false;
    if ((source as RuntimeRecord).operation !== operation) return false;
    if (!isDeepStrictEqual(history.source, revision.source)) return false;
    if (!isDeepStrictEqual(history.actor, revision.publishedBy)) return false;
    try {
      if (Date.parse(timestamp(history.occurredAt)) !== Date.parse(timestamp(revision.publishedAt))) return false;
    } catch {
      return false;
    }
    const revisionNumber = revision.revisionNumber;
    if (typeof revisionNumber !== 'number' || !Number.isSafeInteger(revisionNumber)) return false;
    if (revisionNumber < 1 || revisionNumber > RECORD_DEFINITION_REVISION_NUMBER_MAX) return false;
    const expectedActive = history.expectedActiveRevisionNumber;
    if (revisionNumber === 1) {
      if (expectedActive !== null) return false;
    } else if (expectedActive !== revisionNumber - 1) return false;
    const expectedIdentityVersion = history.expectedIdentityVersion;
    const resultingIdentityVersion = history.resultingIdentityVersion;
    if (typeof expectedIdentityVersion !== 'number' || !Number.isSafeInteger(expectedIdentityVersion)) return false;
    if (expectedIdentityVersion < 0 || expectedIdentityVersion > RECORD_DEFINITION_REVISION_NUMBER_MAX) return false;
    if (resultingIdentityVersion !== expectedIdentityVersion + 1) return false;
    const expectedDraftVersion = history.expectedDraftVersion;
    if (operation === 'publish') {
      if (typeof expectedDraftVersion !== 'number' || !Number.isSafeInteger(expectedDraftVersion)) return false;
      if (expectedDraftVersion < 0 || expectedDraftVersion > RECORD_DEFINITION_REVISION_NUMBER_MAX) return false;
    } else if (expectedDraftVersion !== null) return false;
    if (['bootstrap', 'migration'].includes(operation)) {
      if (expectedIdentityVersion !== 0) return false;
      if (history.operationId !== history.id) return false;
      if (history.id !== `rdh_${String(row.definitionId).slice(4)}`) return false;
      // Shared provenance for current and prior revisions: fixed bootstrap
      // actor/display-name and fixed migration actor. Notes are checked below.
      const publishedBy = revision.publishedBy;
      if (operation === 'bootstrap') {
        if (!isRuntimeRecord(publishedBy) || isProxy(publishedBy)) return false;
        const actor = publishedBy as RuntimeRecord;
        if (actor.id !== 'bootstrap') return false;
        if (typeof actor.displayName !== 'string' || !/^Seed version [1-9][0-9]{0,15}$/.test(actor.displayName))
          return false;
      } else if (!isDeepStrictEqual(publishedBy, ACTOR)) return false;
    } else {
      if (typeof history.operationId !== 'string') return false;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(history.operationId))
        return false;
      if (history.id !== `rdh_${history.operationId.replace(/-/g, '')}`) return false;
    }
    if ((history.note ?? '') !== (revision.publicationNote ?? '')) {
      if (operation === 'migration') {
        // Strict prior/current parity: exact allowed note envelope,
        // workflow-step count equal to the migrated definition's stages and
        // no forged extra fields. The revision itself must carry no
        // publication note; the history note is the sole provenance record.
        if ((revision.publicationNote ?? '') !== '') return false;
        const stages = revisionStagesLength(revision);
        if (stages === null) return false;
        if (!isValidMigrationNote(history.note, stages)) return false;
      } else return false;
    } else if (operation === 'migration') {
      // Even when the raw values compare equal, a migration must still carry
      // the strict envelope (covers empty/missing notes and forged envelopes
      // that happen to match an equally forged revision note).
      if ((revision.publicationNote ?? '') !== '') return false;
      const stages = revisionStagesLength(revision);
      if (stages === null) return false;
      if (!isValidMigrationNote(history.note, stages)) return false;
    }
    const validation = recordDefinitionValidationReportSchema.safeParse(history.validation);
    const impact = recordDefinitionImpactReportSchema.safeParse(history.impact);
    if (!validation.success || !impact.success) return false;
    if (validation.data.brandId !== row.branding) return false;
    if (validation.data.recordTypeKey !== row.name) return false;
    if (impact.data.brandId !== row.branding) return false;
    if (impact.data.recordTypeKey !== row.name) return false;
    const expectedScope =
      operation === 'migration' ? 'migration' : operation === 'rollback' ? 'rollback' : 'publication';
    if (validation.data.scope !== expectedScope) return false;
    if (validation.data.validatedActiveRevisionNumber !== expectedActive) return false;
    if (operation === 'rollback') {
      if (validation.data.validatedDraftVersion !== impact.data.draftVersion) return false;
    } else if (validation.data.validatedDraftVersion !== (expectedDraftVersion ?? 0)) return false;
    if (impact.data.activeRevisionNumber !== expectedActive) return false;
    if (operation === 'rollback') {
      if (expectedDraftVersion !== null) return false;
    } else if (impact.data.draftVersion !== (expectedDraftVersion ?? 0)) return false;
    if (validation.data.status !== 'valid') return false;
    if (impact.data.status === 'blocked') return false;
    if (!isDeepStrictEqual(history.changes, impact.data.changes)) return false;
    if (
      !recordDefinitionHistorySummarySchema.safeParse({
        schemaVersion: history.schemaVersion,
        id: history.id,
        brandId: history.branding,
        recordTypeKey: history.recordTypeKey,
        revision: { id: revision.id, revisionNumber, canonicalHash: revision.canonicalHash },
        source: history.source,
        publishedAt: timestamp(history.occurredAt),
        publishedBy: history.actor,
        ...(history.note == null || history.note === '' ? {} : { publicationNote: history.note }),
        validation: {
          status: validation.data.status,
          errorCount: validation.data.issues.filter(issue => issue.severity === 'error').length,
          warningCount: validation.data.issues.filter(issue => issue.severity === 'warning').length,
        },
        impact: { status: impact.data.status, affectedRecordCount: impact.data.affectedRecordCount },
        changes: history.changes,
        redactions: history.redactions,
        truncated: history.truncated,
      }).success
    )
      return false;
    return true;
  }

  /** Shared operation-specific provenance: fixed bootstrap actor and migration actor/note. */
  private hasValidOperationProvenance(
    parsed: {
      data: { source: { operation: string }; publishedBy: RuntimeValue; definition: { stages: RuntimeValue[] } };
    },
    history: RuntimeRecord
  ): boolean {
    const operation = parsed.data.source.operation;
    const publishedBy = parsed.data.publishedBy;
    if (!isDeepStrictEqual(history.actor, publishedBy)) return false;
    if (operation === 'bootstrap') {
      if (!isRuntimeRecord(publishedBy) || isProxy(publishedBy)) return false;
      const actor = publishedBy as RuntimeRecord;
      if (actor.id !== 'bootstrap') return false;
      if (typeof actor.displayName !== 'string' || !/^Seed version [1-9][0-9]{0,15}$/.test(actor.displayName))
        return false;
      if ((history.note ?? '') !== '') return false;
      return true;
    }
    if (operation === 'migration') {
      if (!isDeepStrictEqual(publishedBy, ACTOR)) return false;
      // Strict parity with current provenance: fixed migration actor, exact
      // allowed note envelope, workflow-step count equal to the migrated
      // definition's stages and no forged extra fields. A relabelled prior
      // with a forged actor/note fails closed; valid legacy migrations stay
      // accepted. Both preflight and migrate share this path.
      const expectedStages = (parsed.data.definition.stages ?? []) as readonly RuntimeValue[];
      if (!Array.isArray(expectedStages)) return false;
      if (!isValidMigrationNote(history.note, expectedStages.length)) return false;
      return true;
    }
    return true;
  }

  private async isValidPriorRevision(
    revision: RuntimeRecord,
    row: RuntimeRecord,
    revisionNumber: number,
    history: RuntimeRecord,
    authority: RecordDefinitionPublicationAuthoritySnapshot,
    identity: {
      readonly brandId: ReturnType<typeof parseRecordDefinitionBrandId>;
      readonly recordTypeKey: ReturnType<typeof parseRecordDefinitionKey>;
    }
  ): Promise<boolean> {
    if (revision.recordType !== row.id) return false;
    if (revision.branding !== row.branding) return false;
    if (revision.recordTypeId !== row.definitionId) return false;
    if (revision.recordTypeKey !== row.name) return false;
    if (revision.revisionNumber !== revisionNumber) return false;
    if (typeof revision.id !== 'string' || revision.id.length === 0 || revision.id.length > 256) return false;
    try {
      if (revision.id !== deriveRecordDefinitionRevisionId(identity, revisionNumber)) return false;
    } catch {
      return false;
    }
    const parsed = recordDefinitionRevisionSchema.safeParse(revisionPayload(revision));
    if (!parsed.success) return false;
    if (hashRecordDefinition(parsed.data.definition) !== parsed.data.canonicalHash) return false;
    if (revision.canonicalHash !== parsed.data.canonicalHash) return false;
    if (!isDeepStrictEqual(revision.createdBy, revision.publishedBy)) return false;
    // Manifest/payload agreement: stored contracts must equal the parsed payload contracts.
    if (!isDeepStrictEqual(revision.actionContracts, parsed.data.actionContracts)) return false;
    const source = parsed.data.source;
    if (
      (source.sourceRevisionNumber !== null && source.sourceRevisionNumber >= parsed.data.revisionNumber) ||
      (['bootstrap', 'migration'].includes(source.operation) &&
        (parsed.data.revisionNumber !== 1 || source.sourceRevisionNumber !== null)) ||
      (source.operation === 'publish' &&
        source.sourceRevisionNumber !== (parsed.data.revisionNumber === 1 ? null : parsed.data.revisionNumber - 1)) ||
      (source.operation === 'rollback' &&
        (source.sourceRevisionNumber === null ||
          !Number.isSafeInteger(source.sourceRevisionNumber) ||
          source.sourceRevisionNumber < 1 ||
          source.sourceRevisionNumber >= parsed.data.revisionNumber))
    )
      return false;
    // Strict parity with current provenance: bootstrap requires the fixed
    // seed actor/display name with an empty note and migration requires the
    // fixed migration actor, exact source, empty revision note and the exact
    // note envelope with stage-equal step count and no extra fields. Fixed
    // actor/source/history/hash semantics apply to priors; forgeries fail
    // closed in both preflight and migrate.
    if (['bootstrap', 'migration'].includes(source.operation)) {
      if ((revision.publicationNote ?? '') !== '') return false;
      if (
        !isDeepStrictEqual(source, {
          operation: source.operation,
          sourceRevisionNumber: null,
        })
      )
        return false;
      if (source.operation === 'migration' && !isDeepStrictEqual(source, SOURCE)) return false;
      if (history.operation !== source.operation) return false;
      if (!isDeepStrictEqual(history.source, revision.source)) return false;
      if (!isDeepStrictEqual(history.actor, revision.publishedBy)) return false;
      if (history.revision !== revision.id) return false;
      if (history.revisionNumber !== revisionNumber) return false;
      if (history.canonicalHash !== revision.canonicalHash) return false;
    }
    if (!this.hasValidOperationProvenance(parsed as object as never, history)) return false;
    // Full definition semantic validation against the current authority. Prior
    // revisions must remain publishable under current roles/forms/actions and
    // agree with their historical publication evidence. Schema-valid but
    // unavailable actions or nonexistent roles fail closed even when hashes
    // were recomputed.
    try {
      const expectedDraft =
        typeof history.expectedDraftVersion === 'number' &&
        Number.isSafeInteger(history.expectedDraftVersion) &&
        (history.expectedDraftVersion as number) >= 0 &&
        (history.expectedDraftVersion as number) <= RECORD_DEFINITION_REVISION_NUMBER_MAX
          ? (history.expectedDraftVersion as number)
          : 0;
      const expectedActive =
        typeof history.expectedActiveRevisionNumber === 'number' &&
        Number.isSafeInteger(history.expectedActiveRevisionNumber) &&
        (history.expectedActiveRevisionNumber as number) >= 1
          ? (history.expectedActiveRevisionNumber as number)
          : null;
      const definition = { ...parsed.data.definition, definitionState: 'draft-incomplete' as const };
      const publication = validateRecordDefinitionForPublication({
        ...authority,
        ...identity,
        definition,
        activeDefinition: null,
        draftVersion: expectedDraft,
        activeRevisionNumber: expectedActive,
        administrativeRole: 'Admin',
      });
      if (!publication.ok) return false;
      if (!isDeepStrictEqual(canonicalizeRecordDefinition(parsed.data.definition), parsed.data.definition))
        return false;
      if (!isDeepStrictEqual(publication.actionContracts, parsed.data.actionContracts)) return false;
      if (publication.canonicalHash !== parsed.data.canonicalHash) return false;
    } catch {
      return false;
    }
    return true;
  }

  private isValidRetirementEvent(event: RuntimeRecord, row: RuntimeRecord): boolean {
    if (event.schemaVersion !== 1) return false;
    if (event.branding !== row.branding) return false;
    if (event.recordType !== row.id) return false;
    if (event.recordTypeId !== row.definitionId) return false;
    if (event.recordTypeKey !== row.name) return false;
    const operation = event.operation;
    if (operation !== 'retire' && operation !== 'unretire') return false;
    if (typeof event.operationId !== 'string') return false;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(event.operationId as string))
      return false;
    if (event.id !== `rdh_${(event.operationId as string).replace(/-/g, '')}`) return false;
    const expected = event.expectedIdentityVersion;
    const resulting = event.resultingIdentityVersion;
    if (typeof expected !== 'number' || !Number.isSafeInteger(expected)) return false;
    if (typeof resulting !== 'number' || !Number.isSafeInteger(resulting)) return false;
    if ((expected as number) < 0 || (expected as number) > RECORD_DEFINITION_REVISION_NUMBER_MAX) return false;
    if ((resulting as number) !== (expected as number) + 1) return false;
    const expectedActive = event.expectedActiveRevisionNumber;
    if (typeof expectedActive !== 'number' || !Number.isSafeInteger(expectedActive)) return false;
    if ((expectedActive as number) < 1 || (expectedActive as number) > RECORD_DEFINITION_REVISION_NUMBER_MAX)
      return false;
    if (event.revision !== null && event.revision !== undefined) return false;
    if (event.revisionNumber !== null && event.revisionNumber !== undefined) return false;
    if (event.canonicalHash !== null && event.canonicalHash !== undefined) return false;
    if (event.expectedDraftVersion !== null) return false;
    if (event.validation !== null) return false;
    if (event.impact !== null) return false;
    if (event.source !== null) return false;
    if (typeof event.id !== 'string' || !/^rdh_[a-f0-9]{32}$/.test(event.id as string)) return false;
    // Preserve fail-closed timestamp diagnostics: malformed event times throw
    // the bounded secret-free invalid-artifact-timestamp error.
    timestamp(event.occurredAt);
    // Complete strict actor contract on every retirement/unretirement event,
    // including historical and future rows. Malformed actor fields (object
    // displayName, extra properties, bad id) fail closed with no leakage.
    if (!isValidStrictActor(event.actor)) return false;
    const note = event.note;
    if (note !== null && note !== undefined && note !== '') {
      if (typeof note !== 'string' || note.length > 512) return false;
    }
    const expectedChanges = [{ path: '/retirement', kind: operation === 'retire' ? 'added' : 'removed' }];
    if (!isDeepStrictEqual(event.changes, expectedChanges)) return false;
    if (!isDeepStrictEqual(event.redactions, [])) return false;
    if (event.truncated !== false) return false;
    return true;
  }

  /**
   * Operation-specific validation for every history row before trusting any
   * coordinates. Covers publication/rollback/bootstrap/migration/retire/
   * unretire rows; rejects extra operations, negative/out-of-range versions,
   * missing provenance and object timestamps. Malformed timestamps throw the
   * bounded secret-free invalid-artifact-timestamp error.
   */
  private isValidGenericHistoryRow(entry: RuntimeRecord, row: RuntimeRecord): boolean {
    if (entry.schemaVersion !== 1) return false;
    if (entry.branding !== row.branding) return false;
    if (entry.recordType !== row.id) return false;
    if (entry.recordTypeId !== row.definitionId) return false;
    if (entry.recordTypeKey !== row.name) return false;
    const operation = entry.operation;
    if (
      operation !== 'publish' &&
      operation !== 'rollback' &&
      operation !== 'migration' &&
      operation !== 'bootstrap' &&
      operation !== 'retire' &&
      operation !== 'unretire'
    )
      return false;
    const expected = entry.expectedIdentityVersion;
    const resulting = entry.resultingIdentityVersion;
    if (typeof expected !== 'number' || !Number.isSafeInteger(expected)) return false;
    if (typeof resulting !== 'number' || !Number.isSafeInteger(resulting)) return false;
    if (expected < 0 || expected > RECORD_DEFINITION_REVISION_NUMBER_MAX) return false;
    if (resulting !== expected + 1) return false;
    if (typeof entry.id !== 'string' || !/^rdh_[a-f0-9]{32}$/.test(entry.id)) return false;
    // Object timestamps and malformed times fail closed with the bounded
    // invalid-artifact-timestamp diagnostic (no secret leakage).
    timestamp(entry.occurredAt);
    if (operation === 'retire' || operation === 'unretire') {
      return this.isValidRetirementEvent(entry, row);
    }
    // Publication-type rows must carry provenance; missing source/actor/
    // revision/validation/impact fails closed before coordinates are trusted.
    if (typeof entry.revision !== 'string' || entry.revision.length === 0 || entry.revision.length > 256) return false;
    if (
      typeof entry.revisionNumber !== 'number' ||
      !Number.isSafeInteger(entry.revisionNumber) ||
      entry.revisionNumber < 1 ||
      entry.revisionNumber > RECORD_DEFINITION_REVISION_NUMBER_MAX
    )
      return false;
    if (typeof entry.canonicalHash !== 'string' || entry.canonicalHash.length === 0) return false;
    if (!isRuntimeRecord(entry.source) || isProxy(entry.source)) return false;
    if ((entry.source as RuntimeRecord).operation !== operation) return false;
    if (!isRuntimeRecord(entry.actor) || isProxy(entry.actor)) return false;
    const actorId = (entry.actor as RuntimeRecord).id;
    if (typeof actorId !== 'string' || actorId.length === 0 || actorId.length > 256) return false;
    if (entry.validation === null || entry.validation === undefined) return false;
    if (entry.impact === null || entry.impact === undefined) return false;
    const expectedDraft = entry.expectedDraftVersion;
    if (operation === 'publish') {
      if (typeof expectedDraft !== 'number' || !Number.isSafeInteger(expectedDraft)) return false;
      if (expectedDraft < 0 || expectedDraft > RECORD_DEFINITION_REVISION_NUMBER_MAX) return false;
    } else if (expectedDraft !== null) return false;
    const expectedActive = entry.expectedActiveRevisionNumber;
    if (operation === 'bootstrap' || operation === 'migration') {
      if (expectedActive !== null) return false;
      if (expected !== 0) return false;
      if (entry.operationId !== entry.id) return false;
    } else {
      if (expectedActive !== null) {
        if (typeof expectedActive !== 'number' || !Number.isSafeInteger(expectedActive)) return false;
        if (expectedActive < 1 || expectedActive > RECORD_DEFINITION_REVISION_NUMBER_MAX) return false;
      }
      if (typeof entry.operationId !== 'string') return false;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(entry.operationId as string))
        return false;
      if (entry.id !== `rdh_${(entry.operationId as string).replace(/-/g, '')}`) return false;
    }
    const note = entry.note;
    if (note !== null && note !== undefined && note !== '') {
      if (typeof note !== 'string' || note.length > 8192) return false;
    }
    if (entry.truncated !== false) return false;
    if (!Array.isArray(entry.changes)) return false;
    if (!Array.isArray(entry.redactions)) return false;
    return true;
  }

  /**
   * Shared bounded complete history enumeration used by service preflight,
   * service migrate and the stock CLI. Validates every event before trusting
   * coordinates; fails closed on malformed, duplicate or out-of-range
   * evidence with consistent count/byte bounds and no writes.
   */
  private async collectCompleteHistory(row: RuntimeRecord): Promise<RuntimeRecord[] | null> {
    const parseAll = (values: readonly RuntimeValue[]): RuntimeRecord[] | null => {
      if (!Array.isArray(values) || values.length > 512) return null;
      let bytes = 0;
      const parsed: RuntimeRecord[] = [];
      const seenIds = new Set<string>();
      const seenResultings = new Set<number>();
      for (let index = 0; index < values.length; index++) {
        let entry: RuntimeRecord;
        try {
          entry = historyRow(values[index], '$');
        } catch (error) {
          if (
            error instanceof LegacyDatabaseMigrationError &&
            (error.code === 'invalid-artifact-timestamp' || error.code === 'invalid-storage-row')
          )
            throw error;
          return null;
        }
        try {
          if (!this.isValidGenericHistoryRow(entry, row)) return null;
        } catch (error) {
          if (error instanceof LegacyDatabaseMigrationError) throw error;
          return null;
        }
        if (typeof entry.id === 'string') {
          if (seenIds.has(entry.id)) return null;
          seenIds.add(entry.id);
        }
        const resulting = entry.resultingIdentityVersion;
        if (typeof resulting === 'number' && Number.isSafeInteger(resulting)) {
          if (seenResultings.has(resulting)) return null;
          seenResultings.add(resulting);
        }
        bytes += Buffer.byteLength(JSON.stringify(entry), 'utf8');
        if (bytes > 8_000_000) return null;
        parsed.push(entry);
      }
      return parsed;
    };
    try {
      // Injected reader enumeration first: the stock CLI supplies the same
      // bounded complete list over native Mongo, so out-of-range evidence
      // (for example negative resulting versions) cannot be skipped by a
      // per-version scan.
      if (this.reader.histories) {
        const values = await this.reader.histories(row.id as string);
        return parseAll(values);
      }
      const models = globalThis as object as {
        readonly RecordDefinitionHistory?: {
          readonly find?: (criteria: RuntimeRecord) => object;
        };
      };
      const finder = models.RecordDefinitionHistory?.find;
      if (typeof finder === 'function') {
        const query = finder.call(models.RecordDefinitionHistory, { recordType: row.id }) as {
          meta?: (options: { skipRecordVerification: true }) => object;
          sort?: (spec: string) => object;
          limit?: (maximum: number) => Promise<RuntimeValue[]>;
        };
        let chain: object = query;
        if (typeof (chain as { meta?: object }).meta === 'function') {
          chain = (chain as { meta: (options: { skipRecordVerification: true }) => object }).meta(READ_META);
        }
        if (typeof (chain as { sort?: object }).sort === 'function') {
          chain = (chain as { sort: (spec: string) => object }).sort('id ASC');
        }
        if (typeof (chain as { limit?: object }).limit === 'function') {
          const rows = await (chain as { limit: (maximum: number) => Promise<RuntimeValue[]> }).limit(513);
          return parseAll(rows);
        }
      }
    } catch (error) {
      if (error instanceof LegacyDatabaseMigrationError) throw error;
      return null;
    }
    // No per-version fallback: scanning only 0..identity.version would skip
    // malformed out-of-range retirement evidence. Fail closed instead.
    return null;
  }

  private async collectRetirementEvents(row: RuntimeRecord): Promise<RuntimeRecord[] | null> {
    const all = await this.collectCompleteHistory(row);
    if (all === null) return null;
    const events: RuntimeRecord[] = [];
    const seenIds = new Set<string>();
    for (const parsedRow of all) {
      if (typeof parsedRow.id === 'string') {
        if (seenIds.has(parsedRow.id)) return null;
        seenIds.add(parsedRow.id);
      }
      if (parsedRow.operation === 'retire' || parsedRow.operation === 'unretire') {
        try {
          if (!this.isValidRetirementEvent(parsedRow, row)) return null;
        } catch (error) {
          if (error instanceof LegacyDatabaseMigrationError) throw error;
          return null;
        }
        events.push(parsedRow);
      }
    }
    return events;
  }

  /**
   * Initial-migration history gate for inactive legacy identities. Enumerates
   * the bounded complete history before any writes/indexes, accepting only a
   * clean legacy (no rows) or a single legitimate migration recovery artifact
   * bound to this transformation. All forged extra rows (distinct IDs,
   * negative/out-of-range versions, missing provenance, object timestamps)
   * fail closed with bounded secret-free diagnostics, zero writes and
   * unchanged state. Shared by service preflight/migrate and the stock CLI.
   */
  private async validateInactiveLegacyHistories(
    row: RuntimeRecord,
    transformed: LegacyDatabaseTransformation,
    publication: ValidatedRecordDefinitionPublication,
    definitionId: string,
    path: string
  ): Promise<void> {
    const boundRow = { ...row, definitionId, schemaVersion: 1, version: 0 } as RuntimeRecord;
    // Isolated transformation harnesses provide no history store (no histories
    // reader and no Waterline global). There is nothing to enumerate there;
    // production service/CLI always supply one of them, so the gate still runs
    // with parity wherever durable history can exist.
    const hasHistoriesReader = typeof this.reader.histories === 'function';
    const models = globalThis as object as {
      readonly RecordDefinitionHistory?: { readonly find?: (criteria: RuntimeRecord) => object };
    };
    const hasGlobalHistories = typeof models.RecordDefinitionHistory?.find === 'function';
    if (!hasHistoriesReader && !hasGlobalHistories) return;
    let complete: RuntimeRecord[] | null;
    try {
      complete = await this.collectCompleteHistory(boundRow);
    } catch (error) {
      if (error instanceof LegacyDatabaseMigrationError) throw error;
      return fail(path, 'invalid-identity-history');
    }
    if (complete === null) return fail(path, 'invalid-identity-history');
    if (complete.length === 0) return;
    if (complete.length !== 1) return fail(path, 'invalid-identity-history');
    const entry = complete[0] as RuntimeRecord;
    const revisionId = deriveRecordDefinitionRevisionId(transformed, 1);
    const historyId = `rdh_${definitionId.slice(4)}`;
    if (
      entry.operation !== 'migration' ||
      entry.id !== historyId ||
      entry.operationId !== historyId ||
      entry.expectedIdentityVersion !== 0 ||
      entry.resultingIdentityVersion !== 1 ||
      entry.expectedDraftVersion !== null ||
      entry.expectedActiveRevisionNumber !== null ||
      entry.revision !== revisionId ||
      entry.revisionNumber !== 1 ||
      entry.canonicalHash !== publication.canonicalHash ||
      !isDeepStrictEqual(entry.source, SOURCE) ||
      !isDeepStrictEqual(entry.actor, ACTOR) ||
      !isValidStrictActor(entry.actor)
    )
      return fail(path, 'invalid-identity-history');
    if (!isValidMigrationNote(entry.note, publication.definition.stages.length))
      return fail(path, 'invalid-identity-history');
    let storedRevision: RuntimeRecord | null = null;
    try {
      const stored = await this.readRevision(revisionId);
      if (stored) storedRevision = dataRow(stored as object as RuntimeRecord, path);
    } catch {
      return fail(path, 'invalid-identity-history');
    }
    if (!storedRevision) return fail(path, 'invalid-identity-history');
    if (!this.isValidPublicationEvidence(entry, boundRow, storedRevision))
      return fail(path, 'invalid-identity-history');
    if (
      storedRevision.canonicalHash !== publication.canonicalHash ||
      !isDeepStrictEqual(storedRevision.source, SOURCE) ||
      !isDeepStrictEqual(storedRevision.publishedBy, ACTOR) ||
      !isDeepStrictEqual(storedRevision.createdBy, ACTOR)
    )
      return fail(path, 'invalid-identity-history');
  }

  /**
   * Latest durable retirement at or before the current identity version.
   * Future retirement evidence beyond identity.version is excluded from the
   * current binding but still validated as a continuation in the complete
   * chronological replay (impossible revisions and lifecycle-state violations
   * fail closed there). This preserves legitimate save gaps and valid
   * intermediate states with later rows still present.
   */
  private async readLatestRetirementAtOrBefore(
    recordTypeId: string,
    row: RuntimeRecord,
    version: number
  ): Promise<RuntimeRecord | null> {
    const events = await this.collectRetirementEvents(row);
    if (events === null) return null;
    let latest: RuntimeRecord | null = null;
    for (const event of events) {
      const resulting = event.resultingIdentityVersion as number;
      if (typeof resulting !== 'number' || !Number.isSafeInteger(resulting)) return null;
      if (resulting > version) continue;
      if (!latest || resulting > (latest.resultingIdentityVersion as number)) latest = event;
    }
    return latest;
  }

  private async validateCompleteLifecycle(
    row: RuntimeRecord,
    revision: RuntimeRecord,
    publicationHistory: RuntimeRecord,
    authority: RecordDefinitionPublicationAuthoritySnapshot,
    identity: {
      readonly brandId: ReturnType<typeof parseRecordDefinitionBrandId>;
      readonly recordTypeKey: ReturnType<typeof parseRecordDefinitionKey>;
    }
  ): Promise<boolean> {
    const currentActive = revision.revisionNumber;
    if (typeof currentActive !== 'number' || !Number.isSafeInteger(currentActive)) return false;
    if ((currentActive as number) < 1 || (currentActive as number) > RECORD_DEFINITION_REVISION_NUMBER_MAX)
      return false;
    if ((currentActive as number) > 1024) return false;
    if (typeof row.id !== 'string') return false;
    const publicationResulting = publicationHistory.resultingIdentityVersion;
    const publicationExpected = publicationHistory.expectedIdentityVersion;
    if (typeof publicationResulting !== 'number' || !Number.isSafeInteger(publicationResulting)) return false;
    if (typeof publicationExpected !== 'number' || !Number.isSafeInteger(publicationExpected)) return false;
    if ((publicationExpected as number) + 1 !== (publicationResulting as number)) return false;
    if ((currentActive as number) > (publicationResulting as number)) return false;
    const recordTypeId = row.id as string;
    // Predecessor completeness: every active revision above 1 requires all
    // predecessors 1..current. Surviving-row counts never infer a legitimate
    // truncated chain; only genuine single-revision rev1 (and its valid
    // legacy migration, which is also rev1) may stand alone. Deleting rev1
    // and rev2 rows/histories while retaining rev3 therefore fails closed.
    for (let revisionNumber = 1; revisionNumber <= (currentActive as number); revisionNumber++) {
      try {
        const existing = await this.readRevisionAt(recordTypeId, revisionNumber);
        if (!existing && (currentActive as number) > 1) return false;
        if (!existing && (currentActive as number) === 1 && revisionNumber === (currentActive as number)) return false;
      } catch {
        return false;
      }
    }
    // Validate every publication 1..current with full semantic checks and
    // resulting-slot binding (detects deleted or duplicated histories).
    const publicationResultings: number[] = [];
    const publicationRevisionNumbers: number[] = [];
    let floor = -1;
    for (let revisionNumber = 1; revisionNumber <= (currentActive as number); revisionNumber++) {
      let storedHistory: RuntimeRecord;
      try {
        const stored = await this.readHistory({ recordType: recordTypeId, revisionNumber });
        if (!stored) return false;
        storedHistory = historyRow(stored, '$');
      } catch (error) {
        if (
          error instanceof LegacyDatabaseMigrationError &&
          (error.code === 'invalid-artifact-timestamp' || error.code === 'invalid-storage-row')
        )
          throw error;
        return false;
      }
      if (revisionNumber === (currentActive as number)) {
        if (storedHistory.id !== publicationHistory.id) return false;
        if (storedHistory.revision !== revision.id) return false;
        if (storedHistory.canonicalHash !== revision.canonicalHash) return false;
        if (storedHistory.resultingIdentityVersion !== publicationResulting) return false;
        if (storedHistory.expectedIdentityVersion !== publicationExpected) return false;
        if (!this.isValidPublicationEvidence(storedHistory, row, revision)) return false;
      } else {
        const storedRevision = await this.readRevisionAt(recordTypeId, revisionNumber);
        if (!storedRevision) return false;
        if (!(await this.isValidPriorRevision(storedRevision, row, revisionNumber, storedHistory, authority, identity)))
          return false;
        if (storedHistory.revision !== storedRevision.id) return false;
        if (storedHistory.canonicalHash !== storedRevision.canonicalHash) return false;
        if (!this.isValidPublicationEvidence(storedHistory, row, storedRevision)) return false;
        const successorExpected = storedHistory.expectedIdentityVersion;
        const successorResulting = storedHistory.resultingIdentityVersion;
        if (typeof successorExpected !== 'number' || !Number.isSafeInteger(successorExpected)) return false;
        if (typeof successorResulting !== 'number' || !Number.isSafeInteger(successorResulting)) return false;
        if ((successorExpected as number) < floor) return false;
        if ((successorResulting as number) !== (successorExpected as number) + 1) return false;
        if (!((successorResulting as number) > floor)) return false;
        if (!((successorResulting as number) < (publicationResulting as number))) return false;
        if (!((successorExpected as number) < (publicationExpected as number))) return false;
        floor = successorResulting as number;
      }
      const resulting = storedHistory.resultingIdentityVersion as number;
      publicationResultings.push(resulting);
      publicationRevisionNumbers.push(revisionNumber);
      // Resulting-slot binding: the history occupying this resulting version
      // must be this publication (detects forged version reuse across slots).
      try {
        const occupant = await this.readHistory({ recordType: recordTypeId, resultingIdentityVersion: resulting });
        if (!occupant) return false;
        if (historyRow(occupant, '$').id !== storedHistory.id) return false;
      } catch {
        return false;
      }
      if (revisionNumber === (currentActive as number)) {
        if ((publicationExpected as number) < floor) return false;
        if (!((publicationResulting as number) > floor)) return false;
      }
    }
    // Validate every retirement event with distinct resulting slots and
    // resulting-slot binding, then run a complete bounded chronological
    // lifecycle replay. The replay retains operation, expected/resulting
    // active revision, publication/retirement state and identity binding;
    // requires actual active->retired->active transitions, matches every
    // retirement/unretirement to the active revision immediately before it,
    // prohibits publication while retired, allows legitimate save gaps
    // (expected >= previous resulting) without accepting forged
    // earlier-save-slot occupation, and binds the final state to the
    // current identity.
    const retirements = await this.collectRetirementEvents(row);
    if (retirements === null) return false;
    const seenResultings = new Set<number>(publicationResultings);
    for (const event of retirements) {
      const resulting = event.resultingIdentityVersion as number;
      if (seenResultings.has(resulting)) return false;
      seenResultings.add(resulting);
      try {
        const occupant = await this.readHistory({ recordType: recordTypeId, resultingIdentityVersion: resulting });
        if (!occupant) return false;
        if (historyRow(occupant, '$').id !== (event.id as string)) return false;
      } catch {
        return false;
      }
    }
    interface ReplayEvent {
      readonly kind: 'publication' | 'retire' | 'unretire';
      readonly expected: number;
      readonly resulting: number;
      readonly revisionNumber: number | null;
      readonly expectedActive: number | null;
    }
    const replay: ReplayEvent[] = [];
    const publicationExpectedByRevision = new Map<number, number>();
    for (let index = 0; index < publicationRevisionNumbers.length; index++) {
      const revisionNumber = publicationRevisionNumbers[index] as number;
      const resulting = publicationResultings[index] as number;
      // Re-read expected values from already-validated histories (bounded).
      const stored = await this.readHistory({ recordType: recordTypeId, revisionNumber });
      if (!stored) return false;
      let parsedHistory: RuntimeRecord;
      try {
        parsedHistory = historyRow(stored, '$');
      } catch (error) {
        if (
          error instanceof LegacyDatabaseMigrationError &&
          (error.code === 'invalid-artifact-timestamp' || error.code === 'invalid-storage-row')
        )
          throw error;
        return false;
      }
      const expected = parsedHistory.expectedIdentityVersion as number;
      publicationExpectedByRevision.set(revisionNumber, expected);
      replay.push({
        kind: 'publication',
        expected,
        resulting,
        revisionNumber,
        expectedActive: (parsedHistory.expectedActiveRevisionNumber ?? null) as number | null,
      });
    }
    if (typeof row.version !== 'number' || !Number.isSafeInteger(row.version)) return false;
    const identityVersion = row.version as number;
    // Every publication must sit at or below the current identity version;
    // a publication beyond it fails closed.
    for (const resulting of publicationResultings) {
      if ((resulting as number) > identityVersion) return false;
    }
    // Extra-rows binding: the bounded complete history must contain exactly
    // the validated publications (one per revision 1..current) plus the
    // validated retirements. Extra save/duplicate/out-of-range rows fail
    // closed before any coordinates are trusted.
    const complete = await this.collectCompleteHistory(row);
    if (complete === null) return false;
    if (complete.length !== publicationRevisionNumbers.length + retirements.length) return false;
    const completePublications = complete.filter(
      entry => entry.operation !== 'retire' && entry.operation !== 'unretire'
    );
    if (completePublications.length !== (currentActive as number)) return false;
    const completeRevisionNumbers = completePublications
      .map(entry => entry.revisionNumber as number)
      .sort((left, right) => (left as number) - (right as number));
    for (let index = 0; index < completeRevisionNumbers.length; index++) {
      if ((completeRevisionNumbers[index] as number) !== index + 1) return false;
    }
    const validatedResultings = new Set<number>(publicationResultings as number[]);
    for (const entry of completePublications) {
      if (!validatedResultings.has(entry.resultingIdentityVersion as number)) return false;
    }
    // Complete chronological replay enumerates the bounded complete history
    // including future retirements. Future evidence is validated for shape
    // (above), impossible revisions (expectedActive must match the active
    // revision at that point) and lifecycle violations (retire/unretire
    // transitions, no publication while retired). Valid futures are allowed
    // as continuations beyond the current version; the current retired flag
    // is bound at the current version point, preserving legitimate save gaps
    // (expected >= previous) and valid intermediate states with later rows
    // still present.
    for (const event of retirements) {
      replay.push({
        kind: event.operation as 'retire' | 'unretire',
        expected: event.expectedIdentityVersion as number,
        resulting: event.resultingIdentityVersion as number,
        revisionNumber: null,
        expectedActive: event.expectedActiveRevisionNumber as number,
      });
    }
    replay.sort((left, right) => left.resulting - right.resulting || left.expected - right.expected);
    // Duplicate resulting slots fail closed (covers equal-version forgeries).
    const resultingSet = new Set<number>();
    for (const event of replay) {
      if (!Number.isSafeInteger(event.expected) || !Number.isSafeInteger(event.resulting)) return false;
      if (event.resulting !== event.expected + 1) return false;
      if (resultingSet.has(event.resulting)) return false;
      resultingSet.add(event.resulting);
    }
    // Chronological replay with publication/save slot consistency over the
    // complete bounded history including future retirements. Future evidence
    // is validated for malformation (already), impossible revisions
    // (expectedActive must match the active revision at that point) and
    // lifecycle violations (retire/unretire transitions, no publication while
    // retired). The current retired flag is bound at the current version
    // point so valid futures remain allowed continuations; save gaps are
    // preserved via expected >= previous.
    let active: number | null = null;
    let retired = false;
    let previous: number | null = null;
    let nextPublication = 1;
    let currentRetired: boolean | null = null;
    let currentPrevious: number | null = null;
    for (const event of replay) {
      if (previous !== null) {
        if (event.expected < previous) return false;
        if (!(event.resulting > previous)) return false;
      }
      if (event.kind === 'publication') {
        // Publications must appear in strict revision order 1..current and
        // never while retired. Save gaps are allowed via expected >=
        // previous; an earlier-save-slot forgery still fails because the
        // later retire/unretire events no longer match the immediate active
        // revision (see retirement branches below).
        if (retired) return false;
        if (event.revisionNumber !== nextPublication) return false;
        if (event.revisionNumber === 1) {
          if (event.expectedActive !== null) return false;
        } else if (event.expectedActive !== (event.revisionNumber as number) - 1) return false;
        active = event.revisionNumber as number;
        retired = false;
        nextPublication++;
      } else if (event.kind === 'retire') {
        if (retired) return false;
        if (active === null) return false;
        if (event.expectedActive !== active) return false;
        retired = true;
      } else {
        if (!retired) return false;
        if (active === null) return false;
        if (event.expectedActive !== active) return false;
        retired = false;
      }
      previous = event.resulting;
      if (event.resulting <= identityVersion) {
        currentRetired = retired;
        currentPrevious = previous;
      }
    }
    if (nextPublication !== (currentActive as number) + 1) return false;
    if (active !== (currentActive as number)) return false;
    if (currentRetired === null) return false;
    if (currentRetired !== (row.retiredAt != null)) return false;
    if (typeof row.version !== 'number' || !Number.isSafeInteger(row.version)) return false;
    if ((row.version as number) < (publicationResulting as number)) return false;
    if (currentPrevious !== null && (row.version as number) < currentPrevious) return false;
    return true;
  }

  private async isValidUnretireAfterPublication(
    latest: RuntimeRecord,
    row: RuntimeRecord,
    revision: RuntimeRecord,
    publicationHistory: RuntimeRecord,
    authority: RecordDefinitionPublicationAuthoritySnapshot,
    identity: {
      readonly brandId: ReturnType<typeof parseRecordDefinitionBrandId>;
      readonly recordTypeKey: ReturnType<typeof parseRecordDefinitionKey>;
    }
  ): Promise<boolean> {
    const resulting = latest.resultingIdentityVersion;
    const publicationResulting = publicationHistory.resultingIdentityVersion;
    const publicationExpected = publicationHistory.expectedIdentityVersion;
    const expectedActive = latest.expectedActiveRevisionNumber;
    const currentActive = revision.revisionNumber;
    if (typeof resulting !== 'number' || !Number.isSafeInteger(resulting)) return false;
    if (typeof publicationResulting !== 'number' || !Number.isSafeInteger(publicationResulting)) return false;
    if (typeof publicationExpected !== 'number' || !Number.isSafeInteger(publicationExpected)) return false;
    if (publicationExpected + 1 !== publicationResulting) return false;
    if (publicationExpected < resulting) return false;
    if (typeof expectedActive !== 'number' || !Number.isSafeInteger(expectedActive)) return false;
    if (expectedActive < 1 || expectedActive > RECORD_DEFINITION_REVISION_NUMBER_MAX) return false;
    if (typeof currentActive !== 'number' || !Number.isSafeInteger(currentActive)) return false;
    if (!(expectedActive < currentActive)) return false;
    const recordTypeId = row.id;
    if (typeof recordTypeId !== 'string') return false;
    // The later publication itself must be valid historical evidence bound to
    // the current active revision. Missing, malformed, future, wrong-identity
    // or mismatched publication history fails closed.
    if (!this.isValidPublicationEvidence(publicationHistory, row, revision)) return false;
    // The referenced active revision must be valid historical evidence, not
    // merely an existing row. Missing or malformed history fails closed.
    let prior: RuntimeRecord | null = null;
    try {
      const stored = await this.readHistory({ recordType: recordTypeId, revisionNumber: expectedActive });
      if (!stored) return false;
      prior = historyRow(stored, '$');
    } catch {
      return false;
    }
    const priorRevision = await this.readRevisionAt(recordTypeId, expectedActive);
    if (!priorRevision) return false;
    if (!(await this.isValidPriorRevision(priorRevision, row, expectedActive as number, prior, authority, identity)))
      return false;
    if (prior.revision !== priorRevision.id) return false;
    if (prior.canonicalHash !== priorRevision.canonicalHash) return false;
    if (!this.isValidPublicationEvidence(prior, row, priorRevision)) return false;
    const priorResulting = prior.resultingIdentityVersion;
    if (typeof priorResulting !== 'number' || !Number.isSafeInteger(priorResulting)) return false;
    // The referenced active revision must have been published before the
    // unretire event.
    if (priorResulting > resulting) return false;
    // The referenced revision must actually have been active at the unretire
    // event identity/version: every successor revision up to the current
    // publication must be present, bounded, schema-valid, fully
    // contract-valid history tied to its revision, published after the
    // unretire and before the current publication. A forged older revision
    // (for example 1 instead of 3) is superseded by its successor published
    // before the unretire and fails closed. Missing, malformed, future,
    // wrong or mismatched intermediate evidence fails closed.
    if (
      typeof currentActive !== 'number' ||
      !Number.isSafeInteger(currentActive) ||
      currentActive < 1 ||
      currentActive > RECORD_DEFINITION_REVISION_NUMBER_MAX
    )
      return false;
    const versionGap = (publicationResulting as number) - (resulting as number);
    if (!Number.isSafeInteger(versionGap) || versionGap < 0) return false;
    if (currentActive - (expectedActive as number) - 1 > versionGap) return false;
    let floor = resulting as number;
    for (
      let revisionNumber = (expectedActive as number) + 1;
      revisionNumber < (currentActive as number);
      revisionNumber++
    ) {
      let successor: RuntimeRecord;
      try {
        const stored = await this.readHistory({ recordType: recordTypeId, revisionNumber });
        if (!stored) return false;
        successor = historyRow(stored, '$');
      } catch {
        return false;
      }
      const successorRevision = await this.readRevisionAt(recordTypeId, revisionNumber);
      if (!successorRevision) return false;
      if (!(await this.isValidPriorRevision(successorRevision, row, revisionNumber, successor, authority, identity)))
        return false;
      if (successor.revision !== successorRevision.id) return false;
      if (successor.canonicalHash !== successorRevision.canonicalHash) return false;
      if (!this.isValidPublicationEvidence(successor, row, successorRevision)) return false;
      const successorExpected = successor.expectedIdentityVersion;
      const successorResulting = successor.resultingIdentityVersion;
      if (typeof successorExpected !== 'number' || !Number.isSafeInteger(successorExpected)) return false;
      if (typeof successorResulting !== 'number' || !Number.isSafeInteger(successorResulting)) return false;
      if (successorExpected < floor) return false;
      if (successorResulting !== successorExpected + 1) return false;
      if (!(successorResulting > floor)) return false;
      if (!(successorResulting < (publicationResulting as number))) return false;
      if (!(successorExpected < (publicationExpected as number))) return false;
      floor = successorResulting;
    }
    if ((publicationExpected as number) < floor) return false;
    if (!((publicationResulting as number) > floor)) return false;
    return true;
  }

  private async isValidPublicationChain(
    row: RuntimeRecord,
    revision: RuntimeRecord,
    publicationHistory: RuntimeRecord,
    authority: RecordDefinitionPublicationAuthoritySnapshot,
    identity: {
      readonly brandId: ReturnType<typeof parseRecordDefinitionBrandId>;
      readonly recordTypeKey: ReturnType<typeof parseRecordDefinitionKey>;
    }
  ): Promise<boolean> {
    return this.validateCompleteLifecycle(row, revision, publicationHistory, authority, identity);
  }

  private async checkRetirementEvent(
    latest: RuntimeRecord,
    row: RuntimeRecord,
    revision: RuntimeRecord,
    parsed: { data: { definition: RuntimeValue } },
    path: string,
    requireCurrentVersion: boolean,
    publicationHistory: RuntimeRecord | null,
    authority: RecordDefinitionPublicationAuthoritySnapshot,
    identity: {
      readonly brandId: ReturnType<typeof parseRecordDefinitionBrandId>;
      readonly recordTypeKey: ReturnType<typeof parseRecordDefinitionKey>;
    }
  ): Promise<void> {
    const retired = row.retiredAt != null;
    const resulting = latest.resultingIdentityVersion;
    const expected = latest.expectedIdentityVersion;
    let versionMatches = false;
    let expectedActiveMatches = false;
    if (requireCurrentVersion) {
      versionMatches = resulting === row.version && expected === (row.version as number) - 1;
      expectedActiveMatches = latest.expectedActiveRevisionNumber === revision.revisionNumber;
    } else {
      const publicationResulting = publicationHistory === null ? null : publicationHistory.resultingIdentityVersion;
      const baseVersionOk =
        typeof resulting === 'number' &&
        Number.isSafeInteger(resulting) &&
        typeof expected === 'number' &&
        expected === resulting - 1 &&
        typeof row.version === 'number' &&
        Number.isSafeInteger(row.version) &&
        (row.version as number) > resulting &&
        typeof publicationResulting === 'number' &&
        Number.isSafeInteger(publicationResulting) &&
        (publicationResulting as number) <= (row.version as number) &&
        (publicationResulting as number) !== resulting &&
        resulting <= (row.version as number);
      if (!baseVersionOk) {
        versionMatches = false;
        expectedActiveMatches = false;
      } else if (retired) {
        // A retired identity cannot publish after retirement: the durable
        // retire event must follow the latest publication.
        versionMatches =
          (resulting as number) > (publicationResulting as number) &&
          (publicationHistory === null ||
            (typeof publicationHistory.expectedIdentityVersion === 'number' &&
              (publicationHistory.expectedIdentityVersion as number) < (resulting as number)));
        expectedActiveMatches = latest.expectedActiveRevisionNumber === revision.revisionNumber;
      } else if ((resulting as number) > (publicationResulting as number)) {
        versionMatches = true;
        expectedActiveMatches = latest.expectedActiveRevisionNumber === revision.revisionNumber;
      } else if (publicationHistory !== null) {
        // An unretire event before a later publication/rollback keeps its own
        // version/publication context: the later publication follows the
        // unretire and the referenced active revision predates it.
        versionMatches =
          typeof publicationHistory.expectedIdentityVersion === 'number' &&
          Number.isSafeInteger(publicationHistory.expectedIdentityVersion) &&
          (publicationHistory.expectedIdentityVersion as number) >= (resulting as number);
        expectedActiveMatches = await this.isValidUnretireAfterPublication(
          latest,
          row,
          revision,
          publicationHistory,
          authority,
          identity
        );
      }
    }
    // Extend the lifecycle proof so every managed active identity validates
    // the complete publication chain and all retirement events/order
    // relationships, including never-retired and equal-version paths. Every
    // publication 1..current must be present, bounded, schema-valid, fully
    // definition-semantically valid under the current authority,
    // manifest/payload-agreeing, hash/history-bound and ordered, with no
    // duplicate resulting slots across publications and retirements.
    if (versionMatches && expectedActiveMatches) {
      if (publicationHistory !== null) {
        if (!(await this.isValidPublicationChain(row, revision, publicationHistory, authority, identity)))
          versionMatches = false;
      } else if (requireCurrentVersion) {
        versionMatches = false;
      }
    }
    if (
      latest.schemaVersion !== 1 ||
      latest.branding !== row.branding ||
      latest.recordType !== row.id ||
      latest.recordTypeId !== row.definitionId ||
      latest.recordTypeKey !== row.name ||
      !versionMatches ||
      latest.operation !== (retired ? 'retire' : 'unretire') ||
      latest.revision != null ||
      latest.revisionNumber != null ||
      latest.canonicalHash != null ||
      latest.expectedDraftVersion !== null ||
      latest.validation != null ||
      latest.impact != null ||
      !expectedActiveMatches ||
      latest.source != null ||
      !isValidStrictActor(latest.actor) ||
      typeof latest.operationId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(latest.operationId) ||
      latest.id !== `rdh_${latest.operationId.replace(/-/g, '')}` ||
      !recordDefinitionRevisionSchema.safeParse({
        ...(parsed.data as RuntimeRecord),
        publishedAt: timestamp(latest.occurredAt),
        publishedBy: latest.actor,
        ...(latest.note == null || latest.note === '' ? {} : { publicationNote: latest.note }),
      }).success ||
      (retired &&
        (Date.parse(timestamp(row.retiredAt)) !== Date.parse(timestamp(latest.occurredAt)) ||
          !isDeepStrictEqual(row.retiredBy, latest.actor) ||
          (row.retirementReason ?? '') !== (latest.note ?? ''))) ||
      !isDeepStrictEqual(latest.changes, [{ path: '/retirement', kind: retired ? 'added' : 'removed' }]) ||
      !isDeepStrictEqual(latest.redactions, []) ||
      latest.truncated !== false
    )
      return fail(path, requireCurrentVersion ? 'invalid-identity-history' : 'invalid-identity-history');
  }

  private async validateActive(row: RuntimeRecord, revision: RuntimeRecord, path: string): Promise<boolean> {
    if (
      row.schemaVersion !== 1 ||
      typeof row.version !== 'number' ||
      !Number.isSafeInteger(row.version) ||
      row.version < 1 ||
      row.version > RECORD_DEFINITION_REVISION_NUMBER_MAX ||
      row.activeRevisionNumber !== revision.revisionNumber ||
      row.activeRevisionId !== revision.id ||
      revision.recordType !== row.id ||
      revision.branding !== row.branding ||
      revision.recordTypeId !== row.definitionId ||
      revision.recordTypeKey !== row.name
    )
      return fail(path, 'invalid-active-pointer');
    const parsed = recordDefinitionRevisionSchema.safeParse(revisionPayload(revision));
    if (
      !parsed.success ||
      hashRecordDefinition(parsed.data.definition) !== parsed.data.canonicalHash ||
      !isDeepStrictEqual(revision.createdBy, revision.publishedBy)
    )
      return fail(path, 'invalid-active-revision');
    const identity = { brandId: parsed.data.brandId, recordTypeKey: parsed.data.recordTypeKey };
    const definition = { ...parsed.data.definition, definitionState: 'draft-incomplete' as const };
    const authority = await this.authority.load({ ...identity, definition, activeDefinition: null });
    this.validateAuthoritySnapshot(authority as RuntimeValue, path);
    const publication = validateRecordDefinitionForPublication({
      ...authority,
      ...identity,
      definition,
      activeDefinition: null,
      draftVersion: 0,
      activeRevisionNumber: null,
      administrativeRole: 'Admin',
    });
    if (
      !publication.ok ||
      !isDeepStrictEqual(canonicalizeRecordDefinition(parsed.data.definition), parsed.data.definition) ||
      !isDeepStrictEqual(publication.actionContracts, parsed.data.actionContracts)
    )
      return fail(path, 'invalid-active-payload');
    const source = parsed.data.source;
    if (
      (source.sourceRevisionNumber !== null && source.sourceRevisionNumber >= parsed.data.revisionNumber) ||
      (['bootstrap', 'migration'].includes(source.operation) &&
        (parsed.data.revisionNumber !== 1 || source.sourceRevisionNumber !== null)) ||
      (source.operation === 'publish' &&
        source.sourceRevisionNumber !== (parsed.data.revisionNumber === 1 ? null : parsed.data.revisionNumber - 1)) ||
      (source.operation === 'rollback' &&
        (source.sourceRevisionNumber === null ||
          !Number.isSafeInteger(source.sourceRevisionNumber) ||
          source.sourceRevisionNumber < 1 ||
          source.sourceRevisionNumber >= parsed.data.revisionNumber)) ||
      (source.operation === 'migration' && !isDeepStrictEqual(parsed.data.publishedBy, ACTOR))
    )
      return fail(path, 'invalid-active-provenance');
    const stored = await this.readHistory({ recordType: row.id, revision: revision.id, operation: source.operation });
    if (!stored) return fail(path, 'missing-active-history');
    const history = historyRow(stored, path);
    if (typeof history.id !== 'string' || !/^rdh_[a-f0-9]{32}$/.test(history.id))
      return fail(path, 'invalid-active-history');
    if (
      ['publish', 'rollback'].includes(source.operation) &&
      (typeof history.operationId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(history.operationId) ||
        history.id !== `rdh_${history.operationId.replace(/-/g, '')}` ||
        (source.operation === 'publish' && typeof history.expectedDraftVersion !== 'number') ||
        (source.operation === 'rollback' && history.expectedDraftVersion !== null))
    )
      return fail(path, 'invalid-active-provenance');
    if (source.operation === 'migration') {
      const expectedNote = JSON.stringify({
        migration: RECORD_DEFINITION_MIGRATION_NAME,
        workflowSteps: parsed.data.definition.stages.length,
        warnings: [
          'legacy-stage-stopping-preserved',
          'manual-transitions-require-source-edit-role',
          'labels-use-persisted-key',
        ],
      });
      if (history.note !== expectedNote) return fail(path, 'invalid-active-provenance');
    } else if ((history.note ?? '') !== (revision.publicationNote ?? ''))
      return fail(path, 'invalid-active-provenance');
    if (
      source.operation === 'bootstrap' &&
      (parsed.data.publishedBy.id !== 'bootstrap' ||
        typeof parsed.data.publishedBy.displayName !== 'string' ||
        !/^Seed version [1-9][0-9]{0,15}$/.test(parsed.data.publishedBy.displayName))
    )
      return fail(path, 'invalid-active-provenance');
    const validation = recordDefinitionValidationReportSchema.safeParse(history.validation);
    const impact = recordDefinitionImpactReportSchema.safeParse(history.impact);
    if (
      !validation.success ||
      !impact.success ||
      validation.data.brandId !== row.branding ||
      validation.data.recordTypeKey !== row.name ||
      impact.data.brandId !== row.branding ||
      impact.data.recordTypeKey !== row.name ||
      validation.data.scope !==
        (source.operation === 'migration'
          ? 'migration'
          : source.operation === 'rollback'
            ? 'rollback'
            : 'publication') ||
      validation.data.validatedActiveRevisionNumber !== history.expectedActiveRevisionNumber ||
      (source.operation === 'rollback'
        ? history.expectedDraftVersion !== null || validation.data.validatedDraftVersion !== impact.data.draftVersion
        : validation.data.validatedDraftVersion !== (history.expectedDraftVersion ?? 0)) ||
      impact.data.activeRevisionNumber !== history.expectedActiveRevisionNumber ||
      (source.operation === 'rollback'
        ? history.expectedDraftVersion !== null
        : impact.data.draftVersion !== (history.expectedDraftVersion ?? 0)) ||
      validation.data.status !== 'valid' ||
      impact.data.status === 'blocked' ||
      history.recordType !== row.id ||
      history.revision !== revision.id ||
      history.operation !== source.operation ||
      history.expectedActiveRevisionNumber !==
        (parsed.data.revisionNumber === 1 ? null : parsed.data.revisionNumber - 1) ||
      (history.expectedDraftVersion !== null &&
        (typeof history.expectedDraftVersion !== 'number' ||
          !Number.isSafeInteger(history.expectedDraftVersion) ||
          history.expectedDraftVersion < 0 ||
          history.expectedDraftVersion > RECORD_DEFINITION_REVISION_NUMBER_MAX)) ||
      (['bootstrap', 'migration'].includes(source.operation) &&
        (history.expectedIdentityVersion !== 0 ||
          history.expectedDraftVersion !== null ||
          history.operationId !== history.id ||
          history.id !== `rdh_${String(row.definitionId).slice(4)}`)) ||
      !isDeepStrictEqual(history.changes, impact.data.changes) ||
      history.schemaVersion !== 1 ||
      history.branding !== row.branding ||
      history.recordTypeId !== row.definitionId ||
      history.recordTypeKey !== row.name ||
      history.revisionNumber !== revision.revisionNumber ||
      history.canonicalHash !== revision.canonicalHash ||
      !isDeepStrictEqual(history.source, revision.source) ||
      !isDeepStrictEqual(history.actor, revision.publishedBy) ||
      Date.parse(timestamp(history.occurredAt)) !== Date.parse(timestamp(revision.publishedAt)) ||
      typeof history.expectedIdentityVersion !== 'number' ||
      !Number.isSafeInteger(history.expectedIdentityVersion) ||
      history.expectedIdentityVersion < 0 ||
      history.resultingIdentityVersion !== history.expectedIdentityVersion + 1 ||
      typeof history.resultingIdentityVersion !== 'number' ||
      history.resultingIdentityVersion > row.version ||
      typeof history.operationId !== 'string' ||
      !history.operationId.length ||
      history.operationId.length > 256 ||
      !recordDefinitionHistorySummarySchema.safeParse({
        schemaVersion: history.schemaVersion,
        id: history.id,
        brandId: history.branding,
        recordTypeKey: history.recordTypeKey,
        revision: { id: revision.id, revisionNumber: revision.revisionNumber, canonicalHash: revision.canonicalHash },
        source: history.source,
        publishedAt: timestamp(history.occurredAt),
        publishedBy: history.actor,
        ...(history.note == null || history.note === '' ? {} : { publicationNote: history.note }),
        validation: {
          status: validation.data.status,
          errorCount: validation.data.issues.filter(issue => issue.severity === 'error').length,
          warningCount: validation.data.issues.filter(issue => issue.severity === 'warning').length,
        },
        impact: { status: impact.data.status, affectedRecordCount: impact.data.affectedRecordCount },
        changes: history.changes,
        redactions: history.redactions,
        truncated: history.truncated,
      }).success
    )
      return fail(path, 'invalid-active-history');
    if (
      row.retiredAt == null &&
      (row.retiredBy != null || (row.retirementReason != null && row.retirementReason !== ''))
    )
      return fail(path, 'invalid-retirement');
    if (history.resultingIdentityVersion !== row.version) {
      const latestStored = await this.readHistory({ recordType: row.id, resultingIdentityVersion: row.version });
      // Draft saves/discards and secret edits advance identity versions without publication history.
      // Their quiescent state and current draft are checked separately.
      if (latestStored) {
        await this.checkRetirementEvent(
          historyRow(latestStored, path),
          row,
          revision,
          parsed,
          path,
          true,
          history,
          authority,
          identity
        );
      } else {
        // Draft saves/discards and secret edits advance identity.version
        // without publication history. Both retired and unretired identities
        // must validate the latest durable retire/unretire event at or before
        // the current version across the gap: a cleared retirement without an
        // unretire event, or a malformed retirement event, fails closed. Future
        // retirement evidence beyond identity.version is excluded from the
        // current binding but validated as a continuation in the complete
        // replay. A never-retired identity must still prove the complete
        // publication chain 1..current with full prior semantic validation;
        // deleting an intermediate history fails closed. A retired identity
        // without any retirement event at or before the current version is
        // missing history.
        const currentRetirement = await this.readLatestRetirementAtOrBefore(String(row.id), row, row.version as number);
        if (currentRetirement === null) {
          const allRetirements = await this.collectRetirementEvents(row);
          if (allRetirements === null) return fail(path, 'invalid-identity-history');
          if (allRetirements.length === 0) {
            if (row.retiredAt != null) return fail(path, 'missing-identity-history');
            if (!(await this.validateCompleteLifecycle(row, revision, history, authority, identity)))
              return fail(path, 'invalid-identity-history');
            return source.operation === 'migration';
          }
          // Only future retirements exist beyond the current version. The
          // current binding is never-retired, but the complete replay still
          // validates the future continuation for impossible revisions and
          // lifecycle-state violations.
          if (row.retiredAt != null) return fail(path, 'missing-identity-history');
          if (!(await this.validateCompleteLifecycle(row, revision, history, authority, identity)))
            return fail(path, 'invalid-identity-history');
          return source.operation === 'migration';
        }
        // A retired identity may legitimately save drafts after retirement, advancing
        // identity.version without creating retirement history. Locate the applicable
        // retirement event at or before the current version and validate it
        // while allowing the subsequent gap. The same lookup covers unretired
        // identities: the latest event at or before the current version must
        // be a valid unretire when retirement history exists at or before it.
        // Future evidence is validated separately in the complete replay.
        await this.checkRetirementEvent(
          currentRetirement,
          row,
          revision,
          parsed,
          path,
          false,
          history,
          authority,
          identity
        );
      }
    } else {
      if (row.retiredAt != null) return fail(path, 'invalid-retirement');
      // Immediate-post-publication boundary: identity.version equals the
      // current publication resulting version, so no draft-save gap exists.
      // Every managed active identity validates the complete publication
      // chain and all retirement events/order relationships, including
      // never-retired and equal-version paths. A never-retired identity must
      // still prove every publication 1..current; any durable retire/unretire
      // event must be a valid unretire ordered against the current
      // publication with every intermediate successor present, bounded,
      // schema-valid, fully definition-semantically valid under the current
      // authority, manifest/payload-agreeing, hash/history-bound and ordered.
      // A cleared retirement without an unretire event fails closed. Future
      // retirement evidence beyond the current version is excluded from the
      // current binding but validated as a continuation in the complete replay.
      const currentRetirement = await this.readLatestRetirementAtOrBefore(String(row.id), row, row.version as number);
      if (currentRetirement === null) {
        const allRetirements = await this.collectRetirementEvents(row);
        if (allRetirements === null) return fail(path, 'invalid-identity-history');
        if (allRetirements.length > 0) {
          if (!(await this.validateCompleteLifecycle(row, revision, history, authority, identity)))
            return fail(path, 'invalid-identity-history');
        } else if (!(await this.validateCompleteLifecycle(row, revision, history, authority, identity))) {
          return fail(path, 'invalid-identity-history');
        }
      } else {
        await this.checkRetirementEvent(
          currentRetirement,
          row,
          revision,
          parsed,
          path,
          false,
          history,
          authority,
          identity
        );
      }
    }
    if (
      row.retiredAt == null &&
      (row.retiredBy != null || (row.retirementReason != null && row.retirementReason !== ''))
    )
      return fail(path, 'invalid-retirement');
    return source.operation === 'migration';
  }

  private async persist({ original, transformed, publication }: PreparedMigration, readOnly = false): Promise<void> {
    const definitionId = deriveRecordDefinitionId(transformed);
    const revisionId = deriveRecordDefinitionRevisionId(transformed, 1);
    const historyId = `rdh_${definitionId.slice(4)}`;
    const operationId = historyId;
    const proposed: RecordDefinitionRevisionAttributes = {
      id: revisionId,
      schemaVersion: 1,
      branding: transformed.brandId,
      recordType: transformed.recordTypeId,
      recordTypeId: definitionId,
      recordTypeKey: parseRecordDefinitionKey(transformed.recordTypeKey),
      revisionNumber: 1,
      canonicalHash: publication.canonicalHash,
      definition: publication.definition,
      actionContracts: publication.actionContracts,
      source: SOURCE,
      publishedAt: new Date().toISOString(),
      publishedBy: ACTOR,
      createdBy: ACTOR,
    };
    let revision = await this.readRevision(revisionId);
    const occupied = this.reader.revisionAt
      ? await this.reader.revisionAt(transformed.recordTypeId, 1)
      : await RecordDefinitionRevision.findOne({ recordType: transformed.recordTypeId, revisionNumber: 1 }).meta(
          READ_META
        );
    if (occupied && dataRow(occupied as object as RuntimeRecord, '$.revision').id !== revisionId)
      return fail('$', 'conflicting-migration-revision');
    const historySlot = await this.readHistory({ recordType: transformed.recordTypeId, resultingIdentityVersion: 1 });
    if (historySlot && historyRow(historySlot, '$.history').id !== historyId)
      return fail('$', 'conflicting-migration-history');
    const operationSlot = await this.readHistory({ operationId });
    if (operationSlot && historyRow(operationSlot, '$.history').id !== historyId)
      return fail('$', 'conflicting-migration-history');
    if (!revision && !readOnly) {
      try {
        revision = await RecordDefinitionRevision.create(structuredClone(proposed)).fetch();
      } catch {
        revision = await RecordDefinitionRevision.findOne({ id: revisionId }).meta(READ_META);
      }
    }
    if (!revision && !readOnly) return fail('$', 'revision-write-unconfirmed');
    revision = revision
      ? (dataRow(revision as object as RuntimeRecord, '$.revision') as object as RecordDefinitionRevisionAttributes)
      : proposed;
    for (const key of [
      'id',
      'schemaVersion',
      'branding',
      'recordType',
      'recordTypeId',
      'recordTypeKey',
      'revisionNumber',
      'canonicalHash',
      'definition',
      'actionContracts',
      'source',
      'publishedBy',
      'createdBy',
    ] as const) {
      if (!isDeepStrictEqual(revision[key], proposed[key]))
        return fail(`$.revision.${key}`, 'conflicting-migration-revision');
    }
    if (
      !recordDefinitionRevisionSchema.safeParse(revisionPayload(revision as object as RuntimeRecord)).success ||
      (revision.publicationNote != null && revision.publicationNote !== '')
    )
      return fail('$', 'invalid-migration-revision');
    const history: RecordDefinitionHistoryAttributes = {
      id: historyId,
      schemaVersion: 1,
      branding: transformed.brandId,
      recordType: transformed.recordTypeId,
      recordTypeId: definitionId,
      recordTypeKey: parseRecordDefinitionKey(transformed.recordTypeKey),
      operation: 'migration',
      operationId,
      expectedIdentityVersion: 0,
      resultingIdentityVersion: 1,
      expectedDraftVersion: null,
      expectedActiveRevisionNumber: null,
      revision: revisionId,
      revisionNumber: 1,
      canonicalHash: publication.canonicalHash,
      source: SOURCE,
      occurredAt: revision.publishedAt,
      actor: ACTOR,
      validation: { ...publication.report, scope: 'migration' },
      impact: publication.impact,
      changes: publication.impact.changes,
      redactions: [],
      truncated: false,
      note: JSON.stringify({
        migration: RECORD_DEFINITION_MIGRATION_NAME,
        workflowSteps: transformed.workflowStepCount,
        warnings: transformed.warnings,
      }),
    };
    let stored = await this.readHistory({ id: historyId });
    if (!stored && !readOnly) {
      try {
        stored = await RecordDefinitionHistory.create(structuredClone(history)).fetch();
      } catch {
        stored = await RecordDefinitionHistory.findOne({ id: historyId }).meta(READ_META);
      }
    }
    if (!stored && readOnly) return;
    if (!stored) return fail('$', 'history-write-unconfirmed');
    stored = historyRow(stored, '$.history') as object as RecordDefinitionHistoryAttributes;
    for (const key of Object.keys(history) as (keyof RecordDefinitionHistoryAttributes)[]) {
      if (key === 'occurredAt') {
        if (Date.parse(timestamp(stored.occurredAt)) !== Date.parse(timestamp(history.occurredAt)))
          return fail('$', 'conflicting-migration-history');
      } else if (!isDeepStrictEqual(stored[key], history[key])) return fail('$', 'conflicting-migration-history');
    }
    if (readOnly) return;
    if (original.activeRevisionId === revisionId && original.activeRevisionNumber === 1 && original.version === 1)
      return;
    const manager = RecordType.getDatastore().manager as object as MigrationMongoManager;
    if (!manager || typeof manager.collection !== 'function') return fail('$', 'native-mongo-required');
    const collection = manager.collection('recordtype');
    if (!collection || typeof collection.updateOne !== 'function') return fail('$', 'native-mongo-required');
    try {
      await collection.updateOne(
        {
          key: `${transformed.brandId}_${transformed.recordTypeKey}`,
          name: transformed.recordTypeKey,
          activeRevisionId: null,
          activeRevisionNumber: null,
          draftId: null,
          draftLifecycleToken: null,
          definitionLifecycleToken: null,
          recordCreationToken: null,
          secretMutationToken: null,
          retiredAt: null,
          $or: [{ version: 0 }, { version: null }],
        },
        { $set: { definitionId, schemaVersion: 1, version: 1, activeRevisionId: revisionId, activeRevisionNumber: 1 } }
      );
    } catch {
      /* Confirm even after an ambiguous driver acknowledgement. */
    }
    const activatedRow = await RecordType.findOne({ id: transformed.recordTypeId }).meta(READ_META);
    const activated = activatedRow ? dataRow(activatedRow as object as RuntimeRecord, '$.identity') : null;
    if (
      !activated ||
      activated.activeRevisionId !== revisionId ||
      activated.activeRevisionNumber !== 1 ||
      activated.version !== 1 ||
      activated.definitionId !== definitionId ||
      activated.branding !== transformed.brandId
    )
      return fail('$', 'activation-unconfirmed');
  }
}
