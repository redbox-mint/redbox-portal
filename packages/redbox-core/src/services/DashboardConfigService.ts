import { firstValueFrom } from 'rxjs';
import { Services as services } from '../CoreService';
import { BrandingModel } from '../model/storage/BrandingModel';
import type { DashboardTableConfig, DashboardFormatRules } from '../config/workflow.config';
import type { DashboardViewDefinition, DashboardViewStepDefinition } from '../config/dashboardview.config';
import type {
  DashboardTableOverrideConfigData,
  RecordTypeOverride,
  ViewOverride,
  WorkflowStateDashboardConfig
} from '../configmodels/DashboardTableOverrideConfig';

type DashboardTypeDefinition = {
  name: string;
  description?: string;
  searchable?: boolean;
  system?: boolean;
  formatRules?: DashboardFormatRules;
  tableConfig?: DashboardTableConfig;
};

export namespace Services {
  export interface DashboardConfigInfo {
    recordTypes: Array<{ name: string; steps: string[] }>;
    views: Array<{ name: string; steps: string[] }>;
    dashboardTypes: DashboardTypeDefinition[];
  }

  export interface MergedDashboardConfigResult {
    dashboardType: string;
    inheritedTypeConfig: DashboardTableConfig;
    workflowConfig: DashboardTableConfig | null;
    overrideConfig: DashboardTableConfig | null;
    mergedConfig: DashboardTableConfig;
    formatRules: DashboardFormatRules;
  }

