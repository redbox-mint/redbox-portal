import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { FigshareRunContext, RecordModel, getRecordField } from './types';
import { getBrandName } from './config';

function inferRecordOid(record: RecordModel, jobId?: string): string {
  const rm = record as RecordModel & { redboxOid?: unknown; id?: unknown; oid?: unknown };
  const fromRecord = String(rm.redboxOid ?? rm.id ?? rm.oid ?? '').trim();
  if (fromRecord) {
    return fromRecord;
  }
  const fromJobId = String(jobId ?? '').match(/^([^:]+):/)?.[1] ?? '';
  return fromJobId.trim();
}

export function createRunContext(record: RecordModel, config: FigsharePublishingConfigData, jobId?: string, triggerSource: string = 'manual'): FigshareRunContext {
  const rm = record as RecordModel;
  const recordOid = inferRecordOid(rm, jobId);
  const articleId = getRecordField(rm, config.record.articleIdPath);
  const correlationId = jobId || `${recordOid || 'record'}-${Date.now()}`;
  return {
    recordOid: String(recordOid),
    brandId: String(rm.metaMetadata?.brandId ?? (record as Record<string, unknown>).branding ?? 'default'),
    brandName: getBrandName(record),
    articleId: articleId == null || articleId === '' ? undefined : String(articleId),
    jobId,
    correlationId,
    triggerSource
  };
}
