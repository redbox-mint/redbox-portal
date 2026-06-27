import type { OniRecordModel, OniRunContext } from './types';
import { getBrandName } from './config';

export function createRunContext(
  record: OniRecordModel,
  oid: string,
  siteName: string,
  jobId?: string,
  triggerSource: string = 'exportDataset'
): OniRunContext {
  const rawBrandId = String(record.metaMetadata?.brandId ?? record.branding ?? '').trim();
  const brandId = rawBrandId === '' ? 'default' : rawBrandId;
  return {
    recordOid: oid,
    brandId,
    brandName: getBrandName(record),
    siteName,
    correlationId: jobId ?? `${oid}:${siteName}:${Date.now()}`,
    triggerSource,
  };
}
