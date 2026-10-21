import { publicationCompletionOperationsVerified, publicationOperationRequiresRecovery } from './operations';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { cloneDeep, get, has, isEqual, set, unset } from 'lodash';
import type { PublicationSyncModel } from '../../model/storage/PublicationSyncModel';
import type { PublicationWriteIntent } from '../../RecordWriteOptions';
import type { PublicationObject, PublicationWorkflowDecision, PublicationWorkKey } from './contracts';
import {
  publicationContentRecord,
  publicationContentDigest,
  publicationRecordDigest,
  publicationDigest,
} from './canonical';
import { isPublicationObject } from './builtins';
import { publicationState } from './save';
import { reopenPublicationSource } from './source';
import type { PublicationRuntime } from './worker';
import { validatePublicationRequest } from './worker';
import { PublicationStopped } from './execution';

const workflowPaths = ['workflow', 'metaMetadata.form', 'authorization', 'metadata.@context'];
interface TransitionContext extends PublicationWorkKey {
  decision: PublicationWorkflowDecision;
  active: boolean;
}
const transitionContext = new AsyncLocalStorage<TransitionContext>();
export function publicationWorkflowTransitionActive(oid: string): boolean {
  const context = transitionContext.getStore();
  return context?.active === true && context.oid === oid;
}

/** The projection is computed by WorkflowStepsService, before running any transition hook. */
export interface PublicationWorkflowTransition {
  before: PublicationObject;
  after: PublicationObject;
  run(record: Record<string, unknown>): Promise<boolean>;
}
export function publicationWorkflowSnapshot(record: Record<string, unknown>, paths = workflowPaths): PublicationObject {
  const content = publicationContentRecord(record);
  const snapshot: unknown = Object.fromEntries(
    paths.map(path => [
      path,
      has(content, path) ? { present: true, value: cloneDeep(get(content, path)) } : { present: false },
    ])
  );
  if (!isPublicationObject(snapshot)) throw new Error('Workflow projection must be JSON');
  return snapshot;
}
export function publicationWorkflowDecisionId(
  decision: Pick<PublicationWorkflowDecision, 'sourceRevision' | 'rule' | 'approvals'>
): string {
  return publicationDigest({
    sourceRevision: decision.sourceRevision,
    rule: decision.rule,
    approvals: [...decision.approvals].sort((a, b) => a.destinationId.localeCompare(b.destinationId)),
  });
}
export function assertPublicationWorkflowDecision(decision: PublicationWorkflowDecision): void {
  const paths = Object.keys(decision.after);
  if (
    !paths.includes('workflow') ||
    paths.some(path => !workflowPaths.includes(path)) ||
    !isEqual(paths.sort(), Object.keys(decision.before).sort()) ||
    decision.id !== publicationWorkflowDecisionId(decision) ||
    !isEqual([...decision.approvals.map(item => item.destinationId)].sort(), [...decision.rule.destinations].sort()) ||
    get(decision.after, ['workflow', 'value', 'stage']) !== decision.rule.targetStage
  )
    throw new Error('Invalid publication workflow decision');
  for (const fields of [decision.before, decision.after])
    for (const value of Object.values(fields))
      if (
        !isPublicationObject(value) ||
        typeof value.present !== 'boolean' ||
        (value.present && !Object.hasOwn(value, 'value'))
      )
        throw new Error('Invalid publication workflow projection');
}
export function publicationWorkflowProjectionMatches(
  record: Record<string, unknown>,
  decision: PublicationWorkflowDecision
): boolean {
  return isEqual(publicationWorkflowSnapshot(record, Object.keys(decision.after)), decision.after);
}
/** Only this exact, persisted internal projection may normalize to the approved workflow. */
export function publicationWorkflowContent(
  record: Record<string, unknown>,
  decision?: PublicationWorkflowDecision
): Record<string, unknown> {
  const content = cloneDeep(record);
  if (!decision || !publicationWorkflowProjectionMatches(content, decision)) return content;
  assertPublicationWorkflowDecision(decision);
  for (const [path, value] of Object.entries(decision.before)) {
    if (!isPublicationObject(value)) throw new Error('Invalid workflow evidence');
    if (value.present) set(content, path, cloneDeep(value.value));
    else unset(content, path);
  }
  return content;
}
export function publicationWorkflowInputs(
  record: Record<string, unknown>,
  row: PublicationSyncModel
): Record<string, unknown> {
  const decision = publicationState(record)?.workflowDecision;
  if (
    !decision ||
    decision.status === 'started' ||
    decision.sourceRevision !== row.sourceRevision ||
    !decision.approvals.some(
      item =>
        item.destinationId === row.destinationId &&
        item.approvalId === row.approvalId &&
        item.epoch === row.approvalEpoch &&
        item.generation === row.sourceGeneration
    )
  )
    return record;
  return publicationWorkflowContent(record, decision);
}

