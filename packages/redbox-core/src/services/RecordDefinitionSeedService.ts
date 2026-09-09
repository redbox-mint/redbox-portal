import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { isProxy } from 'node:util/types';
import {
  RECORD_DEFINITION_REFERENCE_MAX_LENGTH,
  RECORD_DEFINITION_REFERENCE_PATTERN,
  parseRecordDefinitionBrandId,
  parseRecordDefinitionKey,
  type PublishableRecordDefinitionAggregateDto,
  type RecordDefinitionBrandId,
  type RecordDefinitionKey,
} from '@researchdatabox/sails-ng-common';
import { boundedValidationPreflight } from '../boundedValidation';
import { Services as services } from '../CoreService';
import { isRuntimeArray, isRuntimeRecord, type RuntimeValue } from '../runtimeValues';
import {
  deriveRecordDefinitionId,
  deriveRecordDefinitionRevisionId,
  publishableRecordDefinitionAggregateSchema,
  validateRecordDefinitionForPublication,
  type ValidatedRecordDefinitionPublication,
} from '../record-workflow-administration';
import type { RecordDefinitionRevisionAttributes } from '../waterline-models/RecordDefinitionRevision';
import type { RecordDefinitionHistoryAttributes } from '../waterline-models/RecordDefinitionHistory';
import {
  DefaultRecordDefinitionPublicationAuthority,
  type RecordDefinitionPublicationAuthority,
} from './RecordDefinitionPublicationService';

/** Deployment data, never an administrative mutation request. Versions do not authorize updates. */
export interface RecordDefinitionSeed {
  readonly brandId: string;
  readonly recordTypeKey: string;
  readonly seedVersion: number;
  readonly packageType: string;
  readonly searchCore: string;
  readonly definition: PublishableRecordDefinitionAggregateDto;
}

export interface RecordDefinitionSeedManifest {
  readonly schemaVersion: 1;
  readonly seeds: readonly RecordDefinitionSeed[];
}

export interface RecordDefinitionSeedOutcome {
  readonly brandId: string;
  readonly recordTypeKey: string;
  readonly seedVersion: number;
  readonly status: 'created' | 'skipped';
}

export interface RecordDefinitionSeedReport {
  readonly created: number;
  readonly skipped: number;
  readonly outcomes: readonly RecordDefinitionSeedOutcome[];
}

export interface RecordDefinitionSeedServiceExports {
  seed(manifest: RecordDefinitionSeedManifest): Promise<RecordDefinitionSeedReport>;
}

interface ParsedSeed extends RecordDefinitionSeed {
  readonly brandId: RecordDefinitionBrandId;
  readonly recordTypeKey: RecordDefinitionKey;
}

interface ValidatedSeed {
  readonly seed: ParsedSeed;
  readonly publication: ValidatedRecordDefinitionPublication;
}

function invalidSeed(): never {
  throw new Error('Invalid record-definition seed manifest. No definitions were written.');
}

/** Preflight bounds the graph first; this stricter boundary rejects non-JSON own properties. */
function isSeedData(value: RuntimeValue): boolean {
  const pending: RuntimeValue[] = [value];
  const visited = new WeakSet<object>();
  while (pending.length > 0) {
    const item = pending.pop();
    if (item === null || typeof item === 'string' || typeof item === 'boolean') continue;
    if (typeof item === 'number' && Number.isFinite(item)) continue;
    if (typeof item !== 'object' || isProxy(item)) return false;
    if (visited.has(item)) continue;
    visited.add(item);
    const array = isRuntimeArray(item);
    for (const key of Reflect.ownKeys(item)) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string') return false;
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return false;
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= item.length)) return false;
      pending.push(descriptor.value);
    }
  }
  return true;
}

function seedTimestamp(value: string | Date): number {
  return value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN;
}

