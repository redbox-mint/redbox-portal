import _ from 'lodash';
import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { FigshareClient } from './http';
import { AnyRecord, FigshareSyncState } from './types';
import { setSyncState } from './config';

export async function publishIfNeededPhase(client: FigshareClient, config: FigsharePublishingConfigData, record: AnyRecord, articleId: string, syncState: FigshareSyncState): Promise<AnyRecord> {
  if (config.article.publishMode === 'manual') {
    return {};
  }

  const attachmentCount = _.toNumber(_.get(syncState, 'partialProgress.attachmentCount', 0));
  const uploadsComplete = _.get(syncState, 'partialProgress.uploadsComplete', false) === true;
  if (attachmentCount > 0 && config.article.publishMode === 'afterUploadsComplete') {
    syncState.status = 'awaiting_upload_completion';
    setSyncState(config, record, syncState);
    if (!uploadsComplete) {
      return {};
    }
  }

  return client.publishArticle(articleId, {});
}
