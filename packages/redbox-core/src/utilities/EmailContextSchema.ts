import { firstValueFrom } from 'rxjs';
import type {
  EmailContextSchema,
  EmailContextSchemaResponse,
  EmailSchemaTargetsResponse,
} from '@researchdatabox/sails-ng-common';
import type { BrandingModel } from '../model';
import type { RecordTypeAttributes } from '../waterline-models/RecordType';
import type { FormRecordAccessContext } from '../services/FormsService';
import type {
  DescribeRecordStageSchemaRequest,
  DescribeRecordStageSchemaResult,
} from '../services/RecordSchemaService';
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

export async function emailSchemaTargets(brand: BrandingModel): Promise<EmailSchemaTargetsResponse> {
  // Never enumerate the process-wide type cache or the unscoped form registry.
  const types = await firstValueFrom(RecordTypesService.getAll(brand));
  const recordTypes: EmailSchemaTargetsResponse['recordTypes'] = [];
  for (const type of (types ?? []) as unknown as Array<RecordTypeAttributes & { label?: string }>) {
    const owner = typeof type.branding === 'object' ? type.branding?.id : type.branding;
    if (String(owner) !== String(brand.id)) continue;
    const steps = await firstValueFrom(
      WorkflowStepsService.getAllForRecordTypeIncludingHidden({ id: String(type.id), name: type.name })
    );
    recordTypes.push({
      id: type.name,
      label: type.label || type.name,
      stages: (steps ?? []).map(step => ({
        id: step.name,
        label: String((step.config as { label?: string })?.label || step.name),
        starting: step.starting === true,
      })),
    });
  }
  return cap({ recordTypes });
}

