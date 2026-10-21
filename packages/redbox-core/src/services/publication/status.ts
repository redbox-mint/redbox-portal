import { publicationCompletionOperationsVerified, publicationOperationRequiresRecovery } from './operations';
import { isPublicationObject } from './builtins';
import type { PublicationSyncModel } from '../../model/storage/PublicationSyncModel';
import type { IntegrationStatusSummary } from '../IntegrationAuditService';
import type {
  PublicationObservation,
  PublicationCompletionEvidence,
  PublicationIntent,
  PublicationSourceState,
} from './contracts';

export interface PublicationStatusConfiguration {
  processing: { enabled: boolean };
  destinations: Record<string, { provider: string; displayName: string; enabled: boolean; archived: boolean }>;
}
/** Retain only labels when invalid execution configuration cannot be resolved. Never copy connections or mappings. */
export function publicationStatusLabels(value: unknown): PublicationStatusConfiguration {
  const result: PublicationStatusConfiguration = { processing: { enabled: false }, destinations: {} };
  if (!isPublicationObject(value) || !isPublicationObject(value.destinations)) return result;
  for (const [id, destination] of Object.entries(value.destinations)) {
    if (
      !/^[a-z][a-z0-9-]{0,63}$/.test(id) ||
      !isPublicationObject(destination) ||
      typeof destination.provider !== 'string' ||
      !/^[a-z][a-z0-9-]*$/.test(destination.provider)
    )
      continue;
    result.destinations[id] = {
      provider: destination.provider,
      displayName: typeof destination.displayName === 'string' ? destination.displayName.slice(0, 200) : id,
      enabled: false,
      archived: destination.archived === true,
    };
  }
  return result;
}

/** Public evidence deliberately excludes provider payloads, journals, namespaces and sealed inputs. */
export interface PublicationEvidenceSummary {
  current: boolean;
  approvalId: string;
  approvalEpoch: number;
  sourceGeneration: number;
  confirmedAt: string;
  deposit: 'confirmed';
  publication: 'confirmed' | 'unverified';
  ingestion: 'confirmed' | 'not_required';
  visibility: 'verified' | 'unverified';
  accessible?: boolean;
  embargoed?: boolean;
}
export interface PublicationLiveSummary extends IntegrationStatusSummary {
  destinationId: string;
  displayName: string;
  providerId: string;
  sourceRevision: number;
  sourceGeneration: number;
  approvalId?: string;
  approvalEpoch?: number;
  workStatus: string;
  waitingReason?: string;
  retryAt?: number;
  links: Record<string, string>;
  completion?: PublicationEvidenceSummary;
  observation?: PublicationObservation & { current: boolean };
}
export interface PublicationOperationalSignals {
  scope: 'record';
  sourceLagMs: number;
  queueLagMs: number;
  oldestPendingAgeMs: number;
  pendingDestinations: number;
  activeLeases: number;
  waiting: number;
  retrying: number;
  repairRequired: number;
  waitingReasons: Record<string, number>;
  quarantinedSaves: number;
  /** The migration journal is supplied by PUB-16; absence is unknown, never zero. */
  migrationQuarantineCount: number | null;
}

/** Reasons are machine categories, never exception messages or provider response text. */
export function publicationReason(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z][a-z0-9_:-]{0,95}$/.test(value) ? value : undefined;
}
export function publicationLinks(links: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(links)) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/i.test(key) || typeof value !== 'string' || value.length > 2048) continue;
    try {
      const url = new URL(value);
      // Signed/private URLs and embedded credentials must not enter status or ordinary audits.
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
        continue;
      safe[key] = url.href;
    } catch {
      /* An invalid provider link is evidence for operators, not a browser link. */
    }
  }
  return safe;
}
/** Narrow again at the host boundary: hook adapters cannot smuggle arbitrary fields into a response. */
function publicObservation(value: PublicationObservation): PublicationObservation {
  return {
    deposit: value.deposit === 'confirmed' ? 'confirmed' : 'unverified',
    publication: ['private', 'pending', 'published'].includes(value.publication) ? value.publication : 'unverified',
    ingestion: ['confirmed', 'pending', 'not_required'].includes(value.ingestion) ? value.ingestion : 'unverified',
    visibility: value.visibility === 'verified' ? 'verified' : 'unverified',
    ...(typeof value.accessible === 'boolean' ? { accessible: value.accessible } : {}),
    ...(typeof value.embargoed === 'boolean' ? { embargoed: value.embargoed } : {}),
  };
}
function evidenceSummary(evidence: PublicationCompletionEvidence, current: boolean): PublicationEvidenceSummary {
  return {
    current,
    approvalId: evidence.approvalId,
    approvalEpoch: evidence.approvalEpoch,
    sourceGeneration: evidence.sourceGeneration,
    confirmedAt: evidence.confirmedAt,
    deposit: 'confirmed',
    publication: evidence.deposit.publication === 'published' ? 'confirmed' : 'unverified',
    ingestion: evidence.ingestion.state,
    visibility: evidence.visibility,
    ...(typeof evidence.accessible === 'boolean' ? { accessible: evidence.accessible } : {}),
    ...(typeof evidence.embargoed === 'boolean' ? { embargoed: evidence.embargoed } : {}),
  };
}
function intentReady(state: PublicationSourceState, intent: PublicationIntent): string | undefined {
  return state.saves.find(save =>
    save.intents.some(
      item =>
        item.destinationId === intent.destinationId &&
        item.generation === intent.generation &&
        item.approvalId === intent.approvalId &&
        item.approvalEpoch === intent.approvalEpoch
    )
  )?.outcome;
}

