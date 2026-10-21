import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { cloneDeep, get, template } from 'lodash';
import * as lodash from 'lodash';
import type { PublicationPublishingConfigData } from '../../configmodels/PublicationPublishing';
import type { PublicationWriteIntent } from '../../RecordWriteOptions';
import type { StorageService } from '../../StorageService';
import { assertFullPublicationStorageCapability } from '../../RecordStorageConcurrency';
import type {
  PublicationApproval,
  PublicationAttribution,
  PublicationObject,
  PublicationSourcePolicy,
  PublicationSourceState,
} from './contracts';
import { publicationContentDigest, publicationRecordDigest, publicationDigest } from './canonical';
import type { SealedPublicationSource } from './source';

type RecordSnapshot = Record<string, unknown>;
export interface PublicationSaveSession {
  readonly id: string;
  events: string[];
  user?: RecordSnapshot;
  closed: boolean;
  prepared?: PreparedPublicationSave;
  lastWrittenDigest?: string;
  tokens: string[];
}
const sessions = new WeakSet<PublicationSaveSession>();
export const publicationHookContext = new AsyncLocalStorage<{
  session: PublicationSaveSession;
  event: string;
  phase: string;
  options: RecordSnapshot;
}>();
/** Internal capability; JSON and hook options cannot construct a containing save. */
export function createPublicationSaveSession(): PublicationSaveSession {
  const session: PublicationSaveSession = { id: randomUUID(), events: [], closed: false, tokens: [] };
  sessions.add(session);
  return session;
}
export function assertPublicationSaveSession(session: PublicationSaveSession): void {
  if (!sessions.has(session) || session.closed) throw new Error('Publication requires a current trusted save session');
}
export interface PublicationSourceRuntime {
  configuration: PublicationPublishingConfigData;
  refresh(): Promise<PublicationSourceRuntime>;
  prepare(
    record: RecordSnapshot,
    policy: PublicationSourcePolicy,
    sourceRevision: number,
    generated?: PublicationObject
  ): Promise<SealedPublicationSource>;
  assertGrantAccess(record: RecordSnapshot, user: RecordSnapshot): Promise<void>;
  attribution(user: RecordSnapshot): Promise<{ requester: PublicationAttribution; approver: PublicationAttribution }>;
  creator(record: RecordSnapshot): Promise<PublicationAttribution | undefined>;
  /** Current service identity/access only; never re-resolve a historical requester. */
  assertContinuationAccess(record: RecordSnapshot): Promise<void>;
}
export interface PreparedPublicationSave {
  brandId: string;
  oid: string;
  events: string[];
  policyIds: string[];
  runtime: PublicationSourceRuntime;
  intent: PublicationWriteIntent;
  generated: Record<string, PublicationObject>;
  contentDigest: string;
  sealed: Record<string, SealedPublicationSource>;
}
/** Compare frozen inputs across preflight passes without random staging/request locations. */
export function publicationPreparationDigest(source: SealedPublicationSource): string {
  return publicationDigest({
    ...source.descriptor,
    requestId: '',
    attachments: source.descriptor.attachments.map(({ staged: _staged, ...attachment }) => attachment),
  });
}