  export class DashboardConfig extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'bootstrap',
      'getDashboardConfigInfo',
      'getDashboardOverrides',
      'saveDashboardOverrides',
      'getWorkflowStateDashboardConfig',
      'saveWorkflowStateDashboardConfig',
      'getDashboardViewStepConfig',
      'saveDashboardViewStepConfig',
      'getEffectiveDashboardType',
      'getDefaultDashboardTableConfig',
      'getMergedDashboardTableConfig',
      'getMergedDashboardViewTableConfig',
      'getMergedDashboardTypeFormatRules'
    ];

    public async bootstrap(): Promise<void> {
      sails.log.verbose('DashboardConfigService bootstrapped');
    }

    public getDefaultDashboardTableConfig(): DashboardTableConfig {
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
      return _.isEmpty(config) ? this.getDefaultDashboardTableConfig() : (_.cloneDeep(config) as DashboardTableConfig);
    }

    private normalizeDashboardTypeDefinition(definition: DashboardTypeDefinition | null | undefined): DashboardTypeDefinition | null {
      if (!definition) {
        return null;
      }
      return {
        name: definition.name,
        description: definition.description,
        searchable: definition.searchable ?? true,
        system: definition.system ?? false,
        formatRules: _.cloneDeep(definition.formatRules ?? {}) as DashboardFormatRules,
        tableConfig: this.normalizeTableConfig(definition.tableConfig)
      };
    }

    private normalizeOverrides(overrides: DashboardTableOverrideConfigData | null | undefined): DashboardTableOverrideConfigData {
      return {
        recordTypes: overrides?.recordTypes ?? {},
        views: overrides?.views ?? {}
      };
    }

    private mergeTableConfigs(...configs: Array<DashboardTableConfig | null | undefined>): DashboardTableConfig {
      const validConfigs = configs.filter((config): config is DashboardTableConfig => !_.isEmpty(config));
      if (validConfigs.length === 0) {
        return this.getDefaultDashboardTableConfig();
      }
      return _.mergeWith({}, ...validConfigs, (_objValue: unknown, srcValue: unknown) => {
        if (_.isArray(srcValue)) {
          return _.cloneDeep(srcValue);
        }
        return undefined;
      }) as DashboardTableConfig;
    }

    private async getDashboardTypeDefinitionForBrand(brand: BrandingModel, dashboardType: string): Promise<DashboardTypeDefinition | null> {
      if (typeof DashboardTypesService !== 'undefined' && DashboardTypesService.getDashboardTypeDefinition) {
        const type = await DashboardTypesService.getDashboardTypeDefinition(brand, dashboardType);
        if (type) {
          return this.normalizeDashboardTypeDefinition({
            name: type.name,
            description: type.description,
            searchable: type.searchable,
            system: type.system,
            formatRules: type.formatRules as DashboardFormatRules,
            tableConfig: type.tableConfig
          });
        }
      }

      const fallback = await firstValueFrom(DashboardTypesService.get(brand, dashboardType));
      if (!fallback) {
        return null;
      }
      return this.normalizeDashboardTypeDefinition({
        name: fallback.name,
        description: fallback.description,
        searchable: fallback.searchable,
        system: fallback.system,
        formatRules: fallback.formatRules as DashboardFormatRules,
        tableConfig: fallback.tableConfig
      });
    }

    public async getDashboardConfigInfo(brand: BrandingModel): Promise<DashboardConfigInfo> {
      const recordTypes = await firstValueFrom(RecordTypesService.getAll(brand));
      const recordTypeInfos: Array<{ name: string; steps: string[] }> = [];
      for (const recType of recordTypes) {
        const steps = await firstValueFrom(WorkflowStepsService.getAllForRecordType(recType));
        recordTypeInfos.push({
          name: String((recType as unknown as { name?: string }).name ?? ''),
          steps: steps.map((s: { name?: string }) => s.name || '').filter(Boolean)
        });
      }

      const views: Array<{ name: string; steps: string[] }> = [];
      if (sails.config.dashboardview) {
        for (const viewName of Object.keys(sails.config.dashboardview)) {
          const viewDef = sails.config.dashboardview[viewName] as DashboardViewDefinition;
          views.push({
            name: viewName,
            steps: viewDef.steps?.map((s: DashboardViewStepDefinition) => s.name) || []
          });
        }
      }

      const dashboardTypes = typeof DashboardTypesService !== 'undefined' && DashboardTypesService.getAllDashboardTypeDefinitions
        ? await DashboardTypesService.getAllDashboardTypeDefinitions(brand)
        : [];

      return { recordTypes: recordTypeInfos, views, dashboardTypes };
    }

    public async getDashboardOverrides(brand: BrandingModel): Promise<DashboardTableOverrideConfigData> {
      const overrides = await AppConfigService.getAppConfigByBrandAndKey(String(brand.id), 'dashboardTableConfig');
      if (overrides && typeof overrides === 'object') {
        return this.normalizeOverrides(overrides as DashboardTableOverrideConfigData);
      }
      return this.normalizeOverrides(null);
    }

    public async saveDashboardOverrides(brand: BrandingModel, overrides: DashboardTableOverrideConfigData): Promise<DashboardTableOverrideConfigData> {
      const normalized = this.normalizeOverrides(overrides);
      await AppConfigService.createOrUpdateConfig(brand, 'dashboardTableConfig', normalized as Record<string, unknown>);
      return normalized;
    }

    private getWorkflowStateConfig(overrides: DashboardTableOverrideConfigData, recordType: string, workflowStage: string): WorkflowStateDashboardConfig | null {
      const recordTypeOverride: RecordTypeOverride | undefined = overrides.recordTypes?.[recordType];
      return recordTypeOverride?.steps?.[workflowStage] ?? recordTypeOverride?.default ?? null;
    }

    private getViewStateConfig(overrides: DashboardTableOverrideConfigData, viewName: string, stepName: string): WorkflowStateDashboardConfig | null {
      const viewOverride: ViewOverride | undefined = overrides.views?.[viewName];
      return viewOverride?.steps?.[stepName] ?? viewOverride?.default ?? null;
    }

    public async getWorkflowStateDashboardConfig(brand: BrandingModel, recordType: string, workflowStage: string): Promise<WorkflowStateDashboardConfig | null> {
      const overrides = await this.getDashboardOverrides(brand);
      return this.getWorkflowStateConfig(overrides, recordType, workflowStage);
    }

    public async saveWorkflowStateDashboardConfig(
      brand: BrandingModel,
      recordType: string,
      workflowStage: string,
      config: WorkflowStateDashboardConfig
    ): Promise<DashboardTableOverrideConfigData> {
      if (!config?.dashboardType) {
        throw new Error('dashboardType is required');
      }
      const overrides = await this.getDashboardOverrides(brand);
      const recordTypeOverride = overrides.recordTypes?.[recordType] ?? {};
      const steps = { ...(recordTypeOverride.steps ?? {}) };
      steps[workflowStage] = {
        dashboardType: config.dashboardType,
        ...( _.isEmpty(config.tableConfig) ? {} : { tableConfig: this.normalizeTableConfig(config.tableConfig) } )
      };
      overrides.recordTypes = {
        ...(overrides.recordTypes ?? {}),
        [recordType]: {
          ...(recordTypeOverride ?? {}),
          steps
        }
      };
      await this.saveDashboardOverrides(brand, overrides);
      return overrides;
    }

    public async getDashboardViewStepConfig(brand: BrandingModel, viewName: string, stepName: string): Promise<WorkflowStateDashboardConfig | null> {
      const overrides = await this.getDashboardOverrides(brand);
      return this.getViewStateConfig(overrides, viewName, stepName);
    }

    public async saveDashboardViewStepConfig(
      brand: BrandingModel,
      viewName: string,
      stepName: string,
      config: WorkflowStateDashboardConfig
    ): Promise<DashboardTableOverrideConfigData> {
      if (!config?.dashboardType) {
        throw new Error('dashboardType is required');
      }
      const overrides = await this.getDashboardOverrides(brand);
      const viewOverride = overrides.views?.[viewName] ?? {};
      const steps = { ...(viewOverride.steps ?? {}) };
      steps[stepName] = {
        dashboardType: config.dashboardType,
        ...( _.isEmpty(config.tableConfig) ? {} : { tableConfig: this.normalizeTableConfig(config.tableConfig) } )
      };
      overrides.views = {
        ...(overrides.views ?? {}),
        [viewName]: {
          ...(viewOverride ?? {}),
          steps
        }
      };
      await this.saveDashboardOverrides(brand, overrides);
      return overrides;
    }

    public async getEffectiveDashboardType(
      brand: BrandingModel,
      context: { kind: 'recordType'; recordType: string; workflowStage: string; fallbackDashboardType?: string } | { kind: 'view'; viewName: string; stepName: string; fallbackDashboardType?: string }
    ): Promise<string> {
      const fallback = context.fallbackDashboardType ?? 'standard';
      const overrides = await this.getDashboardOverrides(brand);

      if (context.kind === 'recordType') {
        const stateConfig = this.getWorkflowStateConfig(overrides, context.recordType, context.workflowStage);
        return stateConfig?.dashboardType ?? fallback;
      }

      const stateConfig = this.getViewStateConfig(overrides, context.viewName, context.stepName);
      const dashboardView = sails.config.dashboardview?.[context.viewName] as DashboardViewDefinition | undefined;
      return stateConfig?.dashboardType ?? dashboardView?.dashboardType ?? fallback;
    }

    public async getMergedDashboardTableConfig(
      brand: BrandingModel,
      recordType: string,
      workflowStage: string,
      fallbackDashboardType: string = 'standard'
    ): Promise<MergedDashboardConfigResult | null> {
      const recType = await firstValueFrom(RecordTypesService.get(brand, recordType));
      if (!recType) {
        sails.log.warn(`DashboardConfigService: Record type not found: ${recordType}`);
        return null;
      }

      const workflowStep = await firstValueFrom(WorkflowStepsService.get(recType, workflowStage));
      if (!workflowStep) {
        sails.log.warn(`DashboardConfigService: Workflow step not found: ${workflowStage} for record type: ${recordType}`);
        return null;
      }

      const overrides = await this.getDashboardOverrides(brand);
      const effectiveType = await this.getEffectiveDashboardType(brand, {
        kind: 'recordType',
        recordType,
        workflowStage,
        fallbackDashboardType
      });
      const typeDefinition = await this.getDashboardTypeDefinitionForBrand(brand, effectiveType);
      const inheritedTypeConfig = this.normalizeTableConfig(typeDefinition?.tableConfig);
      const rawWorkflowConfig = _.get(workflowStep, 'config.dashboard.table') as DashboardTableConfig | undefined;
      const workflowConfig = _.isEmpty(rawWorkflowConfig) ? null : this.normalizeTableConfig(rawWorkflowConfig);
      const recordTypeOverride = overrides.recordTypes?.[recordType];
      const overrideConfig = recordTypeOverride?.steps?.[workflowStage]?.tableConfig
        ?? recordTypeOverride?.default?.tableConfig
        ?? null;
      const mergedConfig = this.mergeTableConfigs(
        inheritedTypeConfig,
        workflowConfig,
        overrideConfig
      );
      const formatRules = _.merge(
        {},
        typeDefinition?.formatRules ?? {},
        workflowConfig?.formatRules ?? {},
        overrideConfig?.formatRules ?? {}
      ) as DashboardFormatRules;

      return {
        dashboardType: effectiveType,
        inheritedTypeConfig,
        workflowConfig,
        overrideConfig,
        mergedConfig,
        formatRules
      };
    }

    public async getMergedDashboardViewTableConfig(
      brand: BrandingModel,
      viewName: string,
      stepName: string,
      fallbackDashboardType: string = 'standard'
    ): Promise<MergedDashboardConfigResult | null> {
      const viewDef = sails.config.dashboardview?.[viewName] as DashboardViewDefinition | undefined;
      if (!viewDef) {
        sails.log.warn(`DashboardConfigService: Dashboard view not found: ${viewName}`);
        return null;
      }

      const stepDef = viewDef.steps?.find((s: DashboardViewStepDefinition) => s.name === stepName);
      if (!stepDef) {
        sails.log.warn(`DashboardConfigService: Dashboard view step not found: ${viewName}/${stepName}`);
        return null;
      }

      const overrides = await this.getDashboardOverrides(brand);
      const stateConfig = this.getViewStateConfig(overrides, viewName, stepName);
      const effectiveType = stateConfig?.dashboardType ?? viewDef.dashboardType ?? fallbackDashboardType;
      const typeDefinition = await this.getDashboardTypeDefinitionForBrand(brand, effectiveType);
      const inheritedTypeConfig = this.normalizeTableConfig(typeDefinition?.tableConfig);
      const rawWorkflowConfig = stepDef.dashboardTable;
      const workflowConfig = _.isEmpty(rawWorkflowConfig) ? null : this.normalizeTableConfig(rawWorkflowConfig);
      const viewOverride = overrides.views?.[viewName];
      const overrideConfig = viewOverride?.steps?.[stepName]?.tableConfig
        ?? viewOverride?.default?.tableConfig
        ?? null;
      const mergedConfig = this.mergeTableConfigs(
        inheritedTypeConfig,
        workflowConfig,
        overrideConfig
      );
      const formatRules = _.merge(
        {},
        typeDefinition?.formatRules ?? {},
        viewDef.formatRulesOverride ?? {},
        workflowConfig?.formatRules ?? {},
        overrideConfig?.formatRules ?? {}
      ) as DashboardFormatRules;

      return {
        dashboardType: effectiveType,
        inheritedTypeConfig,
        workflowConfig,
        overrideConfig,
        mergedConfig,
        formatRules
      };
    }

    public async getMergedDashboardTypeFormatRules(brand: BrandingModel, dashboardType: string): Promise<DashboardFormatRules | null> {
      const typeDefinition = await this.getDashboardTypeDefinitionForBrand(brand, dashboardType);
      return typeDefinition?.formatRules ?? null;
    }
  }
}

declare global {
  let DashboardConfigService: Services.DashboardConfig;
}
