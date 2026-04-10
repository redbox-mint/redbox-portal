import _ from 'lodash';
import { FigsharePublishingConfigData, WriteBackBinding } from '../../configmodels/FigsharePublishing';
import { AnyRecord, RecordLike } from './types';
import { setSyncState } from './config';

export function getWriteBackUrls(config: FigsharePublishingConfigData, articleId: string): string[] {
  const frontEndUrl = config.connection.frontEndUrl.replace(/\/+$/, '');
  return [`${frontEndUrl}/articles/${articleId}`];
}

export function writeBackPhase(config: FigsharePublishingConfigData, record: RecordLike, article: AnyRecord, publishResult?: AnyRecord, assetSyncResult?: AnyRecord): RecordLike {
  const recordObj = record as AnyRecord;
  const articleId = String(article?.id ?? publishResult?.id ?? _.get(recordObj, config.record.articleIdPath, ''));

  _.set(recordObj, config.writeBack.articleId, articleId);
  const articleUrls = getWriteBackUrls(config, articleId);
  config.writeBack.articleUrls.forEach((targetPath: string, index: number) => {
    _.set(recordObj, targetPath, articleUrls[index] ?? articleUrls[0]);
  });
  config.writeBack.extraFields.forEach((binding: WriteBackBinding) => {
    const source = binding.from === 'publishResult' ? publishResult : binding.from === 'assetSyncResult' ? assetSyncResult : article;
    _.set(recordObj, binding.targetPath, _.get(source, binding.sourcePath));
  });

  const syncState = (_.get(recordObj, config.record.syncStatePath, { status: 'idle' }) || {}) as AnyRecord;
  const hasPublishResult = _.isPlainObject(publishResult) ? !_.isEmpty(publishResult) : !_.isNil(publishResult);
  syncState.status = hasPublishResult ? 'published' : syncState.status === 'awaiting_upload_completion' ? 'awaiting_upload_completion' : 'syncing';
  syncState.lastError = '';
  syncState.partialProgress = {
    ...(syncState.partialProgress || {}),
    articleId
  };
  setSyncState(config, recordObj, syncState);
  return record;
}
