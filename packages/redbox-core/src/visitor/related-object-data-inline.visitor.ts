import { get as getPath, set as setPath } from 'lodash';
import type { ILogger } from '../Logger';
import type { BrandingModel } from '../model/storage/BrandingModel';
import type { UserModel } from '../model/storage/UserModel';
import type { RecordsService } from '../RecordsService';
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

type AccessContext = { user: UserModel; brand: BrandingModel };

export class RelatedObjectDataInlineFormConfigVisitor extends FormConfigVisitor {
  protected override logName = 'RelatedObjectDataInlineFormConfigVisitor';
  private readonly pending: Promise<void>[] = [];

  constructor(logger: ILogger, private readonly recordsService: RecordsService) { super(logger); }

  async resolve(form: FormConfigOutline, metadata: Record<string, unknown>, context: AccessContext): Promise<void> {
    this.metadata = metadata;
    this.context = context;
    await form.accept(this);
    await Promise.all(this.pending);
  }

  private metadata: Record<string, unknown> = {};
  private context?: AccessContext;
  protected override async notImplemented(): Promise<void> {}
  override async visitFormConfig(item: FormConfigOutline): Promise<void> { for (const def of item.componentDefinitions) await def.accept(this); }
  override async visitRelatedObjectDataFormComponentDefinition(item: RelatedObjectDataFormComponentDefinitionOutline): Promise<void> { await item.component.accept(this); }
  override async visitRelatedObjectDataFieldComponentDefinition(item: RelatedObjectDataFieldComponentDefinitionOutline): Promise<void> { this.pending.push(this.resolveComponent(item)); }
  override async visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): Promise<void> { await item.component.accept(this); }
  override async visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): Promise<void> { for (const def of item.config?.componentDefinitions ?? []) await def.accept(this); }
  override async visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): Promise<void> { await item.component.accept(this); }
  override async visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): Promise<void> { for (const def of item.config?.tabs ?? []) await def.accept(this); }
  override async visitAccordionFormComponentDefinition(item: AccordionFormComponentDefinitionOutline): Promise<void> { await item.component.accept(this); }
  override async visitAccordionFieldComponentDefinition(item: AccordionFieldComponentDefinitionOutline): Promise<void> { for (const def of item.config?.panels ?? []) await def.accept(this); }
  override async visitAccordionPanelFormComponentDefinition(item: AccordionPanelFormComponentDefinitionOutline): Promise<void> { await item.component.accept(this); }
  override async visitAccordionPanelFieldComponentDefinition(item: AccordionPanelFieldComponentDefinitionOutline): Promise<void> { for (const def of item.config?.componentDefinitions ?? []) await def.accept(this); }
  override async visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): Promise<void> { await item.component.accept(this); }
  override async visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): Promise<void> { for (const def of item.config?.componentDefinitions ?? []) await def.accept(this); }
  override async visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): Promise<void> { await item.component.accept(this); }
  override async visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): Promise<void> { await item.config?.elementTemplate?.accept(this); }

  private async resolveComponent(item: RelatedObjectDataFieldComponentDefinitionOutline): Promise<void> {
    const config = item.config;
    if (!config || !this.context) return;
    const context = this.context;
    config.relatedObjects = [];
    config.accessDeniedOids = [];
    config.failedOids = [];
    const dataPath = (config.dataPath ?? '').replace(/^metadata\./, '');
    if (!dataPath) return;
    const raw = getPath(this.metadata, dataPath);
    const values = Array.isArray(raw) ? raw : [];
    const oidProperty = config.oidProperty ?? 'id';
    const oids = [...new Set(values.map(value => typeof value === 'string' ? value : getPath(value, oidProperty)).filter((oid): oid is string => typeof oid === 'string' && oid.length > 0))];
    if (oids.length > 50) this.logger.warn(`${this.logName}: limiting related object resolution from ${oids.length} to 50 records.`);
    const results = await Promise.all(oids.slice(0, 50).map(async oid => {
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
    }));
    for (const result of results) {
      if (result.status === 'resolved') config.relatedObjects.push(result.value);
      if (result.status === 'denied') config.accessDeniedOids.push(result.oid);
      if (result.status === 'failed') config.failedOids.push(result.oid);
    }
  }
}
