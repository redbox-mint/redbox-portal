import _ from 'lodash';
import { randomUUID } from 'node:crypto';
import type { RecordModel } from '../../model/storage/RecordModel';
import type { RecordWriteOptions } from '../../RecordWriteOptions';
import type { FigshareSourceRequest } from '../../model/storage/FigshareSyncModel';
import { resolveFigsharePublishingConfig } from './config';

const syncHooks = new Set(['validateFigshareRecord', 'wakeFigshareRecord', 'createUpdateFigshareArticle', 'uploadFilesToFigshareArticle']);
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
      const hooks: unknown = _.get(recordType, `hooks.${event}.${phase}`, []);
      if (!Array.isArray(hooks)) continue;
      for (const [index, hook] of hooks.entries()) {
        const name = String(hook.function ?? '').split('.').pop() ?? '';
        const kind = syncHooks.has(name) ? 'sync' : ['requestFigshareCleanup', 'deleteFilesFromRedboxTrigger'].includes(name) ? 'cleanup' : null;
        if (!kind) continue;
        configured = true;
        const options = hook.options ?? {};
        const sourceCondition = String(options.triggerCondition ?? '');
        const condition = String(options.executionCondition ?? sourceCondition);
        if (/\buser\b/.test(condition)) throw new Error('Figshare hooks with requester conditions require a separate user-independent executionCondition');
        if (evaluateSourceCondition(sourceCondition, String(record.redboxOid ?? ''), record, user)) {
          intents.push({ kind, policyId: String(options.policyId ?? `${event}.${phase}.${index}`), condition, requestedBy: String(user.username ?? user.id ?? 'unknown') });
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
      const hooks: unknown = _.get(recordType, `hooks.${event}.${phase}`, []);
      if (!Array.isArray(hooks)) continue;
      for (const [index, hook] of hooks.entries()) {
        const options = hook.options ?? {};
        const id = String(options.policyId ?? `${event}.${phase}.${index}`);
        const name = String(hook.function ?? '').split('.').pop() ?? '';
        const kind = syncHooks.has(name) ? 'sync' : ['requestFigshareCleanup', 'deleteFilesFromRedboxTrigger'].includes(name) ? 'cleanup' : null;
        if (!policies.some(policy => policy.policyId === id && policy.kind === kind)) continue;
        const condition = String(options.executionCondition ?? options.triggerCondition ?? '');
        if (!/\buser\b/.test(condition) && evaluateSourceCondition(condition, oid, record)) return true;
      }
    }
  }
  return false;
}
