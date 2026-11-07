import { firstValueFrom } from 'rxjs';
import type { RecordModel } from './model';
import type { WorkflowStepModel } from './model/storage/WorkflowStepModel';

/** Server-held permission issued only by an existing-record edit route. */
export interface RecordRouteForm {
  readonly oid: string;
  readonly brandId: string;
  readonly username: string;
  readonly recordType: string;
  readonly storedForm: string;
  readonly stage: string;
  readonly formName: string;
  readonly fingerprint?: string;
}

export function routeFormMatches(record: RecordModel | undefined, grant: RecordRouteForm): boolean {
  return (
    record?.redboxOid === grant.oid &&
    record.metaMetadata?.brandId === grant.brandId &&
    record.metaMetadata?.type === grant.recordType &&
    record.metaMetadata?.form === grant.storedForm &&
    record.workflow?.stage === grant.stage
  );
}

/** Select the source contract for fingerprinting only; never mutate the saved workflow. */
export function routeFormFingerprintRecord(record: RecordModel, formName: string): RecordModel {
  return { ...record, metaMetadata: { ...record.metaMetadata, form: formName } };
}

export async function routeFormAllowed(
  record: RecordModel,
  formName: string,
  canTransition: (step: unknown) => boolean
): Promise<boolean> {
  const meta = record.metaMetadata;
  if (!meta?.brandId || !meta.type || !record.workflow?.stage) return false;
  const brand = BrandingService.getBrandById(String(meta.brandId));
  const recordType = await firstValueFrom(RecordTypesService.get(brand, String(meta.type)));
  if (!recordType) return false;
  const current = (await firstValueFrom(WorkflowStepsService.get(recordType, String(record.workflow.stage)))) as
    | WorkflowStepModel
    | undefined;
  if (!current) return false;
  const form = await firstValueFrom(FormsService.getFormByName(formName, true, String(meta.brandId)));
  if (
    form?.name !== formName ||
    form.configuration?.type !== meta.type ||
    (form.branding && String(form.branding) !== String(meta.brandId))
  )
    return false;

  const steps = await firstValueFrom(WorkflowStepsService.getAllForRecordTypeIncludingHidden(recordType));
  const currentConfig = current.config as { workflow?: { next?: unknown } };
  const next = currentConfig?.workflow?.next;
  // Legacy workflows can have no edge list: the existing save
  // policy permits configured stages subject to transitionRoles. An explicit
  // next list narrows that policy for route-selected forms.
  const reachable = next === undefined ? undefined : Array.isArray(next) ? next : [next];
  return steps.some(step => {
    const config = step.config as { form?: string };
    return (
      config?.form === formName &&
      (step.name === current.name || !reachable || reachable.includes(step.name)) &&
      canTransition(step)
    );
  });
}
