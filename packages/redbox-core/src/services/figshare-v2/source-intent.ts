import _ from 'lodash';
import { randomUUID } from 'node:crypto';
import type { RecordModel } from '../../model/storage/RecordModel';
import type { RecordWriteOptions } from '../../RecordWriteOptions';
import type { FigshareSourceRequest } from '../../model/storage/FigshareSyncModel';
import { resolveFigsharePublishingConfig } from './config';

const syncHooks = new Set(['validateFigshareRecord', 'wakeFigshareRecord', 'createUpdateFigshareArticle', 'uploadFilesToFigshareArticle']);
const cleanupHooks = new Set(['requestFigshareCleanup', 'deleteFilesFromRedboxTrigger']);
const warnedRepeatedHooks = new Set<string>();
interface FigshareHookPolicy { kind: 'sync' | 'cleanup'; options: Record<string, unknown>; policyId: string; legacyId: string }

/**
 * Figshare hooks configured for one event phase. A default policy ID names the hook function, so reordering
 * other hooks keeps queued work eligible; a repeated function adds its occurrence. `legacyId` is the earlier
 * position-based default, still honoured for work queued before this change.
 */
function figshareHookPolicies(recordType: unknown, event: string, phase: string): FigshareHookPolicy[] {
  const hooks: unknown = _.get(recordType, `hooks.${event}.${phase}`, []);
  if (!Array.isArray(hooks)) return [];
  const occurrences = new Map<string, number>();
  const policies: Array<FigshareHookPolicy & { site: string }> = [];
  for (const [index, hook] of hooks.entries()) {
    const name = String(hook.function ?? '').split('.').pop() ?? '';
    const kind = syncHooks.has(name) ? 'sync' : cleanupHooks.has(name) ? 'cleanup' : null;
    if (!kind) continue;
    const options = hook.options ?? {};
    const site = `${event}.${phase}.${name}`;
    const occurrence = occurrences.get(site) ?? 0;
    occurrences.set(site, occurrence + 1);
    const legacyId = String(options.policyId ?? `${event}.${phase}.${index}`);
    policies.push({ kind, options, site, legacyId, policyId: String(options.policyId ?? (occurrence ? `${site}.${occurrence}` : site)) });
  }
  for (const [site, count] of occurrences) {
    if (count > 1 && policies.some(p => p.site === site && p.options.policyId == null) && !warnedRepeatedHooks.has(site)) {
      warnedRepeatedHooks.add(site);
      sails.log.warn(`Figshare hook ${site} is configured ${count} times; set options.policyId on each so reordering cannot exchange their queued work`);
    }
  }
  return policies;
}
export function evaluateSourceCondition(condition: string, oid: string, record: Record<string, unknown>, user?: unknown): boolean {
  if (!condition) return true;
  return _.template(condition, { imports: { _, oid, record, user: user ?? null } })().trim() === 'true';
}
/** Inspect configured hooks after all pre hooks, so a failed save never queues work. */
export function prepareSourceIntent(record: Record<string, unknown>, recordType: unknown, events: string[], user: Record<string, unknown>, initialising: boolean, maintenance = false): RecordWriteOptions['figshareIntent'] {
  if (maintenance) return undefined;
  const config = resolveFigsharePublishingConfig(record, { requireToken: false });
  if (!config?.processing?.enabled) return undefined;
  const intents: FigshareSourceRequest[] = [];
  let configured = false;
  for (const event of events) {
    for (const phase of ['pre', 'postSync', 'post']) {
      for (const { kind, options, policyId } of figshareHookPolicies(recordType, event, phase)) {
        configured = true;
        const sourceCondition = String(options.triggerCondition ?? '');
        const condition = String(options.executionCondition ?? sourceCondition);
        if (/\buser\b/.test(condition)) throw new Error('Figshare hooks with requester conditions require a separate user-independent executionCondition');
        if (evaluateSourceCondition(sourceCondition, String(record.redboxOid ?? ''), record, user)) {
          intents.push({ kind, policyId, condition, requestedBy: String(user.username ?? user.id ?? 'unknown') });
        }
      }
    }
  }
  if (!configured) return undefined;
  return { intents, requestedBy: String(user.username ?? user.id ?? 'unknown'), saveToken: randomUUID(), readiness: initialising ? 'initialising' : 'ready' };
}

/** Resolve the original policy ID against current hook configuration, without reauthorising as the service user. */
export function currentExecutionEligible(recordType: unknown, policies: FigshareSourceRequest[], oid: string, record: RecordModel): boolean {
  for (const event of ['onCreate', 'onUpdate', 'onTransitionWorkflow']) {
    for (const phase of ['pre', 'postSync', 'post']) {
      for (const { kind, options, policyId, legacyId } of figshareHookPolicies(recordType, event, phase)) {
        if (!policies.some(policy => (policy.policyId === policyId || policy.policyId === legacyId) && policy.kind === kind)) continue;
        const condition = String(options.executionCondition ?? options.triggerCondition ?? '');
        if (!/\buser\b/.test(condition) && evaluateSourceCondition(condition, oid, record)) return true;
      }
    }
  }
  return false;
}
