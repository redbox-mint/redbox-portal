import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Logger from 'effect/Logger';
import * as References from 'effect/References';
import * as Schedule from 'effect/Schedule';
import type { IntegrationAuditContext } from '../IntegrationAuditService';
import { IntegrationAuditAction } from '../../model/storage/IntegrationAuditModel';
import type {
  OniOcflRepository,
  OniPublishInput,
  OniPublishResult,
  OniRunContext,
  ResolvedOniPublishingConfigData,
} from './types';
import { buildOniRoCrate } from './crate';
import { makeOniAuditLayer, OniAuditService, OniAuditServiceTag } from './audit';
import { runEffectProgram } from '../integration-v2/runtime';

export const OniConfigTag = Context.Service<ResolvedOniPublishingConfigData>('redbox/OniConfig');
export const OniRunContextTag = Context.Service<OniRunContext>('redbox/OniRunContext');
export const OniRepositoryTag = Context.Service<OniOcflRepository>('redbox/OniRepository');

type OniRuntimeOptions = {
  auditContext?: IntegrationAuditContext | null;
  auditService: OniAuditService;
  operationTimeoutMs?: number;
};

type OniLoggerSink = {
  debug?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};

export function makeOniLoggerLayer(logger: OniLoggerSink) {
  const effectLogger = Logger.make<unknown, void>(({ logLevel, message, fiber }) => {
    const details = fiber.getRef(References.CurrentLogAnnotations);
    const output = Object.keys(details).length === 0 ? [message] : [message, details];
    if (logLevel === 'Error' || logLevel === 'Fatal') logger.error?.(...output);
    else if (logLevel === 'Warn') logger.warn?.(...output);
    else if (logLevel === 'Debug' || logLevel === 'Trace') logger.debug?.(...output);
    else logger.info?.(...output);
  });
  return Logger.layer([effectLogger, Logger.tracerLogger]);
}

export function makeRuntimeLayer(
  config: ResolvedOniPublishingConfigData,
  runContext: OniRunContext,
  repository: OniOcflRepository
) {
  return makeRuntimeLayerWithServices(config, runContext, repository, {
    auditContext: null,
    auditService: { start: () => null, complete: () => undefined, fail: () => undefined },
  });
}

function makeRuntimeLayerWithServices(
  config: ResolvedOniPublishingConfigData,
  runContext: OniRunContext,
  repository: OniOcflRepository,
  options: OniRuntimeOptions = {
    auditService: { start: () => null, complete: () => undefined, fail: () => undefined },
  }
) {
  return Layer.mergeAll(
    Layer.succeed(OniConfigTag, config),
    Layer.succeed(OniRunContextTag, runContext),
    Layer.succeed(OniRepositoryTag, repository),
    makeOniAuditLayer(options.auditService),
    makeOniLoggerLayer(sails.log)
  );
}

export async function runPublishDatasetProgram(
  input: OniPublishInput,
  config: ResolvedOniPublishingConfigData,
  runContext: OniRunContext,
  repository: OniOcflRepository,
  options: OniRuntimeOptions = {
    auditService: { start: () => null, complete: () => undefined, fail: () => undefined },
  }
): Promise<OniPublishResult> {
  const program = Effect.gen(function* () {
    const resolvedConfig = yield* OniConfigTag;
    const resolvedRunContext = yield* OniRunContextTag;
    const resolvedRepository = yield* OniRepositoryTag;
    const audit = yield* OniAuditServiceTag;

    const buildAudit = audit.start(
      input.oid,
      IntegrationAuditAction.buildOniRoCrate,
      resolvedRunContext,
      {
        site: resolvedRunContext.siteName,
        phase: 'build-ro-crate',
      },
      options.auditContext
    );
    const crate = yield* Effect.tryPromise({
      try: () =>
        buildOniRoCrate({
          config: resolvedConfig,
          site: resolvedConfig.sites[resolvedRunContext.siteName],
          siteName: resolvedRunContext.siteName,
          oid: input.oid,
          record: input.record,
          creator: input.creator,
          approver: input.user,
        }),
      catch: error => {
        audit.fail(buildAudit, error, {
          message: 'Oni RO-Crate build failed.',
          responseSummary: { phase: 'build-ro-crate', site: resolvedRunContext.siteName },
        });
        return error;
      },
    });
    audit.complete(buildAudit, {
      message: 'Oni RO-Crate build completed.',
      responseSummary: {
        site: resolvedRunContext.siteName,
        rootId: crate.rootId,
        attachmentCount: crate.attachments.length,
      },
    });

    const writeAudit = audit.start(
      input.oid,
      IntegrationAuditAction.writeOniOcflObject,
      resolvedRunContext,
      {
        site: resolvedRunContext.siteName,
        phase: 'write-ocfl',
        rootId: crate.rootId,
      },
      options.auditContext
    );
    const writeOperation = Effect.tryPromise({
      try: async () => {
        await resolvedRepository.ensureStorageRoot();
        await resolvedRepository.ensureRootCollection(
          resolvedConfig,
          resolvedConfig.sites[resolvedRunContext.siteName]
        );
        await resolvedRepository.writeDatasetObject(crate, input);
      },
      catch: error => {
        return error;
      },
    }).pipe(
      Effect.timeout(`${options.operationTimeoutMs ?? 120_000} millis`),
      Effect.retry(Schedule.max([Schedule.exponential('100 millis'), Schedule.recurs(2)])),
      Effect.tapError(error =>
        Effect.sync(() => {
          audit.fail(writeAudit, error, {
            message: 'Oni OCFL write failed.',
            responseSummary: { phase: 'write-ocfl', site: resolvedRunContext.siteName, rootId: crate.rootId },
          });
        }).pipe(Effect.andThen(Effect.logError('Oni OCFL write failed after retries', error)))
      )
    );
    yield* writeOperation;
    audit.complete(writeAudit, {
      message: 'Oni OCFL write completed.',
      responseSummary: {
        site: resolvedRunContext.siteName,
        rootId: crate.rootId,
        attachmentCount: crate.attachments.length,
      },
    });

    return {
      ...crate,
      siteName: resolvedRunContext.siteName,
      storageDriver: resolvedConfig.sites[resolvedRunContext.siteName].storage.driver,
    };
  }).pipe(
    Effect.annotateLogs({
      integration: 'oni',
      recordOid: runContext.recordOid,
      site: runContext.siteName,
      correlationId: runContext.correlationId,
    }),
    Effect.provide(makeRuntimeLayerWithServices(config, runContext, repository, options))
  );

  return runEffectProgram(program);
}