/** Effective model names only. Containers describe structure, not leaf value types. */
export function emailFormMetadataSchema(form: unknown): EmailContextSchema {
  const metadata = object({}, true);
  let visited = 0;
  const add = (parent: EmailContextSchema, name: string, title?: string): EmailContextSchema | null => {
    const parts = name.replace(/^record\.metadata\./, '').split('.');
    if (parts.some(part => blocked.has(part) || !part)) return null;
    let node = parent;
    for (const part of parts) {
      // A dotted model name implies object nesting, but says nothing about leaf types.
      node.type = 'object';
      node.additionalProperties = true;
      node.properties ??= Object.create(null);
      if (!Object.hasOwn(node.properties!, part)) node.properties![part] = {};
      node = node.properties![part];
    }
    if (title) node.title = title;
    return node;
  };
  const walk = (value: unknown, parent: EmailContextSchema, depth = 0): void => {
    if (++visited > 10000 || depth > 40 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(child => walk(child, parent, depth + 1));
      return;
    }
    const field = value as Record<string, unknown>;
    const name = field.name ?? field.key;
    const options = (field.templateOptions ??
      field.props ??
      (field.layout as { config?: unknown })?.config ??
      {}) as Record<string, unknown>;
    const label = options.label ?? field.label;
    const model = field.model as { class?: string } | undefined;
    const config = (field.component as { config?: Record<string, unknown> })?.config;
    let target = parent;
    // Named layout components (tabs, content, buttons) have no model and add no metadata path.
    const hasModel = !!model || (!field.component && !field.configuration && !field.componentDefinitions);
    if (typeof name === 'string' && name && hasModel) {
      const node = add(parent, name, typeof label === 'string' ? label : undefined);
      if (!node) return;
      target = node;
    }
    if (model?.class === 'RepeatableModel') {
      target.type = 'array';
      target.items = {};
      // An element template's name is deliberately empty: its children belong to each item.
      walk(config?.elementTemplate, target.items, depth + 1);
      return;
    }
    if (model?.class === 'GroupModel') {
      target.type = 'object';
      target.additionalProperties = true;
      target.properties ??= {};
    }
    // Walk structure only, never model values, examples, vocab entries or defaults.
    for (const key of [
      'fields',
      'fieldGroup',
      'fieldArray',
      'definition',
      'pages',
      'sections',
      'rows',
      'columns',
      'configuration',
      'componentDefinitions',
      'component',
      'config',
      'tabs',
      'panels',
      'headerActions',
      'children',
    ]) {
      if (Object.hasOwn(field, key)) walk(field[key], target, depth + 1);
    }
  };
  walk(form, metadata);
  return metadata;
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
export function integrationEmailContextSchema(templateId: string, brandId: string,
  portal: Record<string, unknown> = {}): EmailContextSchema {
  const recovery = templateId === 'integrationRecovery';
  const timestamp = '2026-01-01T00:00:01.000Z';
  const sampleOid = 'sample-record-oid';
  const field = (description: string, example: unknown, type = 'string'): EmailContextSchema =>
    ({ type, description, examples: [example] });
  const date = (description: string, value = timestamp): EmailContextSchema =>
    ({ ...field(description, value), format: 'date-time' });
  const payload: Record<keyof IntegrationNotificationPayload, EmailContextSchema> = {
    kind: { ...field('Alert kind', recovery ? 'recovery' : 'failure'), enum: ['failure', 'recovery'] },
    title: field('Alert title; default subject for integration sends',
      `Integration ${recovery ? 'Recovery' : 'Failure'}: example - update`),
    summary: field('Short description of the integration outcome',
      recovery ? 'The example integration recovered.' : 'The example integration failed during update.'),
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
    recordUrl: { ...field('Link to view the affected record', emailRecordUrl(portal.brandUrl, sampleOid, 'view') ?? ''), format: 'uri' },
    timestamp: date('Time the alert was generated'),
  };
  const common = curatedEmailContextSchema({});
  const schema = object({ ...payload, portal: common.properties!.portal, sailsConfig: common.properties!.sailsConfig });
  // Public brand URLs are sample data. Never put exposed config values in schema annotations.
  for (const [key, value] of Object.entries(portal)) {
    if (Object.hasOwn(schema.properties!.portal.properties!, key))
      schema.properties!.portal.properties![key].examples = [value];
  }
  schema.required = ['kind', 'title', 'summary', 'severity', 'redboxOid', 'integrationName',
    'integrationAction', 'status', 'traceId', 'spanId', 'startedAt', 'timestamp', 'portal', 'sailsConfig'];
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
    if (await emailTemplateContextKind(String(brand.id), templateId) === 'integration') {
      const display = await EmailService.buildPreviewContext(templateId, {}, String(brand.id));
      return cap({ recordType: '', stage: '', contextKind: 'integration', precision: 'integration',
        schema: integrationEmailContextSchema(templateId, String(brand.id), display.portal as Record<string, unknown>) });
    }
  }
  if (
    typeof recordType !== 'string' ||
    !/^[\w-]{1,100}$/.test(recordType) ||
    (stage !== undefined && (typeof stage !== 'string' || !/^[\w-]{1,100}$/.test(stage)))
  )
    throw new EmailTemplateError('INVALID_SCHEMA_TARGET', 'Invalid schema target.');
  const type = (await firstValueFrom(RecordTypesService.get(brand, recordType))) as unknown as RecordTypeAttributes;
  const owner = typeof type?.branding === 'object' ? type.branding?.id : type?.branding;
  if (!type || String(owner) !== String(brand.id))
    throw new EmailTemplateError('UNKNOWN_RECORD_TYPE', 'Unknown record type.');
  const steps = await firstValueFrom(
    WorkflowStepsService.getAllForRecordTypeIncludingHidden({ id: String(type.id), name: type.name })
  );
  const step =
    stage === undefined ? (steps.find(item => item.starting) ?? steps[0]) : steps.find(item => item.name === stage);
  if (!step) throw new EmailTemplateError('INVALID_SCHEMA_TARGET', 'Unknown workflow stage.');
  let metadata = object({}, true);
  let precision: EmailContextSchemaResponse['precision'] = 'none';
  const service = sails.services?.recordschemaservice as unknown as {
    describeStage?: (request: DescribeRecordStageSchemaRequest) => Promise<DescribeRecordStageSchemaResult>;
  };
  if (sails.config.recordSchema?.enabled !== false && service?.describeStage) {
    try {
      const result = await service.describeStage({
        brand: String(brand.id),
        branding: brand.name,
        portal,
        recordType,
        targetStep: step.name,
        caller,
      });
      if (result.kind !== 'unavailable') {
        cap(result.document);
        metadata = embedMetadata(result.document) as EmailContextSchema;
        precision = 'record-schema';
      }
    } catch (error) {
      if (error instanceof EmailTemplateError && error.code === 'LENGTH_LIMIT') throw error;
      // Read-only assistance is best effort. Never log resolver exceptions or form contents.
    }
  }
  if (precision === 'none') {
    const formName = (step.config as { form?: string })?.form;
    if (formName && typeof FormsService !== 'undefined') {
      try {
        const form = await FormsService.getForm(brand, formName, true, recordType, {});
        const formOwner = typeof form?.branding === 'object' ? form.branding?.id : form?.branding;
        if (form?.configuration && String(formOwner) === String(brand.id)) {
          // Same construction/filtering boundary as the record editor: resolves reusable
          // definitions, replacement names, edit overrides and caller role visibility.
          const effective = await FormsService.buildClientFormConfig(
            form.configuration,
            'edit',
            caller.user.roles.map(role => role.name),
            null,
            sails.config.reusableFormDefinitions,
            brand.name,
            undefined,
            caller,
            false,
            { hydrateVocabulary: false }
          );
          metadata = emailFormMetadataSchema(effective);
          if (Object.keys(metadata.properties ?? {}).length) precision = 'form-config';
        }
      } catch {
        /* No form registry fallback: that could disclose another brand's forms. */
      }
    }
  }
  // No cache: describeStage depends on current caller, form, config and schema digest.
  return cap({ recordType, stage: step.name, contextKind: 'record', precision, schema: curatedEmailContextSchema(metadata) });
}
