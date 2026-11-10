import type {
  EmailContextSchema,
  EmailContextSchemaResponse,
  EmailSchemaTargetsResponse,
} from '@researchdatabox/sails-ng-common';
import type { BrandingModel } from '../model';
import type { FormRecordAccessContext } from '../services/FormsService';
import { Services as FieldServices, FieldDescriptionError } from '../services/FieldDescriptionsService';
import { emailRecordUrl } from '../services/EmailService';
import { emailTemplateDefinition } from '../services/EmailTemplateService';
import { emailTemplateContextKind } from './EmailTemplateContextKind';
import type { IntegrationNotificationPayload } from '../services/IntegrationNotificationService';
import { EmailTemplateError, emailTemplateContextRoots } from '../services/EmailTemplateService';

export const MAX_EMAIL_SCHEMA_BYTES = 524288;
const blocked = new Set(['__proto__', 'constructor', 'prototype']);
const object = (properties: Record<string, EmailContextSchema> = {}, open = false): EmailContextSchema => ({
  type: 'object',
  properties,
  additionalProperties: open,
});
const string = (): EmailContextSchema => ({ type: 'string' });

function cap<T>(value: T): T {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_EMAIL_SCHEMA_BYTES)
    throw new EmailTemplateError('LENGTH_LIMIT', 'Email schema assistance exceeds its response limit.');
  return value;
}

function fieldDescriptions(): Pick<FieldServices.FieldDescriptions, 'schemaTargets' | 'describeMetadata'> {
  return (
    (sails.services?.fielddescriptionsservice as unknown as FieldServices.FieldDescriptions | undefined) ??
    new FieldServices.FieldDescriptions()
  );
}

export async function emailSchemaTargets(
  brand: BrandingModel,
  caller: FormRecordAccessContext
): Promise<EmailSchemaTargetsResponse> {
  try {
    return cap(await fieldDescriptions().schemaTargets(brand, caller));
  } catch (error) {
    return fieldError(error);
  }
}
export { formMetadataSchema as emailFormMetadataSchema } from '../services/FieldDescriptionsService';
function fieldError(error: unknown): never {
  if (error instanceof FieldDescriptionError)
    throw new EmailTemplateError(error.code, 'Field assistance is unavailable.');
  throw error;
}