/** Pure read projection: rendering status never imports, acknowledges, observes or wakes publication work. */
export function publicationLiveSummaries(
  state: PublicationSourceState | undefined,
  rows: PublicationSyncModel[],
  config: PublicationStatusConfiguration | undefined,
  options: {
    integrationName?: string;
    destinationId?: string;
    observations?: Record<string, PublicationObservation>;
    configurationErrors?: Record<string, string>;
  } = {}
): PublicationLiveSummary[] {
  const providers = (options.integrationName ?? '')
    .split(',')
    .map(name => name.trim().toLowerCase())
    .filter(Boolean);
  const ids = new Set([
    ...rows.map(row => row.destinationId),
    ...Object.keys(state?.intents ?? {}),
    ...(state?.preparationFailures ?? [])
      .filter(item => item.sourceRevision === state?.revision)
      .map(item => item.destinationId),
  ]);
  return [...ids].sort().flatMap(destinationId => {
    if (options.destinationId && destinationId !== options.destinationId) return [];
    const row = rows.find(item => item.destinationId === destinationId);
    const destination = config?.destinations[destinationId];
    const providerId = row?.providerId ?? destination?.provider;
    if (!providerId || (providers.length && !providers.includes(providerId.toLowerCase()))) return [];
    const intent = state?.intents[destinationId];
    const approval = state?.approvals.find(item => item.id === intent?.approvalId);
    const failure = state?.preparationFailures?.find(
      item => item.destinationId === destinationId && item.sourceRevision === state.revision
    );
    const readiness = state && intent ? intentReady(state, intent) : undefined;
    const sameRequest =
      !!row &&
      !!intent &&
      row.sourceGeneration === intent.generation &&
      row.sourceRevision === state?.revision &&
      row.sourceRevision === intent.sourceRevision &&
      row.approvalId === intent.approvalId &&
      row.approvalEpoch === intent.approvalEpoch &&
      approval?.epoch === intent.approvalEpoch &&
      approval.sourceRevision === intent.sourceRevision &&
      approval.destinationIds.includes(destinationId) &&
      approval.configurationDigests[destinationId] === row.configurationDigest &&
      approval.targetFingerprints[destinationId] === row.targetFingerprint &&
      approval.source.digest === row.source?.digest &&
      approval.source.key === row.source?.key &&
      approval.source.disk === row.source?.disk;
    const revoked = !!approval?.revokedAt || (!!intent && !!approval && approval.epoch !== intent.approvalEpoch);
    const completion = row?.completion;
    const configurationError = options.configurationErrors?.[destinationId];
    const currentCompletion =
      !!completion &&
      !row.operations.some(publicationOperationRequiresRecovery) &&
      publicationCompletionOperationsVerified(row, row.operations, completion) &&
      sameRequest &&
      !revoked &&
      !configurationError &&
      completion.approvalId === row.approvalId &&
      completion.approvalEpoch === row.approvalEpoch &&
      completion.sourceGeneration === row.sourceGeneration &&
      completion.sourceDigest === row.sourceDigest &&
      row.binding?.namespace === completion.remote.namespace &&
      row.binding.objectId === completion.remote.objectId;
    let workStatus = row?.status ?? 'queued';
    let reason = publicationReason(row?.waitingReason);
    if (failure) {
      workStatus = 'failed';
      reason = publicationReason(failure.code) ?? 'preparation_failed';
    } else if (revoked) {
      workStatus = 'revoked';
      reason = 'approval_revoked';
    } else if (intent && intent.sourceRevision !== state?.revision) {
      workStatus = 'superseded';
      reason = 'source_changed';
    } else if (intent && !sameRequest) {
      workStatus =
        readiness === 'ready'
          ? 'queued'
          : readiness === 'quarantined'
            ? 'repair_required'
            : readiness === 'abandoned'
              ? 'revoked'
              : 'waiting';
      reason =
        readiness === 'ready'
          ? 'source_import_pending'
          : readiness === 'quarantined'
            ? 'save_outcome_unverified'
            : readiness === 'abandoned'
              ? 'save_abandoned'
              : 'save_finalisation_pending';
    } else if (!sameRequest && (intent || row?.source)) {
      workStatus = 'superseded';
      reason = 'source_unavailable';
    } else if (workStatus === 'completed' && row && row.work.synchronise.requested > row.work.synchronise.processed) {
      workStatus = 'queued';
      reason = 'source_sync_pending';
    } else if (workStatus === 'completed' && !currentCompletion) {
      workStatus = 'waiting';
      reason = 'completion_unverified';
    }
    if (configurationError) {
      workStatus = 'repair_required';
      reason = publicationReason(configurationError) ?? 'configuration_unavailable';
    } else if (!config || !destination) {
      workStatus = 'repair_required';
      reason = 'configuration_unavailable';
    } else if (
      ['queued', 'running', 'waiting', 'retrying'].includes(workStatus) &&
      (!config.processing.enabled || !destination.enabled || destination.archived)
    ) {
      workStatus = 'paused';
      reason = 'processing_disabled';
    }
    const failed = ['failed', 'repair_required'].includes(workStatus);
    const success = workStatus === 'completed' && currentCompletion;
    const running = workStatus === 'running';
    const retryAt =
      sameRequest && row?.nextActionAt != null && ['retrying', 'waiting', 'queued', 'paused'].includes(workStatus)
        ? row.nextActionAt
        : undefined;
    return [
      {
        integrationName: providerId,
        providerId,
        destinationId,
        displayName: destination?.displayName ?? destinationId,
        sourceRevision: failure?.sourceRevision ?? intent?.sourceRevision ?? row?.sourceRevision ?? 0,
        sourceGeneration: intent?.generation ?? row?.sourceGeneration ?? 0,
        approvalId: intent?.approvalId ?? row?.approvalId,
        approvalEpoch: intent?.approvalEpoch ?? row?.approvalEpoch,
        workStatus,
        waitingReason: reason,
        retryAt,
        status: failed ? 'failed' : success ? 'success' : running ? 'started' : 'pending',
        startedAt: intent?.requestedAt ?? row?.audit?.startedAt ?? '',
        completedAt: success ? completion?.confirmedAt : undefined,
        traceId: row?.audit?.episodeId ?? `publication-live:${destinationId}`,
        outcome: {
          state: workStatus,
          severity: failed ? 'error' : success ? 'success' : running ? 'in-progress' : 'pending',
          labelKey: `@publication-live-${workStatus}`,
        },
        links: publicationLinks(row?.links ?? {}),
        ...(options.observations?.[destinationId]
          ? {
              observation: {
                ...publicObservation(options.observations[destinationId]),
                current: sameRequest && !revoked && !configurationError,
              },
            }
          : {}),
        ...(completion ? { completion: evidenceSummary(completion, currentCompletion) } : {}),
      } satisfies PublicationLiveSummary,
    ];
  });
}

