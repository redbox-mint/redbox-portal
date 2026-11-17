import { ConstructFormConfigVisitor } from '../visitor/construct.visitor';
import { firstValueFrom } from 'rxjs';
import { ClientFormConfigVisitor } from '../visitor/client.visitor';
import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { reportingPrincipal, recordRoleNames } from './authorization';
import { resolveReportingRegistry, type ReportingRegistry } from './registry';
import { ReportingError, type ReportingPrincipal } from './types';

/** Refreshed persisted identity, including linked-account and disabled-account rules. */
export async function resolveReportingPrincipal(
  brandName: string,
  authenticatedUserId: string
): Promise<ReportingPrincipal> {
  if (!authenticatedUserId) throw new ReportingError('AUTHENTICATION_REQUIRED');
  const brand = BrandingService.getBrand(brandName);
  const stored = await User.findOne({ id: authenticatedUserId }).populate('roles');
  if (
    !stored ||
    typeof stored !== 'object' ||
    Reflect.get(stored, 'loginDisabled') ||
    Reflect.get(stored, 'effectiveLoginDisabled')
  )
    throw new ReportingError('AUTHENTICATION_REQUIRED');
  const user = await firstValueFrom(UsersService.getEffectiveUser(stored));
  if (!brand || !user) throw new ReportingError('AUTHENTICATION_REQUIRED');
  return reportingPrincipal(brand, user);
}
function leafPaths(schema: Record<string, unknown>, parents: string[] = []): string[] {
  const result: string[] = [];
  const properties =
    'properties' in schema || 'optionalProperties' in schema
      ? { ...object(schema.properties), ...object(schema.optionalProperties) }
      : schema;
  for (const [name, raw] of Object.entries(properties)) {
    const child = object(raw);
    const path = [...parents, name];
    if (typeof child.type === 'string' || Array.isArray(child.enum)) result.push(`metadata.${path.join('.')}`);
    const elements = object(child.elements);
    if (typeof elements.type === 'string' || Array.isArray(elements.enum)) result.push(`metadata.${path.join('.')}`);
    result.push(...leafPaths(child, path));
  }
  return result;
}
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
/** Record-dependent question branches cannot safely authorize a bulk metadata aggregate. */
function hasQuestionTree(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (object(value).class === 'QuestionTreeComponent') return true;
  return Object.values(value).some(hasQuestionTree);
}
/** Static view contracts only: templates/overrides cannot broaden aggregate access using record data. */
export async function runtimeReportingRegistry(
  principal: ReportingPrincipal,
  recordType: string
): Promise<ReportingRegistry> {
  return resolveReportingRegistry(
    principal,
    recordType,
    sails.config.reporting,
    sails.config.recordtype,
    async (actor, forms) => {
      let intersection: Set<string> | undefined;
      for (const name of forms) {
        const form = await firstValueFrom(FormsService.getFormByName(name, false, actor.brand.id));
        if (!form?.configuration || hasQuestionTree(form.configuration)) return new Set();
        // Work on the stored, static outline. Unsupported template forms simply yield no usable paths.
        const visitor = new ClientFormConfigVisitor(sails.log);
        const constructor = new ConstructFormConfigVisitor(sails.log);
        const constructed = await constructor.start({
          data: structuredClone(form.configuration),
          formMode: 'view',
          reusableFormDefs: sails.config.reusableFormDefinitions,
        });
        if (hasQuestionTree(constructed)) return new Set();
        const clientForm = await visitor.start({
          form: constructed,
          formMode: 'view',
          userRoles: recordRoleNames(actor.brand, actor.roles),
          reusableFormDefs: sails.config.reusableFormDefinitions,
        });
        if (!clientForm) return new Set();
        const schema = await FormRecordConsistencyService.buildSchemaForClientFormConfig(
          clientForm,
          'view',
          sails.config.reusableFormDefinitions
        );
        const paths = new Set(leafPaths(schema));
        intersection = intersection ? new Set([...intersection].filter(path => paths.has(path))) : paths;
      }
      return intersection ?? new Set();
    }
  );
}
/** Returns the same caller-effective view projection, never a raw fallback. */
export async function projectReportingMetadata(
  principal: ReportingPrincipal,
  record: { metadata: Record<string, unknown>; metaMetadata: { form: string } }
): Promise<Record<string, unknown>> {
  const form = await firstValueFrom(FormsService.getFormByName(record.metaMetadata.form, false, principal.brand.id));
  if (!form?.configuration) throw new ReportingError('UNAVAILABLE');
  const client: FormConfigFrame = await FormsService.buildClientFormConfig(
    form.configuration,
    'view',
    recordRoleNames(principal.brand, principal.roles),
    record.metadata,
    sails.config.reusableFormDefinitions,
    principal.brand.name,
    {},
    { user: principal.user as import('../model').UserModel, brand: principal.brand }
  );
  return FormRecordConsistencyService.projectMetadataClientFormConfig(
    record.metadata,
    client,
    'view',
    sails.config.reusableFormDefinitions
  );
}
