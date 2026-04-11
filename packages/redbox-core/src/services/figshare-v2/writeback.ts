import _ from 'lodash';
import { FigsharePublishingConfigData, WriteBackBinding } from '../../configmodels/FigsharePublishing';
import {
  RecordModel,
  FigshareArticle,
  FigsharePublishResult,
  AssetSyncResult,
  FigshareSyncState,
  getRecordField,
  setRecordField,
} from './types';
import { setSyncState } from './config';

export function getWriteBackUrls(config: FigsharePublishingConfigData, articleId: string): string[] {
  const frontEndUrl = config.connection.frontEndUrl.replace(/\/+$/, '');
  return [`${frontEndUrl}/articles/${articleId}`];
}

export function writeBackPhase(config: FigsharePublishingConfigData, record: RecordModel, article: FigshareArticle, publishResult?: FigsharePublishResult, assetSyncResult?: AssetSyncResult): RecordModel {
  const rm = record as RecordModel;
  const articleId = String(article?.id ?? publishResult?.id ?? getRecordField(rm, config.record.articleIdPath) ?? '');

  setRecordField(rm, config.writeBack.articleId, articleId);
  const articleUrls = getWriteBackUrls(config, articleId);
  config.writeBack.articleUrls.forEach((targetPath: string, index: number) => {
    setRecordField(rm, targetPath, articleUrls[index] ?? articleUrls[0]);
  });
  config.writeBack.extraFields.forEach((binding: WriteBackBinding) => {
    const source = binding.from === 'publishResult' ? publishResult : binding.from === 'assetSyncResult' ? assetSyncResult : article;
    setRecordField(rm, binding.targetPath, _.get(source, binding.sourcePath));
  });

  const syncState = (getRecordField(rm, config.record.syncStatePath) ?? { status: 'idle' }) as FigshareSyncState;
  const hasPublishResult = publishResult != null && typeof publishResult === 'object' && Object.keys(publishResult).length > 0;
  syncState.status = hasPublishResult ? 'published' : syncState.status === 'awaiting_upload_completion' ? 'awaiting_upload_completion' : 'syncing';
  syncState.lastError = '';
  syncState.partialProgress = {
    ...(syncState.partialProgress || {}),
    articleId
  };
  setSyncState(config, rm, syncState);
  return record;
}