/** A scoped server capability, never an HTTP option or a hook-supplied maintenance flag. */
export async function withPublicationWorkflowTransition<T>(
  key: PublicationWorkKey,
  decision: PublicationWorkflowDecision,
  run: () => Promise<T>
): Promise<T> {
  const context: TransitionContext = { ...key, decision: cloneDeep(decision), active: true };
  try {
    return await transitionContext.run(context, run);
  } finally {
    context.active = false;
  }
}
export function publicationWorkflowWriteIntent(
  record: Record<string, unknown>,
  prior: Record<string, unknown>,
  oid: string
): PublicationWriteIntent | undefined {
  const context = transitionContext.getStore();
  if (!context?.active || context.oid !== oid || get(prior, 'metaMetadata.brandId') !== context.brandId)
    return undefined;
  const state = publicationState(prior);
  const decision = state?.workflowDecision;
  if (
    !state ||
    !decision ||
    decision.id !== context.decision.id ||
    !['started', 'stage_applied'].includes(decision.status)
  )
    throw new Error('Publication workflow attempt is no longer current');
  const changed =
    publicationContentDigest(publicationWorkflowContent(record, decision)) !==
    publicationContentDigest(publicationWorkflowContent(prior, decision));
  return {
    kind: changed ? 'content' : 'preserve',
    expectedSourceRevision: state.revision,
    saveToken: randomUUID(),
    approvals: [],
    expectedRecordDigest: publicationRecordDigest(record),
    expectedPriorRecordDigest: publicationRecordDigest(prior),
    workflowDecisionId: decision.id,
  };
}

export function currentPublicationCompletion(record: Record<string, unknown>, row: PublicationSyncModel): boolean {
  const state = publicationState(record);
  const intent = state?.intents[row.destinationId];
  const evidence = row.completion;
  return (
    !!state &&
    state.revision === row.sourceRevision &&
    !!intent &&
    !intent.pending &&
    intent.generation === row.sourceGeneration &&
    intent.approvalId === row.approvalId &&
    intent.approvalEpoch === row.approvalEpoch &&
    row.status === 'completed' &&
    row.work.synchronise.requested === row.work.synchronise.processed &&
    row.work.maintenance.requested === row.work.maintenance.processed &&
    !row.operations.some(publicationOperationRequiresRecovery) &&
    !!evidence &&
    publicationCompletionOperationsVerified(row, row.operations, evidence) &&
    !state.saves.some(
      save =>
        save.sourceRevision === state.revision &&
        save.outcome !== 'abandoned' &&
        save.intents.some(item => item.destinationId === row.destinationId && item.pending)
    ) &&
    !!evidence &&
    evidence.approvalId === row.approvalId &&
    evidence.approvalEpoch === row.approvalEpoch &&
    evidence.sourceGeneration === row.sourceGeneration &&
    evidence.sourceDigest === row.sourceDigest &&
    evidence.remote.namespace === row.binding?.namespace &&
    evidence.remote.objectId === row.binding.objectId
  );
}

