import { Observable, firstValueFrom, from } from 'rxjs';
import { Services as services } from '../CoreService';
import { BrandingModel } from '../model/storage/BrandingModel';
import { DashboardTypeModel } from '../model/storage/DashboardTypeModel';
import { TemplateCompileInput } from '@researchdatabox/sails-ng-common';
import type { DashboardViewDefinition, DashboardViewStepDefinition } from '../config/dashboardview.config';
import type { DashboardTableConfig as WorkflowDashboardTableConfig } from '../config/workflow.config';
import type { DashboardTypeConfigData, WorkflowStateDashboardConfig, RecordTypeOverride, ViewOverride } from '../configmodels/DashboardTableOverrideConfig';

type DashboardTypeDefinition = {
  name: string;
  description?: string;
  formatRules: Record<string, unknown>;
  tableConfig?: WorkflowDashboardTableConfig;
  searchable?: boolean;
  system?: boolean;
};

type DashboardTypeInput = {
  name?: string;
  description?: string;
  formatRules?: Record<string, unknown>;
  tableConfig?: WorkflowDashboardTableConfig;
  searchable?: boolean;
  system?: boolean;
};

type DashboardTypeCreateInput = DashboardTypeInput & { name: string };

type DashboardTypeUpdateInput = DashboardTypeInput;

export namespace Services {
  export interface DashboardRowConfig {
    title: string;
    variable: string;
    template: string;
    initialSort?: 'asc' | 'desc';
    defaultSort?: boolean;
    secondarySort?: string;
  }

  export type DashboardTableConfig = WorkflowDashboardTableConfig;

  export interface RecordTypeDashboardConfig {
    showAdminSideBar?: boolean;
  }

  export interface DashboardRule {
    renderItemTemplate?: string;
    evaluateRulesTemplate?: string;
    name?: string;
    action?: string;
    mode?: string;
  }

  export interface DashboardRuleSet {
    ruleSetName: string;
    applyRuleSet?: boolean;
    rules?: DashboardRule[];
    type?: string;
    separator?: string;
    mode?: string;
  }

  export type DashboardViewConfig = DashboardViewDefinition;
  export type DashboardViewStepConfig = DashboardViewStepDefinition;

  export type DashboardTypeConfig = Omit<DashboardTypeDefinition, 'name'> & DashboardTypeConfigData;

