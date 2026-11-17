import { cloneDeep, get as getPath, set as setPath } from 'lodash';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import { normalizeRelatedReferences } from '../related-records/references';
import type { RecordModel, UserModel } from '../model';
import type { RecordsService } from '../RecordsService';
import type { FormRecordAccessContext } from '../services/FormsService';
import {
  AccordionFieldComponentDefinitionOutline,
  AccordionFormComponentDefinitionOutline,
  AccordionPanelFieldComponentDefinitionOutline,
  AccordionPanelFormComponentDefinitionOutline,
  FormConfigOutline,
  FormConfigVisitor,
  GroupFieldComponentDefinitionOutline,
  GroupFormComponentDefinitionOutline,
  RelatedObjectDataFieldComponentDefinitionOutline,
  RelatedObjectDataFormComponentDefinitionOutline,
  RepeatableFieldComponentDefinitionOutline,
  RepeatableFormComponentDefinitionOutline,
  TabContentFieldComponentDefinitionOutline,
  TabContentFormComponentDefinitionOutline,
  TabFieldComponentDefinitionOutline,
  TabFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';

export class RelatedObjectDataInlineFormConfigVisitor extends FormConfigVisitor {
  protected override logName = 'RelatedObjectDataInlineFormConfigVisitor';
  private readonly pending: Promise<void>[] = [];

  constructor(
    logger: ILogger,
    private readonly recordsService: RecordsService
  ) {
    super(logger);
  }

  async resolve(
    form: FormConfigOutline,
    metadata: Record<string, unknown>,
    context: FormRecordAccessContext
  ): Promise<void> {
    this.pending.length = 0;
    this.relationIds.clear();
    this.metadata = metadata;
    this.context = context;
    await form.accept(this);
    await Promise.all(this.pending);
    await this.resolveRelations(form, metadata, context);
  }

  private readonly relationIds = new Set<string>();

  private async resolveRelations(
    form: FormConfigOutline,
    metadata: Record<string, unknown>,
    context: FormRecordAccessContext
  ): Promise<void> {
    if (!this.relationIds.size) return;
    const sources = form.relatedRecords?.sources.filter(source => this.relationIds.has(source.relationId)) ?? [];
    for (const id of this.relationIds) {
      if (!sources.some(source => source.relationId === id)) throw new Error(`Missing trusted related source descriptor ${id}`);
    }
    const root = {
      ...context.record,
      metadata: cloneDeep(metadata),
      metaMetadata: { ...context.record?.metaMetadata, type: form.type, brandId: String(context.brand.id) },
    } as RecordModel;
    const result = await this.recordsService.resolveRelatedMetadata(
      root,
      { brand: context.brand, user: context.user as UserModel, audience: 'browser' },
      { relations: [...this.relationIds].map(relationId => ({
        relationId,
        required: sources.some(source => source.relationId === relationId && source.required === true),
      })) }
    );
    for (const source of sources) {
      source.initialResult = cloneDeep(result[source.relationId]);
      // Stable normalized reference identity, including malformed-reference positions.
      source.referenceFingerprint = JSON.stringify(normalizeRelatedReferences(
        getPath(metadata, source.referenceTokens), source.oidTokens
      ));
    }
  }

  private metadata: Record<string, unknown> = {};
  private context?: FormRecordAccessContext;
  protected override async notImplemented(): Promise<void> {}
  async visitFormConfig(item: FormConfigOutline): Promise<void> {
    for (const def of item.componentDefinitions) await def.accept(this);
  }
  async visitRelatedObjectDataFormComponentDefinition(
    item: RelatedObjectDataFormComponentDefinitionOutline
  ): Promise<void> {
    await item.component?.accept(this);
  }
  async visitRelatedObjectDataFieldComponentDefinition(
    item: RelatedObjectDataFieldComponentDefinitionOutline
  ): Promise<void> {
    this.pending.push(this.resolveComponent(item));
  }
  async visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): Promise<void> {
    await item.component?.accept(this);
  }
  async visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): Promise<void> {
    for (const def of item.config?.componentDefinitions ?? []) await def.accept(this);
  }
  async visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): Promise<void> {
    await item.component?.accept(this);
  }
  async visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): Promise<void> {
    for (const def of item.config?.tabs ?? []) await def.accept(this);
  }
  async visitAccordionFormComponentDefinition(item: AccordionFormComponentDefinitionOutline): Promise<void> {
    await item.component?.accept(this);
  }
  async visitAccordionFieldComponentDefinition(item: AccordionFieldComponentDefinitionOutline): Promise<void> {
    for (const def of item.config?.panels ?? []) await def.accept(this);
  }
  async visitAccordionPanelFormComponentDefinition(item: AccordionPanelFormComponentDefinitionOutline): Promise<void> {
    await item.component?.accept(this);
  }
  async visitAccordionPanelFieldComponentDefinition(
    item: AccordionPanelFieldComponentDefinitionOutline
  ): Promise<void> {
    for (const def of item.config?.componentDefinitions ?? []) await def.accept(this);
  }
  async visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): Promise<void> {
    await item.component?.accept(this);
  }
  async visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): Promise<void> {
    for (const def of item.config?.componentDefinitions ?? []) await def.accept(this);
  }
  async visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): Promise<void> {
    await item.component?.accept(this);
  }
  async visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): Promise<void> {
    await item.config?.elementTemplate?.accept(this);
  }

  private async resolveComponent(item: RelatedObjectDataFieldComponentDefinitionOutline): Promise<void> {
    const config = item.config;
    if (!config || !this.context) return;
    const context = this.context;
    config.relatedObjects = [];
    config.accessDeniedOids = [];
    config.failedOids = [];
    if (config.relationId !== undefined) {
      if ((['dataPath', 'oidProperty', 'relatedFields'] as const).some(key => config[key] !== undefined))
        throw new Error('relationId conflicts with legacy related-object reference configuration');
      this.relationIds.add(config.relationId);
      return;
    }
    // Trusted legacy adapter: preserve configured Lodash paths, title and OID buckets.
    const dataPath = (config.dataPath ?? '').replace(/^metadata\./, '');
    if (!dataPath) return;
    const raw = getPath(this.metadata, dataPath);
    const values = Array.isArray(raw) ? raw : [];
    const oidProperty = config.oidProperty ?? 'id';
    const oids = [
      ...new Set(
        values
          .map(value => (typeof value === 'string' ? value : getPath(value, oidProperty)))
          .filter((oid): oid is string => typeof oid === 'string' && oid.length > 0)
      ),
    ];
    if (oids.length > 50)
      this.logger.warn(`${this.logName}: limiting related object resolution from ${oids.length} to 50 records.`);
    const results = await Promise.all(
      oids.slice(0, 50).map(async oid => {
        try {
          const record = await this.recordsService.getMeta(oid);
          const userRoles = context.user.roles;
          if (!this.recordsService.hasViewAccess(context.brand, context.user, userRoles, record)) {
            return { status: 'denied' as const, oid };
          }
          const metadata = (record.metadata ?? {}) as Record<string, unknown>;
          const fields: Record<string, unknown> = {};
          for (const field of config.relatedFields ?? []) {
            const value = getPath(metadata, field);
            if (value !== undefined) setPath(fields, field, value);
          }
          const title = getPath(metadata, 'title');
          return {
            status: 'resolved' as const,
            value: { oid, ...(typeof title === 'string' ? { title } : {}), fields },
          };
        } catch {
          return { status: 'failed' as const, oid };
        }
      })
    );
    for (const result of results) {
      if (result.status === 'resolved') config.relatedObjects.push(result.value);
      if (result.status === 'denied') config.accessDeniedOids.push(result.oid);
      if (result.status === 'failed') config.failedOids.push(result.oid);
    }
  }
}
