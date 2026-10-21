import { createHash } from 'node:crypto';
import type { PublicationSyncModel } from '../../model/storage/PublicationSyncModel';
import {
  IntegrationAuditAction,
  IntegrationAuditModel,
  IntegrationAuditStatus,
} from '../../model/storage/IntegrationAuditModel';
import { publicationReason } from './status';

export function publicationEpisodeId(row: PublicationSyncModel): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        row.brandId,
        row.oid,
        row.destinationId,
        row.providerId,
        row.approvalId,
        row.approvalEpoch,
        row.sourceGeneration,
        row.work.synchronise.requested,
      ])
    )
    .digest('hex');
}

/** Durable per-row episode metadata permits replay after a crash between checkpoint and audit persistence. */
export function beginPublicationAudit(
  row: PublicationSyncModel,
  now: number
): NonNullable<PublicationSyncModel['audit']> {
  const episodeId = publicationEpisodeId(row);
  if (row.audit?.episodeId === episodeId) return row.audit;
  return {
    episodeId,
    closed: false,
    startedAt: new Date(now).toISOString(),
    providerId: row.providerId,
    approvalId: row.approvalId,
    approvalEpoch: row.approvalEpoch,
    sourceGeneration: row.sourceGeneration,
    sourceRevision: row.sourceRevision,
  };
}
export function closePublicationAudit(
  row: PublicationSyncModel,
  status: string,
  now: number
): PublicationSyncModel['audit'] {
  if (!row.audit || row.audit.closed) return row.audit;
  const operation = [...row.operations]
    .reverse()
    .find(
      item =>
        item.sourceGeneration === row.audit?.sourceGeneration &&
        item.approvalId === row.audit?.approvalId &&
        item.approvalEpoch === row.audit?.approvalEpoch
    );
  return {
    ...row.audit,
    closed: true,
    terminalStatus: status,
    completedAt: new Date(now).toISOString(),
    operationId: operation?.id,
    reason: publicationReason(row.waitingReason),
  };
}

/** Two immutable events per episode. Polls and transient retries never create terminal failures. */
export function publicationAuditEntries(row: PublicationSyncModel): IntegrationAuditModel[] {
  const audit = row.audit;
  if (!audit?.startedAt || !audit.providerId || !audit.approvalId || !audit.sourceGeneration) return [];
  const entry = (terminal: boolean) =>
    new IntegrationAuditModel({
      redboxOid: row.oid,
      brandId: row.brandId,
      destinationId: row.destinationId,
      providerId: audit.providerId,
      integrationName: audit.providerId,
      integrationAction: IntegrationAuditAction.publicationEpisode,
      episodeId: audit.episodeId,
      eventId: createHash('sha256')
        .update(`${audit.episodeId}:${terminal ? 'terminal' : 'started'}`)
        .digest('hex'),
      approvalId: audit.approvalId,
      approvalEpoch: audit.approvalEpoch,
      sourceGeneration: audit.sourceGeneration,
      sourceRevision: audit.sourceRevision,
      operationId: terminal ? audit.operationId : undefined,
      traceId: audit.episodeId,
      spanId: audit.episodeId.slice(0, 16),
      startedAt: audit.startedAt!,
      completedAt: terminal ? audit.completedAt : undefined,
      status: terminal
        ? audit.terminalStatus === 'completed'
          ? IntegrationAuditStatus.success
          : IntegrationAuditStatus.failed
        : IntegrationAuditStatus.started,
      message: terminal ? 'Publication work episode ended.' : 'Publication work episode started.',
      responseSummary: terminal
        ? { workStatus: publicationReason(audit.terminalStatus), reason: publicationReason(audit.reason) }
        : undefined,
    });
  return [entry(false), ...(audit.closed && audit.terminalStatus && audit.completedAt ? [entry(true)] : [])];
}
