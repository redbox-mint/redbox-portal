import { firstValueFrom } from 'rxjs';
import { ConstructFormConfigVisitor } from '../../packages/redbox-core/src/visitor/construct.visitor';
import { ValidatorFormConfigVisitor } from '../../packages/redbox-core/src/forms/ValidatorFormConfigVisitor';

/** Exercise the owned construct/validator visitors with the selected form repository. */
export async function validateFormRecordValues(fixture: any, record: any) {
  const form = await firstValueFrom(fixture.services.FormsService.getFormByName(
    String(record.metaMetadata?.form ?? ''), true,
    String(record.metaMetadata?.brandId ?? fixture.services.BrandingService.getDefault().id)
  )) as any;
  if (!form?.configuration) throw new Error(`Form configuration not found for form: ${record.metaMetadata?.form}`);
  const constructed = await new ConstructFormConfigVisitor(fixture.log).start({
    data: form.configuration, formMode: 'edit', record: record.metadata ?? {},
  });
  return new ValidatorFormConfigVisitor(fixture.log, {
    sanitizeWithProfile: (value, profile) => fixture.services.DomSanitizerService.sanitizeWithProfile(value, profile),
    htmlSanitizationMode: () => fixture.config.record.form?.htmlSanitizationMode ?? 'sanitize',
  }).start({ form: constructed, enabledValidationGroups: ['all'], validatorDefinitions: fixture.config.validators.definitions });
}
