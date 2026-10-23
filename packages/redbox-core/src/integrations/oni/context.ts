import type { OniRecordModel, OniRunContext } from '../../services/oni-v2/types';

export function createRunContext(
  brandName: string,
  record: OniRecordModel,
  oid: string,
  siteName: string,
  jobId?: string,
  triggerSource: string = 'exportDataset'
): OniRunContext {
  const rawBrandId = String(record.metaMetadata?.brandId ?? record.branding ?? '').trim();
  return {
    recordOid: oid,
    brandId: rawBrandId === '' ? 'default' : rawBrandId,
    brandName,
    siteName,
    correlationId: jobId ?? `${oid}:${siteName}`,
    triggerSource,
  };
}
