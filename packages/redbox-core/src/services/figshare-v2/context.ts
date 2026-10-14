import { FigsharePublishingConfigData } from '../../configmodels/FigsharePublishing';
import { AnyRecord, FigshareRunContext, RecordModel, getRecordField } from './types';
import { getBrandName } from './config';

/**
 * Ambient information a binding may need that cannot be read off its evaluation
 * target. Author lookup rules, for example, evaluate against a contributor object
 * rather than the record, so the brand has to be carried alongside.
 */
export interface BindingContext {
  brandId: string;
  record: AnyRecord;
}

/**
 * Resolve the brand a record belongs to. `metaMetadata.brandId` wins; `branding`
 * is the fallback. Either may hold an ID or a name, so both are probed against
 * BrandingService before giving up and returning the raw value.
 */
export function resolveBrandId(record: RecordModel): string {
  const rawBrand = String(record?.metaMetadata?.brandId ?? (record as Record<string, unknown>)?.branding ?? '').trim();
  if (rawBrand === '') {
    return '';
  }
  const brandingService = typeof BrandingService === 'undefined' ? undefined : BrandingService;
  if (brandingService?.getBrandById?.(rawBrand)?.id != null) {
    return rawBrand;
  }
  const byName = brandingService?.getBrand?.(rawBrand);
  return byName?.id == null ? rawBrand : String(byName.id);
}

/** Build the binding context once per payload so BrandingService is hit only once. */
export function createBindingContext(record: RecordModel): BindingContext {
  return { brandId: resolveBrandId(record), record: record as AnyRecord };
}

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
