import _ from 'lodash';
import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { AnyRecord, FigshareRunContext, RecordLike } from './types';
import { getBrandName } from './config';

export function createRunContext(record: RecordLike, config: FigsharePublishingConfigData, jobId?: string, triggerSource: string = 'manual'): FigshareRunContext {
  const recordObj = record as AnyRecord;
  const recordOid = String(_.get(recordObj, 'oid', _.get(recordObj, 'redboxOid', '')) || '');
  const articleId = _.get(recordObj, config.record.articleIdPath);
  const correlationId = jobId || `${recordOid || 'record'}-${Date.now()}`;
  return {
    recordOid,
    brandName: getBrandName(record),
    articleId: articleId == null || articleId === '' ? undefined : String(articleId),
    jobId,
    correlationId,
    triggerSource
  };
}
