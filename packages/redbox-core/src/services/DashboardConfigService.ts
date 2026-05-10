import { Observable, firstValueFrom } from 'rxjs';
import { Services as services } from '../CoreService';
import { BrandingModel } from '../model/storage/BrandingModel';
import { DashboardTypeModel } from '../model/storage/DashboardTypeModel';
import type { DashboardTableConfig, DashboardFormatRules } from '../config/workflow.config';
import type { DashboardViewDefinition, DashboardViewStepDefinition } from '../config/dashboardview.config';
import type { DashboardTableOverrideConfigData, RecordTypeOverride, ViewOverride, DashboardTypeFormatRules } from '../configmodels/DashboardTableOverrideConfig';

export namespace Services {

  export interface DashboardConfigInfo {
    recordTypes: Array<{ name: string; steps: string[] }>;
    views: Array<{ name: string; steps: string[] }>;
    dashboardTypes: string[];
  }

  export interface MergedDashboardTableConfigResult {
    config: DashboardTableConfig | null;
    source: 'workflow' | 'override' | 'merged';
  }

  export interface MergedDashboardTypeFormatRulesResult {
    formatRules: DashboardFormatRules | null;
    source: 'default' | 'override' | 'merged';
  }

  export class DashboardConfig extends services.Core.Service {

    protected override _exportedMethods: string[] = [
      'bootstrap',
      'getDashboardConfigInfo',
      'getDashboardOverrides',
      'saveDashboardOverrides',
      'getDefaultDashboardTableConfig',
      'getMergedDashboardTableConfig',
      'getMergedDashboardViewTableConfig',
      'getMergedDashboardTypeFormatRules'
    ];

    public async bootstrap(): Promise<void> {
      sails.log.verbose('DashboardConfigService bootstrapped');
    }

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

    public getDefaultDashboardTableConfig(): DashboardTableConfig {
      return this.defaultTableConfig();
    }

    private normalizeTableConfig(config: DashboardTableConfig | null | undefined): DashboardTableConfig {
      return _.isEmpty(config) ? this.defaultTableConfig() : (_.cloneDeep(config) as DashboardTableConfig);
    }

    /**
     * Get metadata about dashboard-configurable entities for a brand.
     */
    public async getDashboardConfigInfo(brand: BrandingModel): Promise<DashboardConfigInfo> {
      const recordTypes = await firstValueFrom(RecordTypesService.getAll(brand));
      const recordTypeInfos: Array<{ name: string; steps: string[] }> = [];

      for (const recType of recordTypes) {
        const steps = await firstValueFrom(WorkflowStepsService.getAllForRecordType(recType));
        recordTypeInfos.push({
          name: (recType as unknown as { name: string }).name,
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

      const dashboardTypes: string[] = [];
      if (sails.config.dashboardtype) {
        dashboardTypes.push(...Object.keys(sails.config.dashboardtype));
      }

      return { recordTypes: recordTypeInfos, views, dashboardTypes };
    }

    /**
     * Get raw dashboard overrides from AppConfigService.
     */
    public async getDashboardOverrides(brand: BrandingModel): Promise<DashboardTableOverrideConfigData> {
      const overrides = await AppConfigService.getAppConfigByBrandAndKey(String(brand.id), 'dashboardTableConfig');
      if (overrides && typeof overrides === 'object') {
        return overrides as DashboardTableOverrideConfigData;
      }
      return { recordTypes: {}, views: {}, dashboardTypes: {} };
    }

    /**
     * Save dashboard overrides via AppConfigService.
     */
    public async saveDashboardOverrides(brand: BrandingModel, overrides: DashboardTableOverrideConfigData): Promise<DashboardTableOverrideConfigData> {
      const saved = await AppConfigService.createOrUpdateConfig(brand, 'dashboardTableConfig', overrides as Record<string, unknown>);
      return saved as DashboardTableOverrideConfigData;
    }

    /**
     * Get the merged dashboard table config for a record type and workflow stage.
     * Merges workflow config with record-type-level and step-level overrides.
     * Step-level overrides take precedence over record-type-level defaults.
     */
    public async getMergedDashboardTableConfig(brand: BrandingModel, recordType: string, workflowStage: string): Promise<DashboardTableConfig | null> {
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

      const baseConfig = this.normalizeTableConfig(_.get(workflowStep, 'config.dashboard.table') as DashboardTableConfig | undefined);
      const overrides = await this.getDashboardOverrides(brand);

      const recordTypeOverride: RecordTypeOverride | undefined = overrides.recordTypes?.[recordType];
      if (!recordTypeOverride) {
        return baseConfig;
      }

      let merged = _.cloneDeep(baseConfig);

      // Apply record-type default override first
      if (recordTypeOverride.default) {
        merged = _.merge({}, merged, recordTypeOverride.default);
      }

      // Apply step-specific override (wins over default)
      if (recordTypeOverride.steps?.[workflowStage]) {
        merged = _.merge({}, merged, recordTypeOverride.steps[workflowStage]);
      }

      return merged;
    }

    /**
     * Get the merged dashboard table config for a dashboard view and step.
     */
    public async getMergedDashboardViewTableConfig(brand: BrandingModel, viewName: string, stepName: string): Promise<DashboardTableConfig | null> {
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

      const baseConfig = stepDef.dashboardTable ?? null;
      const overrides = await this.getDashboardOverrides(brand);

      const viewOverride: ViewOverride | undefined = overrides.views?.[viewName];
      if (!viewOverride?.steps?.[stepName]) {
        return baseConfig;
      }

      return _.merge({}, baseConfig, viewOverride.steps[stepName]);
    }

    /**
     * Get merged format rules for a dashboard type.
     */
    public async getMergedDashboardTypeFormatRules(brand: BrandingModel, dashboardType: string): Promise<DashboardFormatRules | null> {
      const dashboardTypeModel = await firstValueFrom(DashboardTypesService.get(brand, dashboardType));
      const baseFormatRules = dashboardTypeModel?.formatRules as DashboardFormatRules | undefined;

      const overrides = await this.getDashboardOverrides(brand);
      const typeOverride: DashboardTypeFormatRules | undefined = overrides.dashboardTypes?.[dashboardType];

      if (!typeOverride?.formatRules) {
        return baseFormatRules ?? null;
      }

      return _.merge({}, baseFormatRules, typeOverride.formatRules);
    }
  }
}

declare global {
  let DashboardConfigService: Services.DashboardConfig;
}