/** Rebase local document references when embedding metadata in the context schema. */
function embedMetadata(value: unknown, depth = 0): unknown {
  if (depth > 64) throw new EmailTemplateError('LENGTH_LIMIT', 'Email schema nesting limit exceeded.');
  if (Array.isArray(value)) return value.map(child => embedMetadata(child, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = Object.create(null);
  for (const [key, child] of Object.entries(value)) {
    if (blocked.has(key) || ['$id', '$schema'].includes(key)) continue;
    if (key === '$ref' && typeof child === 'string') {
      // No remote resolution in the editor. Unrepresentable references stay permissive.
      if (child === '#') out[key] = '#/properties/record/properties/metadata';
      else if (child.startsWith('#/')) out[key] = '#/properties/record/properties/metadata' + child.slice(1);
    } else out[key] = embedMetadata(child, depth + 1);
  }
  return out;
}

export function curatedEmailContextSchema(metadata: EmailContextSchema): EmailContextSchema {
  const record = object({
    oid: string(),
    redboxOid: { ...string(), description: 'Legacy alias of record.oid' },
    viewUrl: { ...string(), format: 'uri', description: 'Link to view this record in the portal' },
    editUrl: { ...string(), format: 'uri', description: 'Link to edit this record in the portal' },
    metadata,
    lastSaveDate: string(),
    dateCreated: string(),
    workflow: object({ stage: string(), stageLabel: string() }),
    metaMetadata: object({
      type: string(),
      brandId: string(),
      createdBy: string(),
      createdOn: string(),
      lastSaveDate: string(),
    }),
  });
  const exposed = object({ appUrl: string() });
  for (const path of sails.config.emailnotification?.settings?.exposedConfigPaths ?? []) {
    const parts = path.split('.');
    if (parts.some(part => !part || blocked.has(part))) continue;
    let node = exposed;
    for (const part of parts) {
      node.properties ??= Object.create(null);
      node.properties![part] ??= {};
      node = node.properties![part];
    }
    // Only expose names, never configured values (which can contain secrets).
    if (path !== 'appUrl') node.additionalProperties = true;
  }
  const schema = object({
    oid: string(),
    title: { ...string(), description: 'Record title; shortcut for record.metadata.title' },
    record,
    portal: object({ appUrl: string(), brandName: string(), brandUrl: string(), portalName: string() }),
    sailsConfig: exposed,
    // Legacy alias rebuilt from `record` on every render; edits to it are ignored.
    imports: {
      ...object({ oid: string(), record: { $ref: '#/properties/record' } }),
      readOnly: true,
      description: 'Legacy alias, always a copy of record. Edit record instead.',
    },
  });
  for (const root of emailTemplateContextRoots()) {
    if (!Object.hasOwn(schema.properties!, root)) schema.properties![root] = {};
  }
  for (const root of sails.config.emailnotification?.settings?.additionalContextRoots ?? []) {
    if (!['record', 'oid', 'title', 'imports', 'portal', 'sailsConfig'].includes(root))
      schema.properties![root] = object({}, true);
  }
  schema.$schema = 'https://json-schema.org/draft/2020-12/schema';
  return schema;
}

/** Payload contract shared by schema lint, field discovery and sample generation. */
export function integrationEmailContextSchema(
  templateId: string,
  brandId: string,
  portal: Record<string, unknown> = {}
): EmailContextSchema {
  const recovery = templateId === 'integrationRecovery';
  const timestamp = '2026-01-01T00:00:01.000Z';
  const sampleOid = 'sample-record-oid';
  const field = (description: string, example: unknown, type = 'string'): EmailContextSchema => ({
    type,
    description,
    examples: [example],
  });
  const date = (description: string, value = timestamp): EmailContextSchema => ({
    ...field(description, value),
    format: 'date-time',
  });
  const payload: Record<keyof IntegrationNotificationPayload, EmailContextSchema> = {
    kind: { ...field('Alert kind', recovery ? 'recovery' : 'failure'), enum: ['failure', 'recovery'] },
    title: field(
      'Alert title; default subject for integration sends',
      `Integration ${recovery ? 'Recovery' : 'Failure'}: example - update`
    ),
    summary: field(
      'Short description of the integration outcome',
      recovery ? 'The example integration recovered.' : 'The example integration failed during update.'
    ),
    severity: { ...field('Alert severity', recovery ? 'info' : 'error'), enum: ['info', 'warning', 'error'] },
    redboxOid: field('Identifier of the affected record', sampleOid),
    brandId: field('Brand that owns the integration event', brandId),
    integrationName: field('Integration name', 'example'),
    integrationAction: field('Integration action', 'update'),
    status: field('Integration audit status', recovery ? 'success' : 'failed'),
    triggeredBy: field('User or process that triggered the integration', 'sample-user'),
    message: field('Integration result message', recovery ? 'Update completed.' : 'Service temporarily unavailable.'),
    errorDetail: field('Additional failure details', recovery ? '' : 'The remote service did not accept the update.'),
    httpStatusCode: field('HTTP response status code', recovery ? 200 : 503, 'number'),
    traceId: field('Trace identifier for the integration', 'sample-trace-id'),
    spanId: field('Span identifier for this operation', 'sample-span-id'),
    startedAt: date('Time the integration started', '2026-01-01T00:00:00.000Z'),
    completedAt: date('Time the integration completed'),
    durationMs: field('Integration duration in milliseconds', 1000, 'number'),
    recordUrl: {
      ...field('Link to view the affected record', emailRecordUrl(portal.brandUrl, sampleOid, 'view') ?? ''),
      format: 'uri',
    },
    timestamp: date('Time the alert was generated'),
  };
  const common = curatedEmailContextSchema({});
  const schema = object({ ...payload, portal: common.properties!.portal, sailsConfig: common.properties!.sailsConfig });
  // Public brand URLs are sample data. Never put exposed config values in schema annotations.
  for (const [key, value] of Object.entries(portal)) {
    if (Object.hasOwn(schema.properties!.portal.properties!, key))
      schema.properties!.portal.properties![key].examples = [value];
  }
  schema.required = [
    'kind',
    'title',
    'summary',
    'severity',
    'redboxOid',
    'integrationName',
    'integrationAction',
    'status',
    'traceId',
    'spanId',
    'startedAt',
    'timestamp',
    'portal',
    'sailsConfig',
  ];
  schema.properties!.portal.required = Object.keys(schema.properties!.portal.properties!);
  schema.properties!.sailsConfig.required = ['appUrl'];
  for (const root of sails.config.emailnotification?.settings?.additionalContextRoots ?? []) {
    if (!['record', 'oid', 'imports'].includes(root) && !Object.hasOwn(schema.properties!, root))
      schema.properties![root] = object({}, true);
  }
  schema.$schema = 'https://json-schema.org/draft/2020-12/schema';
  return schema;
}

export async function emailContextSchema(
  brand: BrandingModel,
  portal: string,
  caller: FormRecordAccessContext,
  recordType: unknown,
  stage?: unknown,
  templateId?: unknown
): Promise<EmailContextSchemaResponse> {
  if (templateId !== undefined) {
    if (typeof templateId !== 'string') throw new EmailTemplateError('UNKNOWN_TEMPLATE', 'Unknown email template.');
    emailTemplateDefinition(templateId);
    if ((await emailTemplateContextKind(String(brand.id), templateId)) === 'integration') {
      const display = await EmailService.buildPreviewContext(templateId, {}, String(brand.id));
      return cap({
        recordType: '',
        stage: '',
        contextKind: 'integration',
        precision: 'integration',
        schema: integrationEmailContextSchema(templateId, String(brand.id), display.portal as Record<string, unknown>),
      });
    }
  }
  try {
    const { description, metadataSchema } = await fieldDescriptions().describeMetadata(
      brand,
      portal,
      caller,
      recordType,
      stage
    );
    return cap({
      recordType: description.recordType,
      stage: description.stage,
      contextKind: 'record',
      precision: description.precision,
      completeness: description.completeness,
      schema: curatedEmailContextSchema(embedMetadata(metadataSchema) as EmailContextSchema),
    });
  } catch (error) {
    return fieldError(error);
  }
}
