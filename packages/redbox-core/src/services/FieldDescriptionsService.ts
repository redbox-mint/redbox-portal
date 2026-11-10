import { firstValueFrom } from 'rxjs';
import {
  flattenContextFields,
  type EditorContextSchema,
  type FieldDescription,
  type SchemaTarget,
} from '@researchdatabox/sails-ng-common';
import { Services as CoreServices } from '../CoreService';
import type { BrandingModel } from '../model';
import type { RecordTypeAttributes } from '../waterline-models/RecordType';
import type { FormRecordAccessContext } from './FormsService';
import type { DescribeRecordStageSchemaRequest, DescribeRecordStageSchemaResult } from './RecordSchemaService';

export const MAX_FIELD_DESCRIPTION_BYTES = 524288;
const blocked = new Set(['__proto__', 'constructor', 'prototype']);
const object = (properties: Record<string, EditorContextSchema> = {}, open = false): EditorContextSchema => ({
  type: 'object',
  properties,
  additionalProperties: open,
});
export class FieldDescriptionError extends Error {
  constructor(public readonly code: 'INVALID_SCHEMA_TARGET' | 'UNKNOWN_RECORD_TYPE' | 'FORBIDDEN' | 'LENGTH_LIMIT') {
    super(code);
  }
}
function cap<T>(value: T): T {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_FIELD_DESCRIPTION_BYTES)
    throw new FieldDescriptionError('LENGTH_LIMIT');
  return value;
}

/** Internal composition result. Never send the metadata schema as a derived field-description DTO. */
export interface EffectiveMetadataDescription {
  description: FieldDescription;
  metadataSchema: EditorContextSchema;
}

