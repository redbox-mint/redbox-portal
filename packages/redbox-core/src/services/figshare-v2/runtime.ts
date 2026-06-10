import { Context, Effect, Layer } from 'effect';
import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { RBValidationError } from '../../model/RBValidationError';
import { ResolvedFigsharePublishingConfigData, getBrandName } from './config';
import { makeClientLayer, FigshareClient, FigshareClientTag } from './http';
import { buildMetadataPayload, syncMetadataPhase } from './metadata';
import { FigshareArticle, FigshareFile, FigsharePublicationPlan, FigshareRunContext, RecordModel } from './types';

export const FigshareConfigTag = Context.GenericTag<ResolvedFigsharePublishingConfigData>('redbox/FigshareConfig');
export const FigshareRunContextTag = Context.GenericTag<FigshareRunContext>('redbox/FigshareRunContext');

export function isCurationLocked(config: FigsharePublishingConfigData, article: FigshareArticle): boolean {
  const curationLock = config.article.curationLock;
  const statusField = curationLock?.statusField ?? '';
  const targetValue = curationLock?.targetValue ?? 'public';
  const updatesDisabled = curationLock?.enabled === true;
  if (!updatesDisabled || statusField === '') {
    return false;
  }
  return String((article as Record<string, unknown>)[statusField] ?? '') === targetValue;
}

export async function listArticleFiles(client: FigshareClient, articleId: string): Promise<FigshareFile[]> {
  const files: FigshareFile[] = [];
  let page = 1;
  const pageSize = 20;
  while (true) {
    const pageResults = await client.listArticleFiles(articleId, page, pageSize);
    if (!Array.isArray(pageResults) || pageResults.length === 0) {
      break;
    }
    files.push(...pageResults);
    if (pageResults.length < pageSize) {
      break;
    }
    page++;
  }
  return files;
}

export async function ensureNoFileUploadInProgress(client: FigshareClient, articleId: string): Promise<void> {
  const files = await listArticleFiles(client, articleId);
  const inProgress = files.some((entry) => String(entry.status ?? '').toLowerCase() === 'created');
  if (inProgress) {
    throw new RBValidationError({
      message: `Figshare file uploads are still in progress for article '${articleId}'`,
      displayErrors: [{
        title: 'Figshare file uploads are still in progress',
        detail: `Figshare file uploads are still in progress for article '${articleId}'`
      }]
    });
  }
}

export function makeRuntimeLayer(config: ResolvedFigsharePublishingConfigData, runContext: FigshareRunContext) {
  return Layer.mergeAll(
    Layer.succeed(FigshareConfigTag, config),
    Layer.succeed(FigshareRunContextTag, runContext),
    makeClientLayer(config, runContext)
  );
}

export async function runBuildMetadataPayload(config: ResolvedFigsharePublishingConfigData, record: RecordModel): Promise<Record<string, unknown>> {
  const runContext: FigshareRunContext = {
    recordOid: record.redboxOid ?? record.id ?? '',
    brandName: getBrandName(record),
    correlationId: `build-${Date.now()}`,
    triggerSource: 'buildMetadataPayload'
  };
  const program = Effect.gen(function* () {
    const client = yield* FigshareClientTag;
    return yield* Effect.promise(() => buildMetadataPayload(config, record, client));
  }).pipe(Effect.provide(makeRuntimeLayer(config, runContext)));

  return Effect.runPromise(program);
}

export async function runSyncMetadataProgram(config: ResolvedFigsharePublishingConfigData, runContext: FigshareRunContext, record: RecordModel, plan: FigsharePublicationPlan): Promise<FigshareArticle> {
  const program = Effect.gen(function* () {
    const client = yield* FigshareClientTag;
    if (plan.articleId) {
      const currentArticle = yield* Effect.promise(() => client.getArticle(String(plan.articleId)));
      if (isCurationLocked(config, currentArticle)) {
        return currentArticle;
      }
      yield* Effect.promise(() => ensureNoFileUploadInProgress(client, String(plan.articleId)));
    }
    return yield* Effect.promise(() => syncMetadataPhase(client, config, record, plan));
  }).pipe(Effect.provide(makeRuntimeLayer(config, runContext)));

  return Effect.runPromise(program);
}
