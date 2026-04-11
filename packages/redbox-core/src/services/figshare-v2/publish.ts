import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { FigshareClient } from './http';
import { RecordModel, FigshareSyncState, FigsharePublishResult } from './types';
import { setSyncState } from './config';

export async function publishIfNeededPhase(client: FigshareClient, config: FigsharePublishingConfigData, record: RecordModel, articleId: string, syncState: FigshareSyncState): Promise<FigsharePublishResult> {
  if (config.article.publishMode === 'manual') {
    return {};
  }

  const attachmentCount = Number(syncState.partialProgress?.attachmentCount ?? 0);
  const uploadsComplete = syncState.partialProgress?.uploadsComplete === true;
  if (attachmentCount > 0 && config.article.publishMode === 'afterUploadsComplete') {
    syncState.status = 'awaiting_upload_completion';
    setSyncState(config, record, syncState);
    if (!uploadsComplete) {
      return {};
    }
  }

  return client.publishArticle(articleId, {});
}
