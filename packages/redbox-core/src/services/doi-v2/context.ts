import type { DoiProfile } from '../../configmodels/DoiPublishing';
import type { DoiRecordModel, DoiRunContext, DoiRelatedOptions } from './types';
import type { RecordModel } from '../../model';
import { resolveDoiPublishingBrand } from './config';

export function createRunContext(
  record: DoiRecordModel,
  profileName?: string,
  jobId?: string,
  triggerSource: string = 'manual'
): DoiRunContext {
  const recordOid = String(record.redboxOid ?? record.id ?? '');
  const brandId = record.metaMetadata?.brandId ?? record.branding ?? 'default';
  return {
    recordOid,
    brandId,
    correlationId: jobId ?? `${recordOid || 'record'}-${Date.now()}`,
    triggerSource,
    jobId,
    profileName
  };
}

export function createBindingContext(record: DoiRecordModel, oid: string, profile: DoiProfile) {
  return {
    record,
    oid,
    profile,
    now: new Date().toISOString(),
    helpers: {
      mapSubjectEntries(items: unknown) {
        if (!Array.isArray(items)) {
          return [];
        }
        return items
          .filter((item): item is Record<string, unknown> => item != null && typeof item === 'object')
          .map(item => ({
            subject: String(item['name'] ?? item['subject'] ?? '').trim(),
            schemeUri: String(item['schemeUri'] ?? 'https://www.abs.gov.au/ausstats/abs@.nsf/0'),
            subjectScheme: String(item['subjectScheme'] ?? 'Australian and New Zealand Standard Research Classification (ANZSRC) 2020: Fields of Research (FoR) codes'),
            classificationCode: String(item['notation'] ?? item['classificationCode'] ?? '').trim()
          }))
          .filter(item => item.subject !== '');
      }
    }
  };
}

/** Resolve once per operation against the supplied candidate, including unsaved references. */
export async function createDoiMappingRecord(record: DoiRecordModel, options: DoiRelatedOptions): Promise<DoiRecordModel> {
  if (options.relatedMetadata == null) {
    return record;
  }
  if (!options.user?.username) {
    throw new Error('DOI related metadata requires an effective source-read user');
  }
  return RecordsService.enrichWithRelatedMetadata(record as unknown as RecordModel, {
    brand: resolveDoiPublishingBrand(record),
    user: options.user,
    audience: 'service',
    serviceId: 'DoiService',
  }, options.relatedMetadata) as unknown as Promise<DoiRecordModel>;
}
