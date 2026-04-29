import _ from 'lodash';
import { Context, Effect, Layer } from 'effect';
import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { RBValidationError } from '../../model/RBValidationError';
import { syncAssetsPhase } from './assets';
import { ResolvedFigsharePublishingConfigData } from './config';
import { syncEmbargoPhase } from './embargo';
import { makeClientLayer, FigshareClient, FigshareClientTag } from './http';
import { buildMetadataPayload, syncMetadataPhase } from './metadata';
import { publishIfNeededPhase } from './publish';
import { writeBackPhase } from './writeback';
import { FigshareArticle, FigshareFile, FigsharePublicationPlan, FigshareRunContext, FigshareSyncState, RecordModel, getRecordField } from './types';

export const FigshareConfigTag = Context.GenericTag<ResolvedFigsharePublishingConfigData>('redbox/FigshareConfig');
export const FigshareRunContextTag = Context.GenericTag<FigshareRunContext>('redbox/FigshareRunContext');

function isCurationLocked(config: FigsharePublishingConfigData, article: FigshareArticle): boolean {
  const curationLock = config.article.curationLock;
  const statusField = curationLock?.statusField ?? '';
  const targetValue = curationLock?.targetValue ?? 'public';
  const updatesDisabled = curationLock?.enabled === true;
  if (!updatesDisabled || statusField === '') {
    return false;
  }
  return String((article as Record<string, unknown>)[statusField] ?? '') === targetValue;
}

async function listArticleFiles(client: FigshareClient, articleId: string): Promise<FigshareFile[]> {
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

async function ensureNoFileUploadInProgress(client: FigshareClient, articleId: string): Promise<void> {
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
    brandName: record.metaMetadata?.brandId ?? 'default',
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

export async function runSyncRecordProgram(config: ResolvedFigsharePublishingConfigData, runContext: FigshareRunContext, record: RecordModel, plan: FigsharePublicationPlan): Promise<RecordModel> {
  const rm = record as RecordModel;
  const program = Effect.gen(function* () {
    const client = yield* FigshareClientTag;
    let article: FigshareArticle;
    if (plan.articleId) {
      const currentArticle = yield* Effect.promise(() => client.getArticle(String(plan.articleId)));
      if (isCurationLocked(config, currentArticle)) {
        article = currentArticle;
      } else {
        yield* Effect.promise(() => ensureNoFileUploadInProgress(client, String(plan.articleId)));
        article = yield* Effect.promise(() => syncMetadataPhase(client, config, rm, plan));
      }
    } else {
      article = yield* Effect.promise(() => syncMetadataPhase(client, config, rm, plan));
    }
    const syncState = (getRecordField(rm, config.record.syncStatePath) ?? { status: 'idle' }) as FigshareSyncState;
    const assetSyncResult = yield* Effect.promise(() => syncAssetsPhase(client, config, rm, article, syncState));
    yield* Effect.promise(() => syncEmbargoPhase(client, config, rm, String(article?.id ?? plan.articleId ?? '')));
    const publishResult = yield* Effect.promise(() => publishIfNeededPhase(client, config, rm, String(article?.id ?? plan.articleId ?? ''), syncState));
    const writeBackArticle = Object.keys(publishResult).length === 0 ? article : yield* Effect.promise(() => client.getArticle(String(article?.id ?? plan.articleId ?? '')));
    return writeBackPhase(config, rm, writeBackArticle, publishResult, assetSyncResult);
  }).pipe(Effect.provide(makeRuntimeLayer(config, runContext)));

  return Effect.runPromise(program);
}