export function publicationOperationalSignals(
  state: PublicationSourceState | undefined,
  rows: PublicationSyncModel[],
  summaries: PublicationLiveSummary[],
  now = Date.now()
): PublicationOperationalSignals {
  const selected = new Set(summaries.map(item => item.destinationId));
  const age = (value: string | number | undefined) => {
    const timestamp = typeof value === 'string' ? Date.parse(value) : value;
    return timestamp !== undefined && Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : 0;
  };
  const pending = summaries.filter(item => !['completed', 'superseded', 'revoked'].includes(item.workStatus));
  const source = Object.values(state?.intents ?? {}).filter(
    intent =>
      selected.has(intent.destinationId) &&
      intent.pending &&
      intent.sourceRevision === state?.revision &&
      intentReady(state!, intent) === 'ready' &&
      !rows.some(row => row.destinationId === intent.destinationId && row.sourceGeneration >= intent.generation)
  );
  const reasons: Record<string, number> = {};
  for (const item of pending)
    if (item.waitingReason) reasons[item.waitingReason] = (reasons[item.waitingReason] ?? 0) + 1;
  return {
    scope: 'record',
    sourceLagMs: Math.max(0, ...source.map(item => age(item.requestedAt))),
    queueLagMs: Math.max(
      0,
      ...rows
        .filter(
          row =>
            selected.has(row.destinationId) && row.nextActionAt !== null && (!row.lease || row.lease.expiresAt <= now)
        )
        .map(row => age(row.nextActionAt ?? undefined))
    ),
    oldestPendingAgeMs: Math.max(0, ...pending.map(item => age(item.startedAt))),
    pendingDestinations: pending.length,
    activeLeases: rows.filter(row => selected.has(row.destinationId) && row.lease && row.lease.expiresAt > now).length,
    waiting: summaries.filter(item => item.workStatus === 'waiting').length,
    retrying: summaries.filter(item => item.workStatus === 'retrying').length,
    repairRequired: summaries.filter(item => item.workStatus === 'repair_required').length,
    waitingReasons: reasons,
    quarantinedSaves: (state?.saves ?? []).filter(
      save => save.outcome === 'quarantined' && save.intents.some(intent => selected.has(intent.destinationId))
    ).length,
    migrationQuarantineCount: null,
  };
}
