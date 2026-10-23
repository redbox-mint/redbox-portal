import type { FigshareSourceIntent } from '../../model/storage/FigshareSyncModel';
import { summarizeFigshareStatus } from '../../queries/FigshareStatus';
import { getSyncStore } from './worker';
import { resolveFigsharePublishingConfig } from './config';
/** Called only after record-view authorization. */
export async function figshareLiveSummary(oid: string, record: Record<string, unknown>) {
  const state = await getSyncStore().get(oid);
  // Only resolve configuration for actual stored or queued status, as before.
  const intent = record.figshareSyncIntent as FigshareSourceIntent | undefined;
  if (!state && !(intent?.pending && intent.readiness === 'ready' && intent.generation > 0)) return null;
  return summarizeFigshareStatus(
    oid,
    record,
    state,
    resolveFigsharePublishingConfig(record, { requireToken: false })?.processingError
  );
}
