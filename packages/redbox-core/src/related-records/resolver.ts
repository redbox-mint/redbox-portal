import { cloneDeep, get } from 'lodash';
import type {
  RelatedMetadata,
  RelatedMetadataEntry,
  RelatedMetadataRequest,
  RelatedMetadataRecord,
} from '@researchdatabox/sails-ng-common';
import type { RecordModel } from '../model';
import type { RecordRelationQueryResult, StorageService } from '../StorageService';
import { normalizeRecordRelations, type RecordRelation } from '../config/recordtype.config';
import type { RelatedRecordReadContext } from './types';
import { normalizeRelatedReferences } from './references';
import { projectRelatedMetadata, projectionTokens } from './projection';

export const RELATED_RESOLUTION_LIMITS = Object.freeze({
  relations: 8,
  perRelation: 50,
  operation: 200,
  concurrency: 6,
  deadlineMs: 10000,
  referenceBytes: 65536,
});
export interface RelatedResolverDependencies {
  /** Internal budget start, including the stored-root read when present. */
  startedAt?: number;
  storage: Pick<StorageService, 'getMeta' | 'findRecordsByRelation'>;
  relations(type: string): Promise<readonly RecordRelation[]>;
  authorizeRoot(record: Readonly<RecordModel>): Promise<boolean>;
  canRead(record: RecordModel): boolean;
  /** Applies caller-effective browser projection and rejects calculated-source chains for every audience. */
  sourceMetadata(record: RecordModel, fields: readonly string[]): Promise<unknown>;
  summary?(summary: { relations: number; statuses: string[]; durationMs: number }): void;
}

class ResolutionDeadline extends Error {}

/**
 * Bound caller latency and reject late results. Storage adapters must also bound
 * their own I/O; racing a promise does not cancel the underlying operation.
 */
export async function withinRelatedResolutionDeadline<T>(work: () => Promise<T>, startedAt = Date.now()): Promise<T> {
  const remaining = startedAt + RELATED_RESOLUTION_LIMITS.deadlineMs - Date.now();
  if (remaining <= 0) throw new ResolutionDeadline();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      Promise.resolve().then(() => {
        if (Date.now() >= startedAt + RELATED_RESOLUTION_LIMITS.deadlineMs) throw new ResolutionDeadline();
        return work();
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ResolutionDeadline()), remaining);
      }),
    ]);
    if (Date.now() >= startedAt + RELATED_RESOLUTION_LIMITS.deadlineMs) throw new ResolutionDeadline();
    return value;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class RequiredRelatedMetadataError extends Error {
  constructor(readonly relatedMetadata: RelatedMetadata) {
    super('Required related metadata is unavailable or incomplete');
  }
}
const failure = (
  code: RelatedMetadataEntry['issues'][number]['code'],
  status: RelatedMetadataEntry['status'] = 'failed'
): RelatedMetadataEntry => ({ status, records: [], issues: [{ code }] });