  export class DashboardTypes extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'bootstrap',
      'create',
      'createDashboardType',
      'get',
      'getAll',
      'getAllDashboardTypeDefinitions',
      'getDashboardTypeDefinition',
      'updateDashboardType',
      'deleteDashboardType',
      'getDashboardTableConfig',
      'getRecordTypeDashboardConfig',
      'extractDashboardTemplates',
      'getDashboardView',
      'getDashboardViewStep',
      'extractDashboardViewTemplates'
    ];

    protected dashboardTypes: DashboardTypeModel[] = [];

    private defaultTableConfig(): DashboardTableConfig {
      return {
        rowConfig: [
          {
            title: 'Record Title',
            variable: 'metadata.title',
            template: `<a href='{{rootContext}}/{{branding}}/{{portal}}/record/view/{{oid}}'>{{metadata.title}}</a>
            <span class="dashboard-controls">
              {{#if hasEditAccess}}
                <a href='{{rootContext}}/{{branding}}/{{portal}}/record/edit/{{oid}}' aria-label='{{t "edit-link-label"}}'><i class="fa fa-pencil" aria-hidden="true"></i></a>
              {{/if}}
            </span>
          `,
            initialSort: 'desc'
          },
          {
            title: 'header-ci',
            variable: 'metadata.contributor_ci.text_full_name',
            template: '{{#if metadata.contributor_ci}}{{metadata.contributor_ci.text_full_name}}{{/if}}',
            initialSort: 'desc'
          },
          {
            title: 'header-data-manager',
            variable: 'metadata.contributor_data_manager.text_full_name',
            template: '{{#if metadata.contributor_data_manager}}{{metadata.contributor_data_manager.text_full_name}}{{/if}}',
            initialSort: 'desc'
          },
          {
            title: 'header-created',
            variable: 'metaMetadata.createdOn',
            template: '{{formatDateLocale dateCreated "DATETIME_MED"}}',
            initialSort: 'desc'
          },
          {
            title: 'header-modified',
            variable: 'metaMetadata.lastSaveDate',
            template: '{{formatDateLocale dateModified "DATETIME_MED"}}',
            initialSort: 'desc',
            defaultSort: true
          }
        ]
      };
    }

    private normalizeTableConfig(config: DashboardTableConfig | null | undefined): DashboardTableConfig {
      return _.isEmpty(config) ? this.defaultTableConfig() : (_.cloneDeep(config) as DashboardTableConfig);
    }

    private isConfiguredSystemDashboardType(name: string | null | undefined): boolean {
      return name != null && Object.prototype.hasOwnProperty.call(sails.config.dashboardtype ?? {}, name);
    }

    private normalizeDashboardTypeRecord(type: DashboardTypeModel | null | undefined): DashboardTypeModel | null {
      if (!type) {
        return null;
      }
      return {
        ...type,
        description: type.description,
        formatRules: _.cloneDeep(type.formatRules ?? {}),
        tableConfig: this.normalizeTableConfig(type.tableConfig),
        searchable: type.searchable ?? true,
        system: type.system ?? this.isConfiguredSystemDashboardType(type.name)
      };
    }

    private normalizeDashboardTypeInput(input: DashboardTypeInput): DashboardTypeInput {
      return {
        ...input,
        formatRules: _.cloneDeep(input.formatRules ?? {}) as Record<string, unknown>,
        tableConfig: this.normalizeTableConfig(input.tableConfig),
        searchable: input.searchable ?? true,
        system: input.system ?? false
      };
    }

    private async findDashboardTypeRecord(brand: BrandingModel, name: string): Promise<DashboardTypeModel | null> {
      const record = await firstValueFrom(this.get(brand, name));
      return this.normalizeDashboardTypeRecord(record);
    }

    private addAssignedDashboardTypesFromConfig(value: unknown, assigned: Set<string>): void {
      if (_.isArray(value)) {
        for (const item of value) {
          this.addAssignedDashboardTypesFromConfig(item, assigned);
        }
        return;
      }
      if (_.isObject(value)) {
        const record = value as Record<string, unknown>;
        if (typeof record.dashboardType === 'string' && record.dashboardType.trim()) {
          assigned.add(record.dashboardType);
        }
        for (const child of Object.values(record)) {
          this.addAssignedDashboardTypesFromConfig(child, assigned);
        }
      }
    }

    private async listAssignedDashboardTypeNames(brand: BrandingModel): Promise<Set<string>> {
      const overrides = await AppConfigService.getAppConfigByBrandAndKey(String(brand.id), 'dashboardTableConfig') as Partial<{ recordTypes: Record<string, RecordTypeOverride>; views: Record<string, ViewOverride> }>;
      const assigned = new Set<string>();
      for (const recordType of Object.values(overrides.recordTypes ?? {}) as Array<RecordTypeOverride>) {
        if (recordType.default?.dashboardType) {
          assigned.add(recordType.default.dashboardType);
        }
        for (const step of Object.values(recordType.steps ?? {}) as Array<WorkflowStateDashboardConfig>) {
          if (step.dashboardType) {
            assigned.add(step.dashboardType);
          }
        }
      }
      for (const view of Object.values(overrides.views ?? {}) as Array<ViewOverride>) {
        if (view.default?.dashboardType) {
          assigned.add(view.default.dashboardType);
        }
        for (const step of Object.values(view.steps ?? {}) as Array<WorkflowStateDashboardConfig>) {
          if (step.dashboardType) {
            assigned.add(step.dashboardType);
          }
        }
      }
      if (sails.config.dashboardview) {
        for (const viewDef of Object.values(sails.config.dashboardview) as DashboardViewDefinition[]) {
          if (viewDef.dashboardType) {
            assigned.add(viewDef.dashboardType);
          }
        }
      }
      this.addAssignedDashboardTypesFromConfig(sails.config.recordtype, assigned);
      this.addAssignedDashboardTypesFromConfig(sails.config.workflow, assigned);
      return assigned;
    }

    public async bootstrap(defBrand: BrandingModel): Promise<DashboardTypeModel[]> {
      let dashboardTypes = await DashboardType.find({ branding: defBrand.id }) as DashboardTypeModel[];
      if (sails.config.appmode.bootstrapAlways) {
        await DashboardType.destroy({ branding: defBrand.id });
        dashboardTypes = [];
      }

      sails.log.verbose(`DashboardTypes found: ${dashboardTypes.length} and bootstrapAlways set to: ${sails.config.appmode.bootstrapAlways}`);
      if (_.isEmpty(dashboardTypes)) {
        const dashTypes: DashboardTypeModel[] = [];
        for (const dashboardTypeName in sails.config.dashboardtype) {
          const config = sails.config.dashboardtype[dashboardTypeName] as DashboardTypeConfig;
          const created = await firstValueFrom(this.create(defBrand, dashboardTypeName, {
            formatRules: config.formatRules,
            description: config.description,
            searchable: config.searchable,
            system: true,
            tableConfig: config.tableConfig ?? this.defaultTableConfig()
          }));
          dashTypes.push(created);
        }
        this.dashboardTypes = dashTypes.map((type) => this.normalizeDashboardTypeRecord(type) as DashboardTypeModel);
        return this.dashboardTypes;
      }

      this.dashboardTypes = dashboardTypes
        .map((type) => this.normalizeDashboardTypeRecord(type))
        .filter((type): type is DashboardTypeModel => type !== null);
      return this.dashboardTypes;
    }

    public create(brand: BrandingModel, name: string, config: DashboardTypeConfig): Observable<DashboardTypeModel> {
      return this.createDashboardType(brand, { name, ...config });
    }

    public createDashboardType(brand: BrandingModel, input: DashboardTypeCreateInput): Observable<DashboardTypeModel> {
      return from((async () => {
        const normalized = this.normalizeDashboardTypeInput(input);
        if (!normalized.name) {
          throw new Error('Dashboard type name is required');
        }
        const existing = await this.findDashboardTypeRecord(brand, normalized.name);
        if (existing) {
          throw new Error(`Dashboard type '${normalized.name}' already exists for brand '${brand.name}'`);
        }
        const created = await DashboardType.create({
          name: normalized.name,
          branding: brand.id,
          description: normalized.description,
          formatRules: normalized.formatRules,
          tableConfig: normalized.tableConfig,
          searchable: normalized.searchable,
          system: normalized.system
        });
        return this.normalizeDashboardTypeRecord(created as unknown as DashboardTypeModel) as DashboardTypeModel;
      })());
    }

    public get(brand: BrandingModel, name: string): Observable<DashboardTypeModel | null> {
      const criteria: { where: { branding: string; name: string } } = { where: { branding: brand.id, name: name } };
      return super.getObservable<DashboardTypeModel | null>(DashboardType.findOne(criteria));
    }

    public getAll(brand: BrandingModel): Observable<DashboardTypeModel[]> {
      const criteria: { where: { branding: string } } = { where: { branding: brand.id } };
      return super.getObservable<DashboardTypeModel[]>(DashboardType.find(criteria));
    }

    public async getAllDashboardTypeDefinitions(brand: BrandingModel): Promise<DashboardTypeModel[]> {
      const types = await firstValueFrom(this.getAll(brand));
      return types.map((type) => this.normalizeDashboardTypeRecord(type) as DashboardTypeModel);
    }

    public async getDashboardTypeDefinition(brand: BrandingModel, name: string): Promise<DashboardTypeModel | null> {
      const type = await this.findDashboardTypeRecord(brand, name);
      return type;
    }

    public updateDashboardType(brand: BrandingModel, name: string, input: DashboardTypeUpdateInput): Observable<DashboardTypeModel> {
      return from((async () => {
        const current = await this.findDashboardTypeRecord(brand, name);
        if (!current) {
          throw new Error(`Dashboard type '${name}' was not found for brand '${brand.name}'`);
        }
        if (input.name != null && input.name !== name) {
          throw new Error('Dashboard type name is immutable once created');
        }
        if (current.system && input.system === false) {
          throw new Error('System dashboard types cannot be converted to non-system types');
        }

        const updateData: Partial<DashboardTypeModel> = {
          description: input.description ?? current.description,
          formatRules: this.normalizeDashboardTypeInput({ ...current, ...input }).formatRules,
          tableConfig: this.normalizeTableConfig(input.tableConfig ?? current.tableConfig),
          searchable: input.searchable ?? current.searchable,
          system: input.system ?? current.system
        };

        const updated = await DashboardType.updateOne({ branding: brand.id, name }).set(updateData);
        if (!updated) {
          throw new Error(`Dashboard type '${name}' was not updated`);
        }
        return this.normalizeDashboardTypeRecord(updated as unknown as DashboardTypeModel) as DashboardTypeModel;
      })());
    }

    public deleteDashboardType(brand: BrandingModel, name: string): Observable<{ deleted: boolean }> {
      return from((async () => {
        const current = await this.findDashboardTypeRecord(brand, name);
        if (!current) {
          throw new Error(`Dashboard type '${name}' was not found for brand '${brand.name}'`);
        }
        if (current.system) {
          throw new Error(`System dashboard type '${name}' cannot be deleted`);
        }

        const assigned = await this.listAssignedDashboardTypeNames(brand);
        if (assigned.has(name)) {
          throw new Error(`Dashboard type '${name}' is assigned to one or more workflow states or dashboard views`);
        }

        await DashboardType.destroy({ branding: brand.id, name });
        return { deleted: true };
      })());
    }

    public async getDashboardTableConfig(brand: BrandingModel, recordType: string, workflowStage: string): Promise<DashboardTableConfig | null> {
      try {
        if (typeof DashboardConfigService !== 'undefined' && DashboardConfigService.getMergedDashboardTableConfig) {
          const mergedConfig = await DashboardConfigService.getMergedDashboardTableConfig(brand, recordType, workflowStage);
          if (mergedConfig) {
            sails.log.verbose(`DashboardTypesService: using merged config for ${recordType}/${workflowStage}`);
            return mergedConfig.mergedConfig;
          }
        }

        const recType = await firstValueFrom(RecordTypesService.get(brand, recordType));
        if (!recType) {
          sails.log.warn(`Record type not found: ${recordType}`);
          return null;
        }

        const workflowStep = await firstValueFrom(WorkflowStepsService.get(recType, workflowStage));
        if (!workflowStep) {
          sails.log.warn(`Workflow step not found: ${workflowStage} for record type: ${recordType}`);
          return null;
        }

        const dashboardConfig = _.get(workflowStep, 'config.dashboard.table', {}) as DashboardTableConfig;
        return this.normalizeTableConfig(dashboardConfig);
      } catch (error) {
        sails.log.error(`Error getting dashboard table config for ${recordType}/${workflowStage}:`, error);
        return null;
      }
    }

    public async getRecordTypeDashboardConfig(brand: BrandingModel, recordType: string): Promise<RecordTypeDashboardConfig | null> {
      try {
        const recType = await firstValueFrom(RecordTypesService.get(brand, recordType));
        if (!recType) {
          sails.log.warn(`Record type not found: ${recordType}`);
          return null;
        }

        const dashboardConfig = _.get(recType, 'dashboard', {}) as RecordTypeDashboardConfig;
        return dashboardConfig;
      } catch (error) {
        sails.log.error(`Error getting record type dashboard config for ${recordType}:`, error);
        return null;
      }
    }

    public getDashboardView(name: string): DashboardViewConfig | null {
      const dashboardView = _.get(sails.config.dashboardview, name) as DashboardViewConfig | undefined;
      if (dashboardView == null) {
        sails.log.warn(`Dashboard view not found: ${name}`);
        return null;
      }
      return dashboardView;
    }

    public getDashboardViewStep(name: string, stepName: string): DashboardViewStepConfig | null {
      const dashboardView = this.getDashboardView(name);
      if (!dashboardView) {
        return null;
      }

      const dashboardStep = (dashboardView.steps || []).find((step) => step.name === stepName) ?? null;
      if (!dashboardStep) {
        sails.log.warn(`Dashboard view step not found: ${name}/${stepName}`);
      }
      return dashboardStep;
    }

    private async extractQueryFilterTemplates(
      brand: BrandingModel,
      queryRecordType: string,
      dashboardType: string,
      templateKeyPrefix: string[]
    ): Promise<TemplateCompileInput[]> {
      const entries: TemplateCompileInput[] = [];
      try {
        const dashboardTypeModel = typeof DashboardConfigService !== 'undefined' && DashboardConfigService.getMergedDashboardTypeFormatRules
          ? await DashboardConfigService.getMergedDashboardTypeFormatRules(brand, dashboardType)
          : (await firstValueFrom(this.get(brand, dashboardType)))?.formatRules;
        const queryFilters = _.get(dashboardTypeModel as Record<string, unknown> | null, `queryFilters.${queryRecordType}`) as Array<{ filterFields?: Array<{ template?: string }> }> | undefined;
        if (_.isArray(queryFilters)) {
          for (let i = 0; i < queryFilters.length; i++) {
            const queryFilter = queryFilters[i];
            if (_.isArray(queryFilter.filterFields)) {
              for (let j = 0; j < queryFilter.filterFields.length; j++) {
                const filterField = queryFilter.filterFields[j];
                if (filterField.template) {
                  entries.push({
                    key: [...templateKeyPrefix, dashboardType, 'filters', i.toString(), 'fields', j.toString(), 'template'],
                    kind: 'handlebars',
                    value: filterField.template
                  });
                }
              }
            }
          }
        }
      } catch (e) {
        sails.log.warn(`Could not load dashboard type ${dashboardType} for template extraction`, e);
      }
      return entries;
    }

    private extractDashboardTableTemplates(configKeyPrefix: string[], dashboardConfig: DashboardTableConfig | null): TemplateCompileInput[] {
      const entries: TemplateCompileInput[] = [];

      if (!dashboardConfig) {
        return entries;
      }

      const rowConfig: DashboardRowConfig[] = (!_.isEmpty(dashboardConfig.rowConfig)) ? (dashboardConfig.rowConfig as DashboardRowConfig[]) : this.defaultTableConfig().rowConfig;
      for (let i = 0; i < rowConfig.length; i++) {
        const row = rowConfig[i] as DashboardRowConfig;
        if (row.template) {
          entries.push({
            key: [...configKeyPrefix, 'rowConfig', i.toString(), row.variable],
            kind: 'handlebars',
            value: row.template
          });
        }
      }

      const groupRowConfig = dashboardConfig.groupRowConfig || [];
      for (let i = 0; i < groupRowConfig.length; i++) {
        const row = groupRowConfig[i];
        if (row.template) {
          entries.push({
            key: [...configKeyPrefix, 'groupRowConfig', i.toString(), row.variable],
            kind: 'handlebars',
            value: row.template
          });
        }
      }

      const rowRulesConfig = dashboardConfig.rowRulesConfig || [];
      for (let ruleSetIdx = 0; ruleSetIdx < rowRulesConfig.length; ruleSetIdx++) {
        const ruleSet = rowRulesConfig[ruleSetIdx];
        const rules = ruleSet.rules || [];
        for (let ruleIdx = 0; ruleIdx < rules.length; ruleIdx++) {
          const rule = rules[ruleIdx];
          if (rule.renderItemTemplate) {
            entries.push({
              key: [...configKeyPrefix, 'rowRules', ruleSet.ruleSetName, ruleIdx.toString(), 'render'],
              kind: 'handlebars',
              value: rule.renderItemTemplate
            });
          }
          if (rule.evaluateRulesTemplate) {
            entries.push({
              key: [...configKeyPrefix, 'rowRules', ruleSet.ruleSetName, ruleIdx.toString(), 'evaluate'],
              kind: 'handlebars',
              value: rule.evaluateRulesTemplate
            });
          }
        }
      }

      const groupRowRulesConfig = dashboardConfig.groupRowRulesConfig || [];
      for (let ruleSetIdx = 0; ruleSetIdx < groupRowRulesConfig.length; ruleSetIdx++) {
        const ruleSet = groupRowRulesConfig[ruleSetIdx];
        const rules = ruleSet.rules || [];
        for (let ruleIdx = 0; ruleIdx < rules.length; ruleIdx++) {
          const rule = rules[ruleIdx];
          if (rule.renderItemTemplate) {
            entries.push({
              key: [...configKeyPrefix, 'groupRowRules', ruleSet.ruleSetName, ruleIdx.toString(), 'render'],
              kind: 'handlebars',
              value: rule.renderItemTemplate
            });
          }
          if (rule.evaluateRulesTemplate) {
            entries.push({
              key: [...configKeyPrefix, 'groupRowRules', ruleSet.ruleSetName, ruleIdx.toString(), 'evaluate'],
              kind: 'handlebars',
              value: rule.evaluateRulesTemplate
            });
          }
        }
      }

      return entries;
    }

    public async extractDashboardTemplates(brand: BrandingModel, recordType: string, workflowStage: string, dashboardType: string = 'standard'): Promise<TemplateCompileInput[]> {
      const dashboardConfig = await this.getDashboardTableConfig(brand, recordType, workflowStage);
      const entries = this.extractDashboardTableTemplates([recordType, workflowStage], dashboardConfig);
      entries.push(...await this.extractQueryFilterTemplates(brand, recordType, dashboardType, [recordType]));
      return entries;
    }

    public async extractDashboardViewTemplates(brand: BrandingModel, dashboardView: string, stepName: string, dashboardType?: string): Promise<TemplateCompileInput[]> {
      const dashboardViewConfig = this.getDashboardView(dashboardView);
      const dashboardStepConfig = this.getDashboardViewStep(dashboardView, stepName);
      if (!dashboardViewConfig || !dashboardStepConfig) {
        return [];
      }

      const resolvedDashboardType = dashboardType || dashboardViewConfig.dashboardType;
      let mergedTableConfig: DashboardTableConfig | null = dashboardStepConfig.dashboardTable ?? null;
      if (typeof DashboardConfigService !== 'undefined' && DashboardConfigService.getMergedDashboardViewTableConfig) {
        const mergedConfig = await DashboardConfigService.getMergedDashboardViewTableConfig(brand, dashboardView, stepName);
        mergedTableConfig = mergedConfig?.mergedConfig ?? mergedTableConfig;
      }

      const entries = this.extractDashboardTableTemplates([dashboardView, stepName], mergedTableConfig);
      entries.push(...await this.extractQueryFilterTemplates(brand, dashboardStepConfig.sourceRecordType, resolvedDashboardType, [dashboardView]));
      return entries;
    }
  }
}

declare global {
  let DashboardTypesService: Services.DashboardTypes;
}
