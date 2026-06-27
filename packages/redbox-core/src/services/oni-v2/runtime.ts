import { Context, Effect, Layer } from 'effect';
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
import { completeOniAudit, failOniAudit, startOniAudit } from './audit';

export const OniConfigTag = Context.GenericTag<ResolvedOniPublishingConfigData>('redbox/OniConfig');
export const OniRunContextTag = Context.GenericTag<OniRunContext>('redbox/OniRunContext');
export const OniRepositoryTag = Context.GenericTag<OniOcflRepository>('redbox/OniRepository');

type OniRuntimeOptions = {
  auditContext?: IntegrationAuditContext | null;
};

export function makeRuntimeLayer(
  config: ResolvedOniPublishingConfigData,
  runContext: OniRunContext,
  repository: OniOcflRepository
) {
  return Layer.mergeAll(
    Layer.succeed(OniConfigTag, config),
    Layer.succeed(OniRunContextTag, runContext),
    Layer.succeed(OniRepositoryTag, repository)
  );
}

export async function runPublishDatasetProgram(
  input: OniPublishInput,
  config: ResolvedOniPublishingConfigData,
  runContext: OniRunContext,
  repository: OniOcflRepository,
  options: OniRuntimeOptions = {}
): Promise<OniPublishResult> {
  const program = Effect.gen(function* () {
    const resolvedConfig = yield* OniConfigTag;
    const resolvedRunContext = yield* OniRunContextTag;
    const resolvedRepository = yield* OniRepositoryTag;

    const buildAudit = startOniAudit(
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
        failOniAudit(buildAudit, error, {
          message: 'Oni RO-Crate build failed.',
          responseSummary: { phase: 'build-ro-crate', site: resolvedRunContext.siteName },
        });
        return error;
      },
    });
    completeOniAudit(buildAudit, {
      message: 'Oni RO-Crate build completed.',
      responseSummary: {
        site: resolvedRunContext.siteName,
        rootId: crate.rootId,
        attachmentCount: crate.attachments.length,
      },
    });

    const writeAudit = startOniAudit(
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
    yield* Effect.tryPromise({
      try: async () => {
        await resolvedRepository.ensureStorageRoot();
        await resolvedRepository.ensureRootCollection(
          resolvedConfig,
          resolvedConfig.sites[resolvedRunContext.siteName]
        );
        await resolvedRepository.writeDatasetObject(crate, input);
      },
      catch: error => {
        failOniAudit(writeAudit, error, {
          message: 'Oni OCFL write failed.',
          responseSummary: { phase: 'write-ocfl', site: resolvedRunContext.siteName, rootId: crate.rootId },
        });
        return error;
      },
    });
    completeOniAudit(writeAudit, {
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
  }).pipe(Effect.provide(makeRuntimeLayer(config, runContext, repository)));

  return Effect.runPromise(program);
}