function parseManifest(value: RuntimeValue): readonly ParsedSeed[] {
  // Reject proxies, accessors, cycles and oversized input before reading or cloning data.
  if (
    !boundedValidationPreflight(value, {
      maxBytes: 8_000_000,
      maxDepth: 64,
      maxStringLength: 100_000,
      maxPropertyNameLength: 256,
      maxWork: 500_000,
      arrayCardinalityLimit: () => 4096,
      objectCardinalityLimit: () => 4096,
    }).ok ||
    !isSeedData(value) ||
    !isRuntimeRecord(value) ||
    value.schemaVersion !== 1 ||
    Object.keys(value).some(key => !['schemaVersion', 'seeds'].includes(key)) ||
    !isRuntimeArray(value.seeds) ||
    value.seeds.length > 256
  )
    return invalidSeed();
  const identities = new Set<string>();
  const parsed: ParsedSeed[] = [];
  for (let index = 0; index < value.seeds.length; index += 1) {
    const entry = value.seeds[index];
    if (
      !isRuntimeRecord(entry) ||
      Object.keys(entry).length !== 6 ||
      Object.keys(entry).some(
        key => !['brandId', 'recordTypeKey', 'seedVersion', 'packageType', 'searchCore', 'definition'].includes(key)
      ) ||
      typeof entry.brandId !== 'string' ||
      typeof entry.recordTypeKey !== 'string' ||
      typeof entry.packageType !== 'string' ||
      entry.packageType.length > RECORD_DEFINITION_REFERENCE_MAX_LENGTH ||
      !RECORD_DEFINITION_REFERENCE_PATTERN.test(entry.packageType) ||
      typeof entry.searchCore !== 'string' ||
      entry.searchCore.length > RECORD_DEFINITION_REFERENCE_MAX_LENGTH ||
      !RECORD_DEFINITION_REFERENCE_PATTERN.test(entry.searchCore) ||
      typeof entry.seedVersion !== 'number' ||
      !Number.isSafeInteger(entry.seedVersion) ||
      entry.seedVersion < 1
    ) {
      return invalidSeed();
    }
    const definition = publishableRecordDefinitionAggregateSchema.safeParse(entry.definition);
    if (!definition.success) return invalidSeed();
    let brandId: RecordDefinitionBrandId;
    let recordTypeKey: RecordDefinitionKey;
    try {
      brandId = parseRecordDefinitionBrandId(entry.brandId);
      recordTypeKey = parseRecordDefinitionKey(entry.recordTypeKey);
    } catch {
      return invalidSeed();
    }
    const identity = deriveRecordDefinitionId({ brandId, recordTypeKey });
    if (identities.has(identity)) return invalidSeed();
    identities.add(identity);
    parsed.push({
      brandId,
      recordTypeKey,
      seedVersion: entry.seedVersion,
      packageType: entry.packageType,
      searchCore: entry.searchCore,
      definition: definition.data,
    });
  }
  return parsed;
}

/** Immutable artifacts precede the unique identity insert; there are no updates or deletes. */
export namespace Services {
  export class RecordDefinitionSeed extends services.Core.Service implements RecordDefinitionSeedServiceExports {
    protected override _exportedMethods: string[] = ['seed'];

    constructor(
      private readonly authority: RecordDefinitionPublicationAuthority = new DefaultRecordDefinitionPublicationAuthority()
    ) {
      super();
    }

    public async seed(manifest: RecordDefinitionSeedManifest): Promise<RecordDefinitionSeedReport> {
      const seeds = parseManifest(manifest);
      const validated: ValidatedSeed[] = [];
      // Validate the complete batch before the first persistence operation, including skipped entries.
      for (const seed of seeds) {
        const authority = await this.authority.load({
          ...seed,
          definition: { ...seed.definition, definitionState: 'draft-incomplete' },
          activeDefinition: null,
        });
        const publication = validateRecordDefinitionForPublication({
          ...authority,
          ...seed,
          definition: { ...seed.definition, definitionState: 'draft-incomplete' },
          draftVersion: 0,
          activeRevisionNumber: null,
          administrativeRole: 'Admin',
          activeDefinition: null,
          availableRecordTypeKeys: [
            ...new Set([
              ...authority.availableRecordTypeKeys,
              ...seeds
                .filter(candidate => candidate.brandId === seed.brandId)
                .map(candidate => candidate.recordTypeKey),
            ]),
          ],
        });
        if (!publication.ok) return invalidSeed();
        validated.push({ seed, publication });
      }
      const outcomes: RecordDefinitionSeedOutcome[] = [];
      for (const entry of validated) {
        const status = await this.createMissing(entry);
        const { brandId, recordTypeKey, seedVersion } = entry.seed;
        const outcome = { brandId, recordTypeKey, seedVersion, status };
        outcomes.push(outcome);
        this.logger.info('Record-definition seed', outcome);
      }
      return {
        created: outcomes.filter(outcome => outcome.status === 'created').length,
        skipped: outcomes.filter(outcome => outcome.status === 'skipped').length,
        outcomes,
      };
    }