/** Effective model names only. Containers describe structure, not leaf value types. */
export function formMetadataSchema(form: unknown, translate?: (key: string) => string): EditorContextSchema {
  const metadata = object({}, true);
  let visited = 0;
  const add = (parent: EditorContextSchema, name: string, title?: string): EditorContextSchema | null => {
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
    if (title) {
      node.title = title;
      if (translate && title.startsWith('@')) {
        try {
          const translated = translate(title);
          if (translated && translated !== title) node.title = translated;
        } catch { /* Missing translation assistance must not hide otherwise available fields. */ }
      }
    }
    return node;
  };
  const walk = (value: unknown, parent: EditorContextSchema, depth = 0): void => {
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

export namespace Services {
  /** Caller-effective, uncached field discovery. Feature services retain their own route policies and roots. */
  export class FieldDescriptions extends CoreServices.Core.Service {
    protected override _exportedMethods = ['schemaTargets', 'describeFields', 'describeMetadata'];

    private async authorized(
      brand: BrandingModel,
      caller: FormRecordAccessContext,
      type: string,
      stage: string
    ): Promise<boolean> {
      if (String(caller?.brand?.id) !== String(brand.id) || !caller?.user?.username) return false;
      const records =
        sails.services?.recordsservice ?? (typeof RecordsService === 'undefined' ? undefined : RecordsService);
      if (!records || typeof records.hasCreateAccess !== 'function') return false;
      try {
        return (await records.hasCreateAccess(brand, caller.user, caller.user.roles, type, stage)) === true;
      } catch {
        return false;
      }
    }

    public async schemaTargets(
      brand: BrandingModel,
      caller: FormRecordAccessContext
    ): Promise<{ recordTypes: SchemaTarget[] }> {
      // Never enumerate the process-wide type cache or the unscoped form registry.
      if (String(caller?.brand?.id) !== String(brand.id) || !caller?.user?.username)
        throw new FieldDescriptionError('FORBIDDEN');
      const types = await firstValueFrom(RecordTypesService.getAll(brand));
      const recordTypes: SchemaTarget[] = [];
      for (const type of (types ?? []) as unknown as Array<RecordTypeAttributes & { label?: string }>) {
        const owner = typeof type.branding === 'object' ? type.branding?.id : type.branding;
        if (String(owner) !== String(brand.id)) continue;
        const steps = await firstValueFrom(
          WorkflowStepsService.getAllForRecordTypeIncludingHidden({ id: String(type.id), name: type.name })
        );
        const stages: SchemaTarget['stages'] = [];
        for (const step of steps ?? []) {
          if (await this.authorized(brand, caller, type.name, step.name))
            stages.push({
              id: step.name,
              label: String((step.config as { label?: string })?.label || step.name),
              starting: step.starting === true,
            });
        }
        if (stages.length) recordTypes.push({ id: type.name, label: type.label || type.name, stages });
      }
      return cap({ recordTypes });
    }

    public async describeFields(
      brand: BrandingModel,
      portal: string,
      caller: FormRecordAccessContext,
      recordType: unknown,
      stage?: unknown
    ): Promise<FieldDescription> {
      return (await this.describeMetadata(brand, portal, caller, recordType, stage)).description;
    }

    public async describeMetadata(
      brand: BrandingModel,
      portal: string,
      caller: FormRecordAccessContext,
      recordType: unknown,
      stage?: unknown
    ): Promise<EffectiveMetadataDescription> {
      if (
        typeof recordType !== 'string' ||
        !/^[\w-]{1,100}$/.test(recordType) ||
        (stage !== undefined && (typeof stage !== 'string' || !/^[\w-]{1,100}$/.test(stage)))
      )
        throw new FieldDescriptionError('INVALID_SCHEMA_TARGET');
      if (String(caller?.brand?.id) !== String(brand.id) || !caller?.user?.username)
        throw new FieldDescriptionError('FORBIDDEN');
      const type = (await firstValueFrom(RecordTypesService.get(brand, recordType))) as unknown as RecordTypeAttributes;
      const owner = typeof type?.branding === 'object' ? type.branding?.id : type?.branding;
      if (!type || String(owner) !== String(brand.id)) throw new FieldDescriptionError('UNKNOWN_RECORD_TYPE');
      const steps = await firstValueFrom(
        WorkflowStepsService.getAllForRecordTypeIncludingHidden({ id: String(type.id), name: type.name })
      );
      const step =
        stage === undefined ? (steps.find(item => item.starting) ?? steps[0]) : steps.find(item => item.name === stage);
      if (!step) throw new FieldDescriptionError('INVALID_SCHEMA_TARGET');
      // Authorize even when schemas are disabled/missing, before reading any form configuration.
      if (!(await this.authorized(brand, caller, recordType, step.name))) throw new FieldDescriptionError('FORBIDDEN');
      let metadataSchema = object({}, true);
      let precision: FieldDescription['precision'] = 'none';
      let completeness: FieldDescription['completeness'] = 'unavailable';
      let fallback = true;
      const service = sails.services?.recordschemaservice as unknown as {
        describeStage?: (request: DescribeRecordStageSchemaRequest) => Promise<DescribeRecordStageSchemaResult>;
      };
      if (sails.config.recordSchema?.enabled !== false && service?.describeStage) {
        // An unexpected result/exception may hide a failed authorization check. Do not fall back.
        fallback = false;
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
            metadataSchema = cap(result.document) as EditorContextSchema;
            precision = 'record-schema';
            completeness = result.completeness;
          } else if (result.code === 'forbidden') throw new FieldDescriptionError('FORBIDDEN');
          else fallback = result.code === 'not-resolvable';
        } catch (error) {
          if (error instanceof FieldDescriptionError) throw error;
        }
      }
      if (fallback) {
        const formName = (step.config as { form?: string })?.form;
        if (formName && typeof FormsService !== 'undefined') {
          try {
            const form = await FormsService.getForm(brand, formName, true, recordType, {});
            const owner = typeof form?.branding === 'object' ? form.branding?.id : form?.branding;
            if (form?.configuration && String(owner) === String(brand.id)) {
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
              metadataSchema = formMetadataSchema(effective,
                typeof TranslationService !== 'undefined' && typeof TranslationService.t === 'function'
                  ? key => String(TranslationService.t(key, { nsSeparator: false, keySeparator: false }, 'en', brand.name))
                  : undefined);
              if (Object.keys(metadataSchema.properties ?? {}).length) {
                precision = 'form-config';
                completeness = 'partial';
              }
            }
          } catch {
            /* No unscoped registry fallback or raw exception text. */
          }
        }
      }
      let truncated = false;
      const fields = flattenContextFields(metadataSchema, precision, () => {
        truncated = true;
      });
      const description = cap({
        recordType,
        stage: step.name,
        precision,
        completeness: truncated ? ('partial' as const) : completeness,
        fields,
      });
      return { description, metadataSchema };
    }
  }
}