export function assertPublicationSavePolicies(
  prepared: PreparedPublicationSave,
  runtime: PublicationSourceRuntime
): void {
  for (const id of prepared.policyIds) {
    const previous = prepared.runtime.configuration.sourcePolicies.find(policy => policy.id === id);
    const current = runtime.configuration.sourcePolicies.find(policy => policy.id === id);
    if (!previous || !current || publicationDigest(previous) !== publicationDigest(current))
      throw new Error('Publication grant policy changed during the save');
  }
}
export class PublicationApprovalValidationError extends Error {
  readonly code = 'publication-approval-validation-failed';
  constructor(readonly destinationIds: string[]) {
    super(`Publication approval could not be prepared for: ${destinationIds.join(', ')}`);
  }
}
/** Expressions are administrator configuration, never request/hook option expressions. */
export function publicationCondition(
  condition: string | undefined,
  oid: string,
  record: RecordSnapshot,
  user?: RecordSnapshot
): boolean {
  if (!condition) return true;
  return template(condition, { imports: { _: lodash, oid, record, user: user ?? null } })().trim() === 'true';
}
export function publicationState(record?: RecordSnapshot): PublicationSourceState | undefined {
  const value = record?.publicationSource;
  if (value === undefined) return undefined;
  if (
    !value ||
    typeof value !== 'object' ||
    Reflect.get(value, 'schemaVersion') !== 1 ||
    !Number.isSafeInteger(Reflect.get(value, 'revision'))
  )
    throw new Error('Unsupported publication source state; repair required');
  // The adapter validates the complete persisted shape; callers only pass authoritative storage snapshots.
  return value as PublicationSourceState;
}
export async function preparePublicationSave(input: {
  session: PublicationSaveSession;
  runtime: PublicationSourceRuntime;
  record: RecordSnapshot;
  original?: RecordSnapshot;
  brandId: string;
  oid: string;
  events: string[];
  user: RecordSnapshot;
  policyIds?: string[];
}): Promise<PreparedPublicationSave> {
  const { session, runtime, record, original, brandId, oid, events, user } = input;
  assertPublicationSaveSession(session);
  const snapshot = cloneDeep(record);
  const state = publicationState(original);
  const changed = !state || !original || publicationContentDigest(snapshot) !== publicationContentDigest(original);
  const revision = (state?.revision ?? 0) + (changed ? 1 : 0);
  const intent: PublicationWriteIntent = {
    kind: changed ? 'content' : 'preserve',
    expectedSourceRevision: state?.revision ?? 0,
    saveToken: randomUUID(),
    approvals: [],
    expectedRecordDigest: publicationRecordDigest(snapshot),
    ...(original ? { expectedPriorRecordDigest: publicationRecordDigest(original) } : {}),
    preparationFailures: [],
  };
  const prepared: PreparedPublicationSave = {
    brandId,
    oid,
    events: [...events],
    policyIds: [],
    runtime,
    intent,
    generated: {},
    contentDigest: publicationContentDigest(snapshot),
    sealed: {},
  };
  const policies = runtime.configuration.sourcePolicies.filter(
    policy =>
      policy.recordType === get(snapshot, 'metaMetadata.type') &&
      events.includes(policy.event) &&
      (!input.policyIds || input.policyIds.includes(policy.id))
  );
  const destinations = new Set<string>();
  for (const policy of policies) {
    if (!publicationCondition(policy.grantCondition, oid, snapshot, user)) continue;
    prepared.policyIds.push(policy.id);
    const groups = policy.mode === 'approval' ? [policy.destinations] : policy.destinations.map(id => [id]);
    for (const ids of groups) {
      const scope = { ...cloneDeep(policy), destinations: [...ids].sort() };
      try {
        if (ids.some(id => destinations.has(id))) throw new Error('Overlapping publication policy destinations');
        if (
          !runtime.configuration.processing.enabled ||
          ids.some(id => {
            const destination = runtime.configuration.destinations[id];
            return !destination || !destination.enabled || destination.archived;
          })
        )
          throw new Error('Publication destination is unavailable');
        await runtime.assertGrantAccess(snapshot, user);
        const attribution = await runtime.attribution(user);
        const creator = await runtime.creator(snapshot);
        const sealed = await runtime.prepare(
          snapshot,
          scope,
          revision,
          prepared.generated[policy.id] ?? session.prepared?.generated[policy.id]
        );
        prepared.generated[policy.id] = sealed.descriptor.generatedValues;
        prepared.sealed[`${policy.id}:${ids.join(',')}`] = sealed;
        intent.approvals.push({
          id: randomUUID(),
          epoch: 1,
          sourceRevision: revision,
          policy: scope,
          destinationIds: scope.destinations,
          targetFingerprints: sealed.descriptor.targets,
          configurationDigests: sealed.configurationDigests,
          source: sealed.reference,
          ...attribution,
          ...(creator ? { creator } : {}),
          grantedAt: new Date().toISOString(),
          workflowRules: cloneDeep(
            runtime.configuration.workflow.rules.filter(
              rule =>
                rule.recordType === policy.recordType && rule.destinations.every(id => policy.destinations.includes(id))
            )
          ),
        });
        ids.forEach(id => destinations.add(id));
      } catch {
        if (policy.mode === 'approval') throw new PublicationApprovalValidationError(ids);
        for (const destinationId of ids)
          intent.preparationFailures!.push({
            destinationId,
            policyId: policy.id,
            sourceRevision: revision,
            code: 'publication-source-preparation-failed',
            recordedAt: new Date().toISOString(),
          });
      }
    }
  }
  // Storage independently checks the exact candidate and prior snapshot after asynchronous preflight.
  if (publicationRecordDigest(record) !== intent.expectedRecordDigest)
    throw new Error('Publication source changed during preparation');
  if (intent.approvals.length && !changed) intent.kind = 'approval';
  session.prepared = prepared;
  session.user = cloneDeep(user);
  return prepared;
}
/** Institutional approval: grant gates/requester status are deliberately absent here. */
export async function assertPublicationContinuation(
  runtime: PublicationSourceRuntime,
  record: RecordSnapshot,
  approval: PublicationApproval
): Promise<void> {
  const state = publicationState(record);
  const current = state?.approvals.find(
    entry => entry.id === approval.id && entry.epoch === approval.epoch && !entry.revokedAt
  );
  const policy = runtime.configuration.sourcePolicies.find(entry => entry.id === current?.policy.id);
  if (
    !current ||
    !runtime.configuration.processing.enabled ||
    current.destinationIds.some(
      id => !runtime.configuration.destinations[id]?.enabled || runtime.configuration.destinations[id]?.archived
    ) ||
    current.sourceRevision !== state?.revision ||
    !policy ||
    policy.version !== current.policy.version ||
    policy.mode !== current.policy.mode ||
    !current.destinationIds.every(id => policy.destinations.includes(id)) ||
    !publicationCondition(policy.continuationCondition, String(record.redboxOid ?? ''), record)
  )
    throw new Error('Publication approval is no longer current');
  await runtime.assertContinuationAccess(record);
}
export async function abandonPublicationSave(storage: StorageService, session: PublicationSaveSession): Promise<void> {
  const prepared = session.prepared;
  if (!prepared) return;
  assertFullPublicationStorageCapability(storage);
  for (const token of session.tokens) await storage.abandonPublicationIntent!(prepared.brandId, prepared.oid, token);
}
