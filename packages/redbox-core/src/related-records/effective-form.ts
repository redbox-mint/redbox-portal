import { firstValueFrom } from 'rxjs';
import type { FormConfigFrame, FormModesConfig } from '@researchdatabox/sails-ng-common';
import type { BrandingModel, UserModel, RecordModel } from '../model';
import { ContextVariableUtils } from '../utilities/ContextVariableUtils';
type AnyRecord = Record<string, unknown>;

/** Shared with RecordController: preserves its lookup/edit-mode pairing and caller context. */
export async function getEffectiveRelatedClientForm(
  req: Sails.Req,
  brand: BrandingModel,
  record: { metaMetadata?: unknown; metadata: Record<string, unknown> },
  formName: string,
  formLookupEditMode: boolean,
  formMode: FormModesConfig,
  projectionOnly = false
): Promise<FormConfigFrame | undefined> {
  const metaMetadata = record.metaMetadata as AnyRecord | undefined;
  const brandId = String(metaMetadata?.['brandId'] ?? brand.id);
  const formRecord = await firstValueFrom(FormsService.getFormByName(formName, formLookupEditMode, brandId));
  const formConfig = formRecord?.configuration;
  if (!formConfig) {
    return undefined;
  }

  const userRoles = ((req.user?.['roles'] ?? []) as AnyRecord[])
    .map((role: AnyRecord) => String(role['name'] ?? ''))
    .filter((name: string) => !!name);
  const reusableFormDefs = sails.config.reusableFormDefinitions;
  const contextVariablesMap = ContextVariableUtils.evaluateContextVariables(req, record);
  return FormsService.buildClientFormConfig(
    formConfig,
    formMode,
    userRoles,
    record.metadata,
    reusableFormDefs,
    String(brand?.name ?? ''),
    contextVariablesMap,
    { user: req.user as UserModel, brand, record: record as RecordModel },
    false,
    projectionOnly
  );
}
