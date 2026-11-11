import type { AppConfigs } from '../../configuration/AppConfigs';
import type { I18nEntries } from '../../translations/I18nEntries';
import type { Forms } from '../../forms/Forms';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { ListAPIResponse } from '../../model/ListAPIResponse';
import type { ValidatedApiRouteRequest } from '../../api-routes/validation';
import {
  referenceValue as singleHttpResult,
  referenceData,
  referenceErrors,
  jsonResult,
  type ReferenceRequest,
  type ReferenceResult,
} from './reference';
export interface ConfigurationReadInput {
  readonly appConfigs: Pick<AppConfigs, 'getAppConfigByBrandAndKey' | 'hasConfigOverride' | 'getAppConfigForm'>;
  readonly translations: Pick<I18nEntries, 'listEntries' | 'getEntry' | 'getBundle'>;
  readonly forms: Pick<Forms, 'listForms' | 'getFormByName' | 'toPublicForm' | 'discoverValidationOperations'>;
  readonly loadRecord: import('../../forms/RecordValidation').RecordValidationServiceDependencies['loadRecord'];
}
export async function getAppConfig(
  input: Pick<ConfigurationReadInput, 'appConfigs'>,
  req: ReferenceRequest,
  validated: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { brand: snapshot } = req.context;
  const brand = Object.assign(new BrandingModel(), snapshot);
  const { params } = validated;
  const key = String(params.appConfigId);
  const value = await input.appConfigs.getAppConfigByBrandAndKey(brand.id, key);
  const overridden = await input.appConfigs.hasConfigOverride(brand.id, key);
  return referenceData(req, value, { 'X-ReDBox-Config-Source': overridden ? 'override' : 'default' });
}
export async function listEntries(
  input: Pick<ConfigurationReadInput, 'translations'>,
  req: ReferenceRequest,
  validated: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { brand: snapshot } = req.context;
  const brand = Object.assign(new BrandingModel(), snapshot);
  const { query } = validated;
  return referenceData(
    req,
    await input.translations.listEntries(
      brand,
      query.locale as string,
      (query.namespace as string) || 'translation',
      query.keyPrefix as string | undefined
    )
  );
}
export async function getEntry(
  input: Pick<ConfigurationReadInput, 'translations'>,
  req: ReferenceRequest,
  validated: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { brand: snapshot } = req.context;
  const brand = Object.assign(new BrandingModel(), snapshot);
  const { params } = validated;
  const value = await input.translations.getEntry(
    brand,
    String(params.locale),
    String(params.namespace) || 'translation',
    String(params.key)
  );
  if (!value) return referenceErrors(req, 404, [{ title: 'Entry not found' }]);
  else return referenceData(req, value);
}
export async function getBundle(
  input: Pick<ConfigurationReadInput, 'translations'>,
  req: ReferenceRequest,
  validated: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { brand: snapshot } = req.context;
  const brand = Object.assign(new BrandingModel(), snapshot);
  const { params } = validated;
  const value = await input.translations.getBundle(
    brand,
    String(params.locale),
    String(params.namespace) || 'translation'
  );
  if (!value) return referenceErrors(req, 404, [{ title: 'Bundle not found' }]);
  else return referenceData(req, value);
}
export async function listForms(
  input: Pick<ConfigurationReadInput, 'forms'>,
  req: ReferenceRequest,
  validated: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { brand: snapshot } = req.context;
  const brand = Object.assign(new BrandingModel(), snapshot);
  const forms = await singleHttpResult(input.forms.listForms(brand.id));
  const result = new ListAPIResponse();
  result.summary.numFound = forms.length;
  result.records = forms.map(form => input.forms.toPublicForm(form));
  return referenceData(req, result);
}
export async function getForm(
  input: Pick<ConfigurationReadInput, 'forms' | 'loadRecord'>,
  req: ReferenceRequest,
  validated: ValidatedApiRouteRequest
): Promise<ReferenceResult> {
  const { brand: snapshot, actor } = req.context;
  const brand = Object.assign(new BrandingModel(), snapshot);
  const { query } = validated;
  const editable = query.editable !== 'false';
  const form = await singleHttpResult(input.forms.getFormByName(String(query.name), editable, brand.id));
  if (!form) {
    return referenceErrors(req, 404, [{ title: 'Form not found' }]);
  }
  const oid = typeof query.oid === 'string' ? query.oid.trim() : '';
  let record: Awaited<ReturnType<typeof input.loadRecord>> = null;
  let resolved = !oid;
  if (oid) {
    try {
      const loaded = await input.loadRecord(oid);
      if (String((loaded?.metaMetadata as Record<string, unknown> | undefined)?.brandId ?? '').trim() === brand.id) {
        record = loaded;
        resolved = true;
      }
    } catch {
      /* Legacy discovery fails closed when record context cannot be loaded. */
    }
  }
  const operations = resolved
    ? await input.forms.discoverValidationOperations({
        brand,
        form,
        recordType: record
          ? String((record.metaMetadata as Record<string, unknown> | undefined)?.type ?? '')
          : String(query.recordType || form.configuration?.type || '').trim(),
        record,
        user: actor ? { ...actor, roles: [...actor.roles] } : undefined,
        editable,
        targetStep: typeof query.targetStep === 'string' ? query.targetStep.trim() : undefined,
      })
    : [];
  return referenceData(req, input.forms.toPublicForm(form, operations));
}
export async function getAppConfigForm(
  input: Pick<ConfigurationReadInput, 'appConfigs'>,
  req: ReferenceRequest
): Promise<ReferenceResult> {
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  const id = req.params.appConfigId;
  if (typeof id !== 'string' || !id.trim()) return referenceErrors(req, 400, [{ detail: 'appConfigId is required' }]);
  return jsonResult(await input.appConfigs.getAppConfigForm(brand, id));
}
