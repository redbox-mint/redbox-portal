import _ from 'lodash';
import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { AnyRecord, FigsharePublicationPlan, FigshareSyncState } from './types';
import { setSyncState } from './config';

export function getSelectedDataLocations(config: FigsharePublishingConfigData, record: AnyRecord): AnyRecord[] {
  const dataLocations = (_.get(record, config.record.dataLocationsPath, []) || []) as AnyRecord[];
  return dataLocations.filter((entry: AnyRecord) => {
    if (!_.isPlainObject(entry)) {
      return false;
    }

    if (entry.type === 'attachment') {
      return config.selection.attachmentMode === 'all' || _.get(entry, config.selection.selectedFlagPath) === true;
    }

    if (entry.type === 'url') {
      return config.selection.urlMode === 'all' || _.get(entry, config.selection.selectedFlagPath) === true;
    }

    return false;
  });
}

export function preparePublication(config: FigsharePublishingConfigData, record: AnyRecord, existingState: FigshareSyncState, correlationId: string): FigsharePublicationPlan {
  const sameJob = existingState.lockOwner === correlationId;
    if (!sameJob && (existingState.status === 'syncing' || existingState.status === 'awaiting_upload_completion')) {
      sails.log.warn(`FigService v2 - skipping duplicate sync for record ${_.get(record, 'oid', '')}`);
    return { action: 'skip', articleId: _.get(record, config.record.articleIdPath) ? String(_.get(record, config.record.articleIdPath)) : undefined, sameJob: false, syncState: existingState };
  }

  const existingArticleId = _.get(record, config.record.articleIdPath);
  const action = _.isEmpty(existingArticleId)
    ? 'create'
    : existingState.status === 'published' && (config.article.republishOnMetadataChange || config.article.republishOnAssetChange)
      ? 'republish'
      : 'update';

  const syncState: FigshareSyncState = {
    ...existingState,
    status: 'syncing',
    lockOwner: correlationId,
    correlationId,
    lastError: '',
    lastSyncAt: new Date().toISOString()
  };
  setSyncState(config, record, syncState);

  return {
    action,
    articleId: existingArticleId ? String(existingArticleId) : undefined,
    sameJob,
    syncState
  };
}
