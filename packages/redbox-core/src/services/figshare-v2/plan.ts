import _ from 'lodash';
import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { RecordModel, FigsharePublicationPlan, FigshareSyncState, DataLocationEntry, getRecordField } from './types';

export function getSelectedDataLocations(config: FigsharePublishingConfigData, record: RecordModel): DataLocationEntry[] {
  const dataLocations = (getRecordField(record, config.record.dataLocationsPath) ?? []) as DataLocationEntry[];
  return dataLocations.filter((entry) => {
    if (entry == null || typeof entry !== 'object') {
      return false;
    }

    if (entry.type === 'attachment' || typeof entry.figshareReceipt === 'string') {
      return config.selection.attachmentMode === 'all' || entry[config.selection.selectedFlagPath] === true;
    }

    if (entry.type === 'url') {
      return config.selection.urlMode === 'all' || entry[config.selection.selectedFlagPath] === true;
    }

    return false;
  });
}

export function preparePublication(config: FigsharePublishingConfigData, record: RecordModel, existingState: FigshareSyncState, correlationId: string): FigsharePublicationPlan {
  const sameJob = existingState.lockOwner === correlationId;
  const existingArticleId = getRecordField(record, config.record.articleIdPath);
  const hasArticleId = existingArticleId != null && existingArticleId !== '';
  const action = !hasArticleId
    ? 'create'
    : existingState.status === 'published' && (config.article.republishOnMetadataChange || config.article.republishOnAssetChange)
      ? 'republish'
      : 'update';

  const syncState: FigshareSyncState = {
    ...existingState,
    status: 'syncing',

    correlationId,
    lastError: '',
    lastSyncAt: new Date().toISOString()
  };


  return {
    action,
    articleId: hasArticleId ? String(existingArticleId) : undefined,
    sameJob,
    syncState
  };
}