/** All caches, budgets and authority are operation-local; no graph traversal, writes or expression execution. */
export async function resolveRelatedMetadata(
  root: Readonly<RecordModel>,
  context: RelatedRecordReadContext,
  request: RelatedMetadataRequest,
  dependencies: RelatedResolverDependencies
): Promise<RelatedMetadata> {
  const started = dependencies.startedAt ?? Date.now();
  const expires = started + RELATED_RESOLUTION_LIMITS.deadlineMs;
  const check = () => {
    if (Date.now() >= expires) throw new ResolutionDeadline();
  };
  const bounded = <T>(work: () => Promise<T>): Promise<T> => withinRelatedResolutionDeadline(work, started);
  if (
    !context?.brand?.id ||
    !context.user?.username ||
    !['browser', 'api', 'service'].includes(context.audience) ||
    (context.audience === 'service' && !context.serviceId?.trim())
  )
    throw new Error('Related read context is required');
  if (
    !Array.isArray(request?.relations) ||
    request.relations.length > RELATED_RESOLUTION_LIMITS.relations ||
    request.relations.some(
      selection =>
        !selection ||
        typeof selection.relationId !== 'string' ||
        !selection.relationId.trim() ||
        (selection.required !== undefined && typeof selection.required !== 'boolean')
    ) ||
    new Set(request.relations.map(selection => selection.relationId)).size !== request.relations.length
  )
    throw new Error('Invalid related metadata request');
  if (
    String(root.metaMetadata?.brandId) !== String(context.brand.id) ||
    !(await bounded(() => dependencies.authorizeRoot(root)))
  ) {
    throw new Error('Record unavailable');
  }
  const type = String(root.metaMetadata?.type ?? '');
  const relations = normalizeRecordRelations(type, await bounded(() => dependencies.relations(type)));
  const result: RelatedMetadata = {};
  const reads = new Map<string, Promise<RecordModel | null>>();
  const queries = new Map<string, Promise<RecordRelationQueryResult>>();
  // Never shared across operations or principals. Source OID keeps per-source permission modes separate.
  const projected = new Map<string, Promise<RelatedMetadataRecord>>();
  let consumed = 0;
  const directRead = (oid: string, sourceType: string): Promise<RecordModel | null> => {
    const key = dependencies.storage.findRecordsByRelation ? JSON.stringify([sourceType, oid]) : oid;
    if (!reads.has(key)) {
      if (++consumed > RELATED_RESOLUTION_LIMITS.operation) throw new RangeError('Related read limit');
      reads.set(
        key,
        bounded(async () => {
          if (!dependencies.storage.findRecordsByRelation) return (await dependencies.storage.getMeta(oid)) ?? null;
          const found = await dependencies.storage.findRecordsByRelation({
            context,
            recordType: sourceType,
            foreignField: 'redboxOid',
            values: [oid],
            limit: 1,
          });
          if (!found.complete || found.overflow || found.records.length > 1) throw new RangeError('Related read limit');
          return found.records[0] ?? null;
        })
      );
    }
    return reads.get(key)!;
  };
  const allowed = (record: RecordModel, sourceType: string) =>
    record &&
    String(record.metaMetadata?.brandId) === String(context.brand.id) &&
    record.metaMetadata?.type === sourceType &&
    dependencies.canRead(record);
  for (const selection of request.relations) {
    let entry: RelatedMetadataEntry;
    try {
      check();
      const matches = relations.filter(relation => relation.id === selection.relationId);
      const relation = matches[0];
      if (matches.length !== 1 || !relation.resolution || !Array.isArray(relation.resolution.metadataFields)) {
        entry = failure('configuration-error');
      } else {
        const fields = relation.resolution.metadataFields;
        try {
          fields.forEach(projectionTokens);
        } catch {
          Object.defineProperty(result, selection.relationId, {
            value: failure('configuration-error'),
            enumerable: true,
          });
          continue;
        }
        const raw = get(root, relation.localField);
        if (Buffer.byteLength(JSON.stringify(raw) ?? '') > RELATED_RESOLUTION_LIMITS.referenceBytes) {
          entry = failure('limit-exceeded');
        } else {
          const references = normalizeRelatedReferences(raw, relation.oidProperty);
          if (references.invalidIndices.length) {
            entry = {
              status: 'invalid',
              records: [],
              issues: references.invalidIndices.map(referenceIndex => ({ code: 'invalid-reference', referenceIndex })),
            };
          } else if (references.values.length > RELATED_RESOLUTION_LIMITS.perRelation) {
            entry = failure('limit-exceeded');
          } else {
            const direct = relation.foreignField === 'redboxOid' && relation.direction !== 'inbound';
            if (!direct && typeof dependencies.storage.findRecordsByRelation !== 'function') {
              entry = failure('unsupported-relation');
            } else {
              entry = { status: 'empty', records: [], issues: [] };
              let candidates: RecordModel[] = [];
              let missing = false;
              if (direct) {
                // Six workers share one deduplicated operation cache, including across distinct relation IDs.
                const ordered: (RecordModel | null)[] = new Array(references.values.length);
                let next = 0;
                const workers = await Promise.allSettled(
                  Array.from(
                    { length: Math.min(RELATED_RESOLUTION_LIMITS.concurrency, references.values.length) },
                    async () => {
                      while (next < references.values.length) {
                        check();
                        const index = next++;
                        ordered[index] = await directRead(references.values[index], relation.recordType);
                      }
                    }
                  )
                );
                for (const worker of workers) {
                  if (worker.status === 'rejected') throw worker.reason;
                }
                for (const record of ordered) {
                  if (record && allowed(record, relation.recordType)) candidates.push(record);
                  else missing = true;
                }
              } else if (references.values.length) {
                // Only trusted relation configuration enters this query. Request extras/predicates are never spread.
                const queryKey = JSON.stringify([relation.recordType, relation.foreignField, references.values]);
                if (!queries.has(queryKey)) {
                  const limit = Math.min(
                    RELATED_RESOLUTION_LIMITS.perRelation,
                    RELATED_RESOLUTION_LIMITS.operation - consumed
                  );
                  if (limit <= 0) throw new RangeError('Related read limit');
                  queries.set(
                    queryKey,
                    bounded(async () => {
                      const found = await dependencies.storage.findRecordsByRelation!({
                        context,
                        recordType: relation.recordType,
                        foreignField: relation.foreignField,
                        values: references.values,
                        limit,
                      });
                      consumed += found.records.length;
                      return found;
                    })
                  );
                }
                const found = await queries.get(queryKey)!;
                if (!found.complete || found.overflow || found.records.length > RELATED_RESOLUTION_LIMITS.perRelation) {
                  Object.defineProperty(result, selection.relationId, {
                    value: failure('limit-exceeded'),
                    enumerable: true,
                  });
                  continue;
                }
                if (consumed > RELATED_RESOLUTION_LIMITS.operation) throw new RangeError('Related read limit');
                candidates = found.records.filter(record => allowed(record, relation.recordType));
                candidates.sort((a, b) => (a.redboxOid < b.redboxOid ? -1 : a.redboxOid > b.redboxOid ? 1 : 0));
                candidates = candidates.filter(
                  (record, index) => !index || candidates[index - 1].redboxOid !== record.redboxOid
                );
              }
              if (relation.cardinality === 'one' && candidates.length > 1) entry = failure('cardinality', 'invalid');
              else {
                for (const record of candidates) {
                  check();
                  const key = JSON.stringify([record.redboxOid, fields]);
                  if (!projected.has(key))
                    projected.set(
                      key,
                      bounded(async () => {
                        const projection = projectRelatedMetadata(
                          await dependencies.sourceMetadata(cloneDeep(record), fields),
                          fields
                        );
                        // Missing fields are relation-specific issues, computed below from the projected metadata.
                        return {
                          redboxOid: record.redboxOid,
                          metaMetadata: { type: relation.recordType, brandId: String(context.brand.id) },
                          metadata: projection.metadata,
                          ...(typeof record.revision === 'number' ? { revision: record.revision } : {}),
                        };
                      })
                    );
                  const source = await projected.get(key)!;
                  entry.records.push(cloneDeep(source));
                  for (const fieldPointer of projectRelatedMetadata(source.metadata, fields).absent)
                    entry.issues.push({ code: 'field-absent', fieldPointer });
                }
                if (missing) entry.issues.push({ code: 'unavailable' });
                entry.status = missing
                  ? entry.records.length
                    ? 'partial'
                    : 'unavailable'
                  : entry.records.length
                    ? 'resolved'
                    : 'empty';
              }
            }
          }
        }
      }
    } catch (error) {
      entry = failure(
        error instanceof RangeError || error instanceof ResolutionDeadline
          ? 'limit-exceeded'
          : error instanceof UnsupportedCalculatedSource
            ? 'unsupported-relation'
            : 'source-read-failed'
      );
    }
    Object.defineProperty(result, selection.relationId, { value: entry, enumerable: true });
  }
  try {
    dependencies.summary?.({
      relations: request.relations.length,
      statuses: Object.values(result).map(entry => entry.status),
      durationMs: Date.now() - started,
    });
  } catch {
    /* Logging cannot change a read result. */
  }
  if (request.relations.some(selection => selection.required && result[selection.relationId]?.status !== 'resolved'))
    throw new RequiredRelatedMetadataError(result);
  return result;
}

export class UnsupportedCalculatedSource extends Error {
  constructor() {
    super('Calculated related source chains are unsupported');
  }
}
