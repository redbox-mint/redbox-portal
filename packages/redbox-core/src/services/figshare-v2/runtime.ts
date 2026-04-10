import _ from 'lodash';
import { Context, Effect, Layer } from 'effect';
import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { RBValidationError } from '../../model/RBValidationError';
import { syncAssetsPhase } from './assets';
import { syncEmbargoPhase } from './embargo';
import { makeClientLayer, FigshareClient, FigshareClientTag } from './http';
import { buildMetadataPayload, syncMetadataPhase } from './metadata';
import { publishIfNeededPhase } from './publish';
import { writeBackPhase } from './writeback';
import { AnyRecord, FigsharePublicationPlan, FigshareRunContext, RecordLike } from './types';

export const FigshareConfigTag = Context.GenericTag<FigsharePublishingConfigData>('redbox/FigshareConfig');
export const FigshareRunContextTag = Context.GenericTag<FigshareRunContext>('redbox/FigshareRunContext');

function isCurationLocked(config: FigsharePublishingConfigData, article: AnyRecord): boolean {
  const statusField = String(
    _.get(config, 'article.curationLock.statusField', '') ||
    _.get(sails.config, 'figshareAPI.mapping.figshareCurationStatus', '')
  );
  const targetValue = String(
    _.get(config, 'article.curationLock.targetValue', 'public') ||
    _.get(sails.config, 'figshareAPI.mapping.figshareCurationStatusTargetValue', 'public')
  );
  const updatesDisabled = _.get(config, 'article.curationLock.enabled') === true ||
    _.get(sails.config, 'figshareAPI.mapping.figshareDisableUpdateByCurationStatus', false) === true;
  if (!updatesDisabled || statusField === '') {
    return false;
  }
  return String(_.get(article, statusField, '')) === targetValue;
}

async function listArticleFiles(client: FigshareClient, articleId: string): Promise<AnyRecord[]> {
  const files: AnyRecord[] = [];
  let page = 1;
  const pageSize = 20;
  while (true) {
    const pageResults = await client.listArticleFiles(articleId, page, pageSize);
    if (!_.isArray(pageResults) || pageResults.length === 0) {
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
  const inProgress = files.some((entry: AnyRecord) => String(_.get(entry, 'status', '')).toLowerCase() === 'created');
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

export function makeRuntimeLayer(config: FigsharePublishingConfigData, runContext: FigshareRunContext) {
  return Layer.mergeAll(
    Layer.succeed(FigshareConfigTag, config),
    Layer.succeed(FigshareRunContextTag, runContext),
    makeClientLayer(config, runContext)
  );
}

export async function runBuildMetadataPayload(config: FigsharePublishingConfigData, record: AnyRecord): Promise<AnyRecord> {
  const runContext: FigshareRunContext = {
    recordOid: String(_.get(record, 'redboxOid', _.get(record, 'oid', ''))),
    brandName: String(_.get(record, 'metaMetadata.branding', _.get(record, 'branding', 'default'))),
    correlationId: `build-${Date.now()}`,
    triggerSource: 'buildMetadataPayload'
  };
  const program = Effect.gen(function* () {
    const client = yield* FigshareClientTag;
    return yield* Effect.promise(() => buildMetadataPayload(config, record, client));
  }).pipe(Effect.provide(makeRuntimeLayer(config, runContext)));

  return Effect.runPromise(program);
}

export async function runSyncMetadataProgram(config: FigsharePublishingConfigData, runContext: FigshareRunContext, record: AnyRecord, plan: FigsharePublicationPlan): Promise<AnyRecord> {
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

export async function runSyncRecordProgram(config: FigsharePublishingConfigData, runContext: FigshareRunContext, record: RecordLike, plan: FigsharePublicationPlan): Promise<RecordLike> {
  const recordObj = record as AnyRecord;
  const program = Effect.gen(function* () {
    const client = yield* FigshareClientTag;
    let article: AnyRecord;
    if (plan.articleId) {
      const currentArticle = yield* Effect.promise(() => client.getArticle(String(plan.articleId)));
      if (isCurationLocked(config, currentArticle)) {
        article = currentArticle;
      } else {
        yield* Effect.promise(() => ensureNoFileUploadInProgress(client, String(plan.articleId)));
        article = yield* Effect.promise(() => syncMetadataPhase(client, config, recordObj, plan));
      }
    } else {
      article = yield* Effect.promise(() => syncMetadataPhase(client, config, recordObj, plan));
    }
    const syncState = (_.get(recordObj, config.record.syncStatePath, { status: 'idle' }) || { status: 'idle' }) as any;
    const assetSyncResult = yield* Effect.promise(() => syncAssetsPhase(client, config, recordObj, article, syncState));
    yield* Effect.promise(() => syncEmbargoPhase(client, config, recordObj, String(article?.id ?? plan.articleId ?? '')));
    const publishResult = yield* Effect.promise(() => publishIfNeededPhase(client, config, recordObj, String(article?.id ?? plan.articleId ?? ''), syncState));
    const writeBackArticle = _.isEmpty(publishResult) ? article : yield* Effect.promise(() => client.getArticle(String(article?.id ?? plan.articleId ?? '')));
    return writeBackPhase(config, recordObj, writeBackArticle, publishResult, assetSyncResult);
  }).pipe(Effect.provide(makeRuntimeLayer(config, runContext)));

  return Effect.runPromise(program);
}
