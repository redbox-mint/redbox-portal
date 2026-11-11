import _ from 'lodash';
import type { RecordTypes } from '../../recordTypes';
import type { Services as WorkflowServices } from '../../workflows/WorkflowSteps';
import type { Services as WorkspaceServices } from '../../workspaces/WorkspaceTypes';
import type { Services as DashboardServices } from '../../dashboards/DashboardTypes';
import { Services as DashboardConfiguration } from '../../dashboards/DashboardConfig';
import type { I18nEntries } from '../../translations/I18nEntries';
import { RecordTypeResponseModel } from '../../model/RecordTypeResponseModel';
import { DashboardTypeResponseModel } from '../../model/DashboardTypeResponseModel';
import { DashboardViewResponseModel } from '../../model/DashboardViewResponseModel';
import { BrandingModel } from '../../model/storage/BrandingModel';
import type { RecordTypeModel } from '../../model/storage/RecordTypeModel';
import { normalizeRecordRelations } from '../../config/recordtype.config';
import { apiNoCacheHeaders } from '../apiResponses';
import {
  referenceValue as singleHttpResult,
  referenceScalar,
  referenceData,
  referenceErrors,
  jsonResult,
  MetadataParameterError,
  type ReferenceRequest,
  type ReferenceResult,
} from './reference';
export interface MetadataReadInput {
  readonly recordTypes: Pick<RecordTypes, 'get' | 'getAll'>;
  readonly workflowSteps: Pick<WorkflowServices.WorkflowSteps, 'getAllForRecordType'>;
  readonly workspaceTypes: Pick<WorkspaceServices.WorkspaceTypes, 'get' | 'getOne'>;
  readonly dashboardTypes: Pick<
    DashboardServices.DashboardTypes,
    'get' | 'getAll' | 'getDashboardTableConfig' | 'getDashboardView'
  >;
  readonly dashboardConfig: Pick<
    DashboardConfiguration.DashboardConfig,
    | 'getDashboardContext'
    | 'getRuntimeSettings'
    | 'getTargetCatalogue'
    | 'getTargetSettings'
    | 'getFieldCatalogue'
    | 'preflightLegacyMigration'
  >;
  readonly translations: Pick<I18nEntries, 'getNamespace' | 'listLanguages' | 'listEntries' | 'getBundle'>;
}
function recordTypeResponse(
  type:
    | (RecordTypeModel & {
        name?: string;
        id?: string;
      })
    | null
): RecordTypeResponseModel {
  return new RecordTypeResponseModel(
    type?.name,
    type?.packageType,
    type?.searchFilters ?? [],
    type?.searchable,
    normalizeRecordRelations(type?.name ?? type?.id ?? '', type?.relatedTo),
    type?.concurrentModification
  );
}
function dashboardOptions(req: ReferenceRequest): DashboardConfiguration.DashboardCallerOptions {
  const { actor, portal } = req.context;
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  return actor
    ? {
        caller: {
          brand,
          user: {
            ...actor,
            type: actor.type ?? '',
            name: actor.name ?? '',
            email: actor.email ?? '',
            roles: actor.roles.map(role => ({ ...role, name: role.name ?? '' })),
          },
        },
        portal,
      }
    : {};
}
export async function dashboardTypeResponse(
  input: Pick<MetadataReadInput, 'dashboardTypes' | 'dashboardConfig'>,
  brand: BrandingModel,
  name: string
) {
  const type = await singleHttpResult(input.dashboardTypes.get(brand, name));
  return new DashboardTypeResponseModel({
    name,
    description: type?.description,
    formatRules: { ...(await input.dashboardConfig.getDashboardContext(brand, name)) },
    searchable: type?.searchable,
    system: type?.system,
  });
}
export function retiredDashboardOperation(): never {
  throw new DashboardConfiguration.DashboardConfigError(
    'legacy-operation-retired',
    'This dashboard configuration operation has been retired. Dashboard profiles, defaults and overrides were replaced by independent settings for each workflow stage and dashboard-view step. Use GET /api/dashboard-config/targets, GET|PUT /api/dashboard-config/workflows/:recordType/:stage, GET|PUT /api/dashboard-config/views/:view/:step and the /api/dashboard-config/copy operations.',
    { replacement: '/api/dashboard-config/targets' }
  );
}
export async function getType(
  input: Pick<MetadataReadInput, 'recordTypes'>,
  req: ReferenceRequest
): Promise<ReferenceResult> {
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  const scalar = (name: string, fallback = '') => referenceScalar(req, name, fallback);
  const result = recordTypeResponse(await singleHttpResult(input.recordTypes.get(brand, scalar('recordType'))));
  return referenceData(req, result);
}
export async function getAllTypes(
  input: Pick<MetadataReadInput, 'recordTypes'>,
  req: ReferenceRequest
): Promise<ReferenceResult> {
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  const result = (await singleHttpResult(input.recordTypes.getAll(brand))).map(recordTypeResponse);
  return referenceData(req, result);
}
export async function getWorkflowSteps(
  input: Pick<MetadataReadInput, 'dashboardTypes' | 'recordTypes' | 'workflowSteps'>,
  req: ReferenceRequest
): Promise<ReferenceResult> {
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  const scalar = (name: string, fallback = '') => referenceScalar(req, name, fallback);
  const name = scalar('recordType');
  const type = await singleHttpResult(input.recordTypes.get(brand, name));
  if (!type) {
    return referenceErrors(req, 400, [{ detail: 'Record Type provided is not valid' }]);
  }
  const steps = _.cloneDeep(await singleHttpResult(input.workflowSteps.getAllForRecordType(type)));
  for (const step of steps) {
    const stage = String(_.get(step, 'config.workflow.stage', step.name));
    const table = await input.dashboardTypes.getDashboardTableConfig(brand, name, stage);
    if (table != null) _.set(step, 'config.dashboard.table', table);
  }
  const result = steps;
  return referenceData(req, result);
}
export async function get(
  input: Pick<MetadataReadInput, 'workspaceTypes'>,
  req: ReferenceRequest
): Promise<ReferenceResult> {
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  let result: unknown;
  try {
    result = { status: true, workspaceTypes: await singleHttpResult(input.workspaceTypes.get(brand)) };
  } catch {
    result = 'Cannot get workspace types';
  }
  return referenceData(req, result);
}
export async function getOne(
  input: Pick<MetadataReadInput, 'workspaceTypes'>,
  req: ReferenceRequest
): Promise<ReferenceResult> {
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  const scalar = (name: string, fallback = '') => referenceScalar(req, name, fallback);
  let result: unknown;
  try {
    result = {
      status: true,
      workspaceType: await singleHttpResult(input.workspaceTypes.getOne(brand, scalar('name'))),
    };
  } catch {
    result = 'Cannot get workspace types';
  }
  return referenceData(req, result);
}
export async function getAllDashboardTypes(
  input: Pick<MetadataReadInput, 'dashboardConfig' | 'dashboardTypes'>,
  req: ReferenceRequest
): Promise<ReferenceResult> {
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  const types = await singleHttpResult(input.dashboardTypes.getAll(brand));
  const models = [];
  for (const type of types) models.push(await dashboardTypeResponse(input, brand, type.name));
  const result = { dashboardTypes: models };
  return referenceData(req, result);
}
export async function getDashboardType(
  input: Pick<MetadataReadInput, 'dashboardConfig' | 'dashboardTypes'>,
  req: ReferenceRequest
): Promise<ReferenceResult> {
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  const scalar = (name: string, fallback = '') => referenceScalar(req, name, fallback);
  const result = await dashboardTypeResponse(input, brand, scalar('dashboardType'));
  return referenceData(req, result);
}
export async function getDashboardWorkflowSettings(
  input: Pick<MetadataReadInput, 'dashboardConfig'>,
  req: ReferenceRequest
): Promise<ReferenceResult> {
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  const scalar = (name: string, fallback = '') => referenceScalar(req, name, fallback);
  const result = await input.dashboardConfig.getRuntimeSettings(brand, 'workflow', scalar('recordType'));
  return referenceData(req, result);
}
export async function getDashboardViewSettings(
  input: Pick<MetadataReadInput, 'dashboardConfig' | 'dashboardTypes'>,
  req: ReferenceRequest
): Promise<ReferenceResult> {
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  const scalar = (name: string, fallback = '') => referenceScalar(req, name, fallback);
  const view = input.dashboardTypes.getDashboardView(scalar('dashboardView'));
  if (
    !view?.name ||
    !view.titleLabelKey ||
    !view.dashboardType ||
    !view.sourceRecordType ||
    !view.steps?.length ||
    view.steps.some(
      step => !step.name || !step.sourceRecordType || !['allForRecordType', 'workflowStage'].includes(step.fetchMode)
    )
  ) {
    return referenceErrors(req, 404, [{ detail: 'Dashboard view provided is not valid' }]);
  }
  const result = await input.dashboardConfig.getRuntimeSettings(brand, 'view', scalar('dashboardView'));
  return referenceData(req, result);
}
export async function getDashboardView(
  input: Pick<MetadataReadInput, 'dashboardTypes'>,
  req: ReferenceRequest
): Promise<ReferenceResult> {
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  const scalar = (name: string, fallback = '') => referenceScalar(req, name, fallback);
  const view = input.dashboardTypes.getDashboardView(scalar('dashboardView'));
  if (
    !view?.name ||
    !view.titleLabelKey ||
    !view.dashboardType ||
    !view.sourceRecordType ||
    !view.steps?.length ||
    view.steps.some(
      step => !step.name || !step.sourceRecordType || !['allForRecordType', 'workflowStage'].includes(step.fetchMode)
    )
  ) {
    return referenceErrors(req, 404, [{ detail: 'Dashboard view provided is not valid' }]);
  }
  const result = new DashboardViewResponseModel(view);
  return referenceData(req, result);
}
export async function getNamespace(
  input: Pick<MetadataReadInput, 'translations'>,
  req: ReferenceRequest
): Promise<ReferenceResult> {
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  const scalar = (name: string, fallback = '') => referenceScalar(req, name, fallback);
  const chronicle = req.observe ? { addInfo: req.observe } : undefined;
  chronicle?.addInfo({ translationLng: scalar('lng'), translationNamespace: scalar('ns', 'translation') });
  const data = await input.translations.getNamespace(brand, scalar('lng'), scalar('ns', 'translation'), observation => {
    if (observation.kind === 'resolved')
      chronicle?.addInfo({ translationRemoveMetaSuccess: observation.metadataRemoved });
  });
  return data === null ? jsonResult({ message: 'Namespace not found' }, 404) : jsonResult(data, 200, apiNoCacheHeaders);
}
export async function getLanguages(
  input: Pick<MetadataReadInput, 'translations'>,
  req: ReferenceRequest
): Promise<ReferenceResult> {
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  return jsonResult(await input.translations.listLanguages(brand), 200, apiNoCacheHeaders);
}
export async function listEntriesApp(
  input: Pick<MetadataReadInput, 'translations'>,
  req: ReferenceRequest
): Promise<ReferenceResult> {
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  const { locale, namespace, keyPrefix } = req.query;
  for (const [name, value] of Object.entries({ locale, namespace, keyPrefix }))
    if (value !== undefined && (typeof value !== 'string' || [...value].some(c => c.charCodeAt(0) < 32)))
      throw new MetadataParameterError('Invalid ' + name);
  return jsonResult(
    await input.translations.listEntries(
      brand,
      // The legacy list endpoint permits an omitted locale (all locales).
      locale as string,
      (namespace as string) || 'translation',
      keyPrefix as string | undefined
    ),
    200,
    apiNoCacheHeaders
  );
}
export async function getBundleApp(
  input: Pick<MetadataReadInput, 'translations'>,
  req: ReferenceRequest
): Promise<ReferenceResult> {
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  const scalar = (name: string, fallback = '') => referenceScalar(req, name, fallback);
  const bundle = await input.translations.getBundle(brand, scalar('locale'), scalar('namespace', 'translation'));
  return !bundle ? jsonResult({ message: 'Bundle not found' }, 404) : jsonResult(bundle, 200, apiNoCacheHeaders);
}
export async function listTargets(
  input: Pick<MetadataReadInput, 'dashboardConfig'>,
  req: ReferenceRequest
): Promise<ReferenceResult> {
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  const catalogue = await input.dashboardConfig.getTargetCatalogue(brand);
  const result = { targets: catalogue.targets, catalogueFingerprint: catalogue.fingerprint };
  return referenceData(req, result);
}
export async function getWorkflowTarget(
  input: Pick<MetadataReadInput, 'dashboardConfig'>,
  req: ReferenceRequest
): Promise<ReferenceResult> {
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  const scalar = (name: string, fallback = '') => referenceScalar(req, name, fallback);
  const result = await input.dashboardConfig.getTargetSettings(brand, {
    kind: 'workflow',
    recordType: scalar('recordType'),
    stage: scalar('stage'),
  });
  return referenceData(req, result);
}
export async function getViewTarget(
  input: Pick<MetadataReadInput, 'dashboardConfig'>,
  req: ReferenceRequest
): Promise<ReferenceResult> {
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  const scalar = (name: string, fallback = '') => referenceScalar(req, name, fallback);
  const result = await input.dashboardConfig.getTargetSettings(brand, {
    kind: 'view',
    view: scalar('view'),
    step: scalar('step'),
  });
  return referenceData(req, result);
}
export async function getWorkflowFields(
  input: Pick<MetadataReadInput, 'dashboardConfig'>,
  req: ReferenceRequest
): Promise<ReferenceResult> {
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  const scalar = (name: string, fallback = '') => referenceScalar(req, name, fallback);
  const result = await input.dashboardConfig.getFieldCatalogue(
    brand,
    { kind: 'workflow', recordType: scalar('recordType'), stage: scalar('stage') },
    dashboardOptions(req)
  );
  return referenceData(req, result);
}
export async function getViewFields(
  input: Pick<MetadataReadInput, 'dashboardConfig'>,
  req: ReferenceRequest
): Promise<ReferenceResult> {
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  const scalar = (name: string, fallback = '') => referenceScalar(req, name, fallback);
  const result = await input.dashboardConfig.getFieldCatalogue(
    brand,
    { kind: 'view', view: scalar('view'), step: scalar('step') },
    dashboardOptions(req)
  );
  return referenceData(req, result);
}
export async function migrationPreflight(
  input: Pick<MetadataReadInput, 'dashboardConfig'>,
  req: ReferenceRequest
): Promise<ReferenceResult> {
  const brand = Object.assign(new BrandingModel(), req.context.brand);
  const result = { reports: await input.dashboardConfig.preflightLegacyMigration(brand) };
  return referenceData(req, result);
}
export async function retiredOperation(input: object, req: ReferenceRequest): Promise<ReferenceResult> {
  retiredDashboardOperation();
}
