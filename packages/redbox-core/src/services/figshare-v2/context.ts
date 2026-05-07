import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { FigshareRunContext, RecordModel, getRecordField } from './types';
import { getBrandName } from './config';

export function createRunContext(record: RecordModel, config: FigsharePublishingConfigData, jobId?: string, triggerSource: string = 'manual'): FigshareRunContext {
  const rm = record as RecordModel;
  const recordOid = rm.redboxOid ?? rm.id ?? '';
  const articleId = getRecordField(rm, config.record.articleIdPath);
  const correlationId = jobId || `${recordOid || 'record'}-${Date.now()}`;
  return {
    recordOid: String(recordOid),
    brandName: getBrandName(record),
    articleId: articleId == null || articleId === '' ? undefined : String(articleId),
    jobId,
    correlationId,
    triggerSource
  };
}
