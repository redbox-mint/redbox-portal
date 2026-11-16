import { firstValueFrom } from 'rxjs';
import type { BrandingModel } from '../model/storage/BrandingModel';
import type { RecordContractEffectiveForm } from '../record-contract';
import { isObject } from './renderer';

export interface ReadContractCandidate {
  readonly recordType: string;
  readonly workflowStep: string;
  readonly form: string;
  readonly configuration: RecordContractEffectiveForm;
}

/** Read configured forms directly: UI edit filtering is not a metadata read ACL. */
export async function configuredReadContracts(brand: BrandingModel): Promise<readonly ReadContractCandidate[]> {
  const [forms, types] = await Promise.all([
    firstValueFrom(FormsService.listForms(brand.id)),
    firstValueFrom(RecordTypesService.getAll(brand)),
  ]);
  if (types.length > 100 || forms.length > 1_000) throw new Error('Read catalogue exceeds its bound.');
  const byName = new Map(forms.map(form => [form.name, form]));
  if (byName.size !== forms.length) throw new Error('Ambiguous read form names.');
  const candidates: ReadContractCandidate[] = [];
  for (const type of types) {
    const name: unknown = Reflect.get(type, 'name');
    if (typeof name !== 'string' || !name) throw new Error('Invalid configured record type.');
    const steps = await firstValueFrom(WorkflowStepsService.getAllForRecordTypeIncludingHidden(type));
    if (steps.length > 100) throw new Error('Read workflows exceed their bound.');
    for (const step of steps) {
      const config = step.config;
      if (!isObject(config) || typeof config.form !== 'string') continue;
      const form = byName.get(config.form);
      if (!form?.configuration) continue;
      const formBrand = isObject(form.branding) ? form.branding.id : form.branding;
      if (String(formBrand) !== String(brand.id)) throw new Error('Read form scope mismatch.');
      const stage = isObject(config.workflow) ? config.workflow.stage : undefined;
      candidates.push({
        recordType: name,
        workflowStep: typeof stage === 'string' && stage ? stage : step.name,
        form: form.name,
        configuration: form.configuration,
      });
      if (candidates.length > 100) throw new Error('Read variants exceed their bound.');
    }
  }
  return candidates;
}
