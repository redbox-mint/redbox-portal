import _ from 'lodash';
import {
  FigsharePublishing,
  resolveFigshareConnectionToken,
  type FigshareFixtureConfig,
  type FigsharePublishingConfigData,
} from '../configmodels/FigsharePublishing';
import type { FigshareDevConfig } from '../config/figshareDev.config';
import type { FigshareSourceIntent, FigshareSyncModel } from '../model/storage/FigshareSyncModel';
import type { IntegrationStatusSummary } from './IntegrationAudits';
export interface ResolvedFigsharePublishingConfigData extends FigsharePublishingConfigData {
  processingError?: string;
  runtime: { mode: 'live' | 'fixture'; fixtures?: FigshareFixtureConfig };
}
export function legacyDelayMs(value: string): number {
  const match = /^\s*(?:in\s+)?(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|minutes?|hours?|days?|weeks?)\s*$/i.exec(
    value
  );
  if (!match)
    throw new Error(`Unsupported Figshare delay '${value}'; configure processing observationMs/cleanupMs explicitly`);
  const unit = match[2].toLowerCase();
  const multiplier =
    unit === 'ms' || unit.startsWith('millisecond')
      ? 1
      : unit.startsWith('second')
        ? 1000
        : unit.startsWith('minute')
          ? 60000
          : unit.startsWith('hour')
            ? 3600000
            : unit.startsWith('day')
              ? 86400000
              : 604800000;
  const result = Number(match[1]) * multiplier;
  if (!Number.isFinite(result) || result <= 0) throw new Error('Figshare delay must be positive');
  return result;
}

export function resolveFigsharePublishingConfigData(
  brandConfig: unknown,
  figshareDev: FigshareDevConfig,
  environment: string,
  options: { requireToken?: boolean } = {}
): ResolvedFigsharePublishingConfigData | null {
  const brandConfigRecord =
    brandConfig != null && typeof brandConfig === 'object' ? (brandConfig as Record<string, unknown>) : undefined;
  const figsharePublishing = brandConfigRecord?.figsharePublishing;
  const figsharePublishingConfig =
    figsharePublishing != null && typeof figsharePublishing === 'object'
      ? (figsharePublishing as Partial<FigsharePublishingConfigData>)
      : undefined;
  if (figsharePublishingConfig?.enabled === true) {
    const resolvedConfig = _.merge(
      new FigsharePublishing(),
      _.cloneDeep(figsharePublishingConfig)
    ) as unknown as ResolvedFigsharePublishingConfigData;
    if (resolvedConfig.processing?.enabled) {
      const errors: string[] = [];
      for (const [setting, legacy] of [
        ['observationMs', 'publishAfterUploadDelay'],
        ['cleanupMs', 'uploadedFilesCleanupDelay'],
      ] as const) {
        if (figsharePublishingConfig.processing?.[setting] != null) continue;
        try {
          resolvedConfig.processing[setting] = legacyDelayMs(resolvedConfig.queue[legacy]);
        } catch {
          errors.push(`Cannot convert queue.${legacy} to milliseconds; configure processing.${setting} explicitly.`);
        }
      }
      if (errors.length) resolvedConfig.processingError = errors.join(' ');
    }
    const useFixtureRuntime =
      environment.toLowerCase() !== 'production' && figshareDev.enabled === true && figshareDev.mode === 'fixture';
    resolvedConfig.runtime = {
      mode: useFixtureRuntime ? 'fixture' : 'live',
      fixtures: useFixtureRuntime ? _.cloneDeep(figshareDev.fixtures) : undefined,
    };
    const resolvedConnection =
      resolvedConfig.connection != null && typeof resolvedConfig.connection === 'object'
        ? resolvedConfig.connection
        : { ...new FigsharePublishing().connection };
    resolvedConfig.connection = resolvedConnection;
    const connectionToken = resolvedConfig.connection?.token;
    const allowEmpty = resolvedConfig.runtime.mode === 'fixture' || options.requireToken === false;
    if (typeof connectionToken === 'string' && connectionToken.trim() !== '') {
      resolvedConfig.connection.token = resolveFigshareConnectionToken(connectionToken, { allowEmpty });
    } else if (!allowEmpty) {
      resolvedConfig.connection.token = resolveFigshareConnectionToken('', { allowEmpty: false });
    } else if (resolvedConfig.connection != null) {
      resolvedConfig.connection.token = '';
    }

    return resolvedConfig;
  }
  return null;
}

export function summarizeFigshareStatus(
  oid: string,
  record: Record<string, unknown>,
  state: FigshareSyncModel | null | undefined,
  processingError?: string
): IntegrationStatusSummary | null {
  const intent = record.figshareSyncIntent as FigshareSourceIntent | undefined;
  const queued =
    intent?.pending && intent.readiness === 'ready' && intent.generation > (state?.importedGeneration ?? 0);
  if (!state && !queued) return null;
  const unresolvedFailure =
    state?.error?.terminal &&
    (!state.error.kind || state.error.kind === 'sync') &&
    state.work.sync.requested > state.work.sync.processed;
  const status = processingError
    ? 'configuration_error'
    : queued
      ? 'queued'
      : unresolvedFailure
        ? state.error!.category === 'repair'
          ? 'repair_required'
          : 'failed'
        : state!.status;
  const failed = ['failed', 'repair_required', 'configuration_error'].includes(status);
  const waiting = ['waiting', 'queued', 'retrying'].includes(status);
  const outcomeState = processingError
    ? 'configuration_error'
    : queued
      ? 'queued'
      : status === 'waiting'
        ? (state?.waitingReason ?? 'pending')
        : status;
  return {
    integrationName: 'figshare',
    status: failed ? 'failed' : status === 'running' ? 'started' : waiting ? 'pending' : 'success',
    startedAt: state?.audit?.startedAt ?? intent?.requestedAt ?? '',
    traceId: state?.audit?.traceId ?? `figshare-live:${oid}`,
    message: processingError ?? (failed ? state?.error?.message : undefined),
    outcome: {
      state: outcomeState,
      severity: failed ? 'error' : status === 'running' ? 'in-progress' : waiting ? 'pending' : 'success',
      labelKey: `@figshare-live-${outcomeState}`,
    },
    keyResult: {
      articleId: state?.binding?.articleId,
      publication: state?.publication,
      embargoed: state?.embargoed,
      lastObservation: state?.observedAt,
      localBytesRetained: true,
      nextCheckAt: processingError ? undefined : state?.nextActionAt,
    },
  };
}