/** Returns true only when this source needs no further automatic workflow evaluation. */
export async function evaluatePublicationWorkflow(
  runtime: PublicationRuntime,
  key: PublicationWorkKey
): Promise<boolean> {
  if (!runtime.prepareWorkflowTransition) return true;
  const config = await runtime.configuration(key.brandId);
  if (!config?.processing.enabled) return false;
  const loaded = await runtime.storage.getMeta(key.oid);
  if (!loaded || loaded.metaMetadata.brandId !== key.brandId) return true;
  const record: Record<string, unknown> = { ...loaded };
  const state = publicationState(record);
  if (!state) return true;
  const rows = await runtime.store.forRecord(key.brandId, key.oid);
  // A committed attempt is never replayed, including a crash before/after side-effecting hooks.
  const existing = state.workflowDecision;
  if (existing) {
    await runtime.store.recordWorkflowDecision(key, existing);
    if (
      existing.sourceRevision === state.revision &&
      (existing.status !== 'completed' ||
        existing.approvals.every(item => {
          const intent = state.intents[item.destinationId];
          return (
            intent?.approvalId === item.approvalId &&
            intent.approvalEpoch === item.epoch &&
            intent.generation === item.generation
          );
        }))
    )
      return true;
  }
  let pending = false;
  for (const rule of config.workflow.rules) {
    if (rule.recordType !== get(record, 'metaMetadata.type') || get(record, 'workflow.stage') === rule.targetStage)
      continue;
    const approved = rule.destinations.map(destinationId => {
      const intent = state.intents[destinationId];
      const approval = state.approvals.find(
        item => item.id === intent?.approvalId && item.epoch === intent.approvalEpoch && !item.revokedAt
      );
      return approval &&
        approval.sourceRevision === state.revision &&
        approval.destinationIds.includes(destinationId) &&
        approval.workflowRules?.some(frozen => publicationDigest(frozen) === publicationDigest(rule))
        ? { destinationId, approval, intent }
        : undefined;
    });
    if (approved.some(item => !item)) continue;
    pending = true;
    const complete: PublicationSyncModel[] = [];
    for (const item of approved) {
      if (!item) continue;
      const row = rows.find(entry => entry.destinationId === item.destinationId);
      if (!row || !currentPublicationCompletion(record, row)) continue;
      const source = await reopenPublicationSource(
        key.brandId,
        item.approval.source,
        runtime.staging(item.approval.source.disk)
      );
      try {
        await validatePublicationRequest(runtime, row, true, source, item.approval);
      } catch (error) {
        if (error instanceof PublicationStopped) continue;
        throw error;
      }
      complete.push(row);
      if (rule.completion === 'any') break;
    }
    if (rule.completion === 'all' ? complete.length !== rule.destinations.length : complete.length === 0) continue;
    await runtime.assertAccess(key.brandId, record, config);
    const transition = await runtime.prepareWorkflowTransition(record, rule);
    const ruleIsCurrent = async () => {
      const current = await runtime.configuration(key.brandId);
      return (
        current?.processing.enabled &&
        current.workflow.rules.some(candidate => publicationDigest(candidate) === publicationDigest(rule))
      );
    };
    if (!(await ruleIsCurrent())) return false;
    const decision: PublicationWorkflowDecision = {
      id: '',
      sourceRevision: state.revision,
      rule: cloneDeep(rule),
      approvals: approved.flatMap(item =>
        item
          ? [
              {
                destinationId: item.destinationId,
                approvalId: item.approval.id,
                epoch: item.approval.epoch,
                generation: item.intent.generation,
              },
            ]
          : []
      ),
      status: 'started',
      startedAt: new Date((runtime.now ?? Date.now)()).toISOString(),
      before: transition.before,
      after: transition.after,
    };
    decision.id = publicationWorkflowDecisionId(decision);
    assertPublicationWorkflowDecision(decision);
    const counted = complete[0];
    const projection = {
      ...key,
      destinationId: counted.destinationId,
      sourceRevision: state.revision,
      approvalId: counted.approvalId,
      approvalEpoch: counted.approvalEpoch,
      generation: counted.sourceGeneration,
      allowedPaths: [],
      fields: {},
    };
    // Exact revision fences source edits and competing workers after all asynchronous checks.
    const claimed = await runtime.storage.setPublicationRecordFields!({
      ...projection,
      expectedRevision: loaded.revision ?? 0,
      workflowDecision: { operation: 'claim', decision },
    });
    if (!claimed.updated) return false;
    await runtime.store.recordWorkflowDecision(key, decision);
    let reason: string | undefined;
    try {
      if (!(await ruleIsCurrent())) throw new Error('Publication workflow rule changed');
      const current = await runtime.storage.getMeta(key.oid);
      if (!current) throw new Error('Record removed during workflow transition');
      // Revalidate current permissions, continuation and source after winning the decision.
      for (const row of complete) {
        const approval = approved.find(item => item?.destinationId === row.destinationId)?.approval;
        if (!approval) throw new Error('Workflow approval unavailable');
        const source = await reopenPublicationSource(
          key.brandId,
          approval.source,
          runtime.staging(approval.source.disk)
        );
        await validatePublicationRequest(runtime, row, true, source, approval);
      }
      const completed = await withPublicationWorkflowTransition(key, decision, () => transition.run({ ...current }));
      if (!completed) reason = 'workflow_hooks_failed';
    } catch {
      reason = 'workflow_transition_unverified';
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const fresh = await runtime.storage.getMeta(key.oid);
      const currentDecision = fresh && publicationState({ ...fresh })?.workflowDecision;
      if (!fresh || !currentDecision || currentDecision.id !== decision.id) return true;
      if (
        !reason &&
        (publicationState({ ...fresh })?.revision !== decision.sourceRevision ||
          !publicationWorkflowProjectionMatches({ ...fresh }, decision))
      )
        reason = 'workflow_content_changed';
      const finished = {
        ...currentDecision,
        status: reason ? ('failed' as const) : ('completed' as const),
        finishedAt: new Date((runtime.now ?? Date.now)()).toISOString(),
        ...(reason ? { reason } : {}),
      };
      if (
        (
          await runtime.storage.setPublicationRecordFields!({
            ...projection,
            expectedRevision: fresh.revision ?? 0,
            workflowDecision: { operation: 'finish', decision: finished },
          })
        ).updated
      ) {
        await runtime.store.recordWorkflowDecision(key, finished);
        return true;
      }
    }
    // The durable started/stage_applied evidence is retained even if final acknowledgement is unavailable.
    return true;
  }
  return !pending;
}
