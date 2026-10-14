import type { IntegrationStatusSummary } from '../IntegrationAuditService';
import type { FigshareSourceIntent } from '../../model/storage/FigshareSyncModel';
import { getSyncStore } from './worker';
import { resolveFigsharePublishingConfig } from './config';

/** Called only after the existing record-view access check. Never expose operation tokens or accounts. */
export async function figshareLiveSummary(oid: string, record: Record<string, unknown>): Promise<IntegrationStatusSummary | null> {
  const intent = record.figshareSyncIntent as FigshareSourceIntent | undefined;
  const state = typeof FigshareSync === 'undefined' ? null : await getSyncStore().get(oid);
  const queued = intent?.pending && intent.readiness === 'ready' && intent.generation > (state?.importedGeneration ?? 0);
  if (!state && !queued) return null;
  const processingError = resolveFigsharePublishingConfig(record, { requireToken: false })?.processingError;
  const unresolvedFailure = state?.error?.terminal && (!state.error.kind || state.error.kind === 'sync')
    && state.work.sync.requested > state.work.sync.processed;
  const status = processingError ? 'configuration_error' : queued ? 'queued' : unresolvedFailure ? state.error!.category === 'repair' ? 'repair_required' : 'failed' : state!.status;
  const failed = ['failed', 'repair_required', 'configuration_error'].includes(status);
  const waiting = ['waiting', 'queued', 'retrying'].includes(status);
  const outcomeState = processingError ? 'configuration_error' : queued ? 'queued' : status === 'waiting' ? state?.waitingReason ?? 'pending' : status;
  return {
    integrationName: 'figshare', status: failed ? 'failed' : status === 'running' ? 'started' : waiting ? 'pending' : 'success',
    startedAt: state?.audit?.startedAt ?? intent?.requestedAt ?? '', traceId: state?.audit?.traceId ?? `figshare-live:${oid}`,
    message: processingError ?? (failed ? state?.error?.message : undefined),
    outcome: { state: outcomeState, severity: failed ? 'error' : status === 'running' ? 'in-progress' : waiting ? 'pending' : 'success', labelKey: `@figshare-live-${outcomeState}` },
    keyResult: { articleId: state?.binding?.articleId, publication: state?.publication, embargoed: state?.embargoed,
      lastObservation: state?.observedAt, localBytesRetained: true, nextCheckAt: processingError ? undefined : state?.nextActionAt }
  };
}