    private async createMissing({ seed, publication }: ValidatedSeed): Promise<'created' | 'skipped'> {
      const criteria = { branding: seed.brandId, name: seed.recordTypeKey };
      if (await RecordType.findOne(criteria)) return 'skipped';
      const definitionId = deriveRecordDefinitionId(seed);
      // Stable Mongo-compatible primary key lets interrupted attempts reuse their immutable artifacts.
      const id = createHash('sha256').update(`record-definition-seed:${definitionId}`).digest('hex').slice(0, 24);
      const revisionId = deriveRecordDefinitionRevisionId(seed, 1);
      const actor = { id: 'bootstrap', displayName: `Seed version ${seed.seedVersion}` };
      const source = { operation: 'bootstrap' as const, sourceRevisionNumber: null };
      const proposed: RecordDefinitionRevisionAttributes = {
        id: revisionId,
        schemaVersion: 1,
        branding: seed.brandId,
        recordType: id,
        recordTypeId: definitionId,
        recordTypeKey: seed.recordTypeKey,
        revisionNumber: 1,
        canonicalHash: publication.canonicalHash,
        definition: publication.definition,
        actionContracts: publication.actionContracts,
        source,
        publishedAt: new Date().toISOString(),
        publishedBy: actor,
        createdBy: actor,
      };
      let revision = await RecordDefinitionRevision.findOne({ id: revisionId });
      if (!revision) {
        try {
          revision = await RecordDefinitionRevision.create(proposed).fetch();
        } catch (error) {
          revision = await RecordDefinitionRevision.findOne({ id: revisionId });
          if (!revision) throw error;
        }
      }
      if (
        revision.id !== revisionId ||
        revision.schemaVersion !== 1 ||
        revision.recordTypeId !== definitionId ||
        revision.recordTypeKey !== seed.recordTypeKey ||
        revision.revisionNumber !== 1 ||
        !Number.isFinite(seedTimestamp(revision.publishedAt)) ||
        (revision.publicationNote != null && revision.publicationNote !== '') ||
        revision.recordType !== id ||
        revision.branding !== seed.brandId ||
        revision.canonicalHash !== publication.canonicalHash ||
        !isDeepStrictEqual(revision.definition, publication.definition) ||
        !isDeepStrictEqual(revision.createdBy, actor) ||
        !isDeepStrictEqual(revision.publishedBy, actor) ||
        !isDeepStrictEqual(revision.actionContracts, publication.actionContracts) ||
        !isDeepStrictEqual(revision.source, source)
      ) {
        throw new Error('Conflicting seed revision. Quiesce startup and use an explicit migration to reconcile.');
      }
      const historyId = `rdh_${definitionId.slice(4)}`;
      const history: RecordDefinitionHistoryAttributes = {
        id: historyId,
        schemaVersion: 1,
        branding: seed.brandId,
        recordType: id,
        recordTypeId: definitionId,
        recordTypeKey: seed.recordTypeKey,
        operation: 'bootstrap',
        operationId: historyId,
        expectedIdentityVersion: 0,
        resultingIdentityVersion: 1,
        expectedDraftVersion: null,
        expectedActiveRevisionNumber: null,
        revision: revisionId,
        revisionNumber: 1,
        canonicalHash: publication.canonicalHash,
        source,
        occurredAt: revision.publishedAt,
        actor,
        validation: publication.report,
        impact: publication.impact,
        changes: publication.impact.changes,
        redactions: [],
        truncated: false,
      };
      let storedHistory = await RecordDefinitionHistory.findOne({ id: historyId });
      if (!storedHistory) {
        try {
          storedHistory = await RecordDefinitionHistory.create(history).fetch();
        } catch (error) {
          storedHistory = await RecordDefinitionHistory.findOne({ id: historyId });
          if (!storedHistory) throw error;
        }
      }
      if (
        storedHistory.id !== historyId ||
        storedHistory.schemaVersion !== history.schemaVersion ||
        storedHistory.operationId !== history.operationId ||
        storedHistory.expectedDraftVersion !== null ||
        storedHistory.expectedActiveRevisionNumber !== null ||
        seedTimestamp(storedHistory.occurredAt) !== seedTimestamp(revision.publishedAt) ||
        (storedHistory.note != null && storedHistory.note !== '') ||
        !isDeepStrictEqual(storedHistory.validation, history.validation) ||
        !isDeepStrictEqual(storedHistory.impact, history.impact) ||
        !isDeepStrictEqual(storedHistory.changes, history.changes) ||
        !isDeepStrictEqual(storedHistory.redactions, history.redactions) ||
        storedHistory.truncated !== false ||
        storedHistory.recordType !== id ||
        storedHistory.branding !== seed.brandId ||
        storedHistory.revision !== revisionId ||
        storedHistory.operation !== 'bootstrap' ||
        storedHistory.canonicalHash !== publication.canonicalHash ||
        storedHistory.recordTypeId !== definitionId ||
        storedHistory.recordTypeKey !== seed.recordTypeKey ||
        storedHistory.revisionNumber !== 1 ||
        storedHistory.expectedIdentityVersion !== 0 ||
        storedHistory.resultingIdentityVersion !== 1 ||
        !isDeepStrictEqual(storedHistory.actor, actor) ||
        !isDeepStrictEqual(storedHistory.source, source)
      ) {
        throw new Error('Conflicting seed history. Explicit migration required.');
      }
      try {
        await RecordType.create({
          ...criteria,
          id,
          definitionId,
          packageType: seed.packageType,
          searchCore: seed.searchCore,
          version: 1,
          activeRevisionId: revisionId,
          activeRevisionNumber: 1,
        }).fetch();
        return 'created';
      } catch (error) {
        // Includes duplicate-key races and acknowledgement loss. Never amend the winner.
        if (await RecordType.findOne(criteria)) return 'skipped';
        throw error;
      }
    }
  }
}
