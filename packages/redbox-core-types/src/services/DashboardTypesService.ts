import { Observable, zip, of, firstValueFrom } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import { Services as services } from '../CoreService';
import { BrandingModel } from '../model/storage/BrandingModel';
import { TemplateCompileInput } from "@researchdatabox/sails-ng-common";

declare var sails: any;
declare var DashboardType: any;
declare var _: any;

export module Services {

  /**
   * Dashboard row configuration interface
   */
  export interface DashboardRowConfig {
    title: string;
    variable: string;
    template: string;
    initialSort?: 'asc' | 'desc';
    defaultSort?: boolean;
    secondarySort?: string;
  }

  /**
   * Dashboard table configuration interface
   */
  export interface DashboardTableConfig {
    rowConfig?: DashboardRowConfig[];
    rowRulesConfig?: any[];
    groupRowConfig?: DashboardRowConfig[];
    groupRowRulesConfig?: any[];
    formatRules?: any;
  }

  /**
   * Top-level dashboard configuration interface for a record type
   * This is configured at the recordtype level (not workflow-specific)
   */
  export interface RecordTypeDashboardConfig {
    /** Whether to show the admin sidebar on the dashboard page */
    showAdminSideBar?: boolean;
  }

  /**
   * Dashboard Types related functions...
   */
  export class DashboardTypes extends services.Core.Service {

    protected override _exportedMethods: any = [
      'bootstrap',
      'create',
      'get',
      'getAll',
      'getDashboardTableConfig',
      'getRecordTypeDashboardConfig',
      'extractDashboardTemplates'
    ];

    protected dashboardTypes: any[] = [];

    public async bootstrap(defBrand: BrandingModel): Promise<any> {
      let dashboardTypes = await DashboardType.find({ branding: defBrand.id });
      if (sails.config.appmode.bootstrapAlways) {
        await DashboardType.destroy({ branding: defBrand.id });
        dashboardTypes = [];
      }

      // if (_.isUndefined(dashboardTypes)) {
      //   dashboardTypes = [];
      // }
      sails.log.verbose(`DashboardTypes found: ${dashboardTypes} and boostrapAlways set to: ${sails.config.appmode.bootstrapAlways}`);
      if (_.isEmpty(dashboardTypes)) {
        var dashTypes = [];
        sails.log.verbose("Bootstrapping DashboardTypes definitions... ");
        for (let dashboardType in sails.config.dashboardtype) {
          dashboardTypes.push(dashboardType);
          let config = sails.config.dashboardtype[dashboardType];
          var createdDashboardType = await firstValueFrom(this.create(defBrand, dashboardType, config));
          dashTypes.push(createdDashboardType);
        };
        this.dashboardTypes = dashboardTypes;
        return dashTypes;
      }
      sails.log.verbose("Default DashboardTypes definition(s) exist.");
      sails.log.verbose(JSON.stringify(dashboardTypes));
      this.dashboardTypes = dashboardTypes;
      return dashboardTypes
    }

    public create(brand: BrandingModel, name: string, config: any) {

      sails.log.verbose(JSON.stringify(config));

      return super.getObservable(DashboardType.create({
        name: name,
        branding: brand.id,
        searchFilters: config.searchFilters,
        formatRules: config.formatRules,
        searchable: config.searchable
      }));
    }

    public get(brand: BrandingModel, name: string) {
      const criteria: any = { where: { branding: brand.id, name: name } };
      return super.getObservable(DashboardType.findOne(criteria));
    }

    public getAll(brand: BrandingModel) {
      const criteria: any = { where: { branding: brand.id } };
      return super.getObservable(DashboardType.find(criteria));
    }

    private defaultRowConfig: DashboardRowConfig[] = [
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
    ];

    /**
     * Get the dashboard table configuration for a specific record type and workflow stage.
     * Resolves configuration from workflow config, merging with any branding-specific overrides.
     * 
     * @param brand The branding model
     * @param recordType The record type name
     * @param workflowStage The workflow stage name
     * @returns The dashboard table configuration
     */
    public async getDashboardTableConfig(brand: BrandingModel, recordType: string, workflowStage: string): Promise<DashboardTableConfig | null> {
      try {
        // Get record type
        const recType = await firstValueFrom(RecordTypesService.get(brand, recordType));
        if (!recType) {
          sails.log.warn(`Record type not found: ${recordType}`);
          return null;
        }
        sails.log.verbose(`DashboardTypesService: Found record type ${recordType}`);

        // Get workflow step config
        const workflowStep = await firstValueFrom(WorkflowStepsService.get(recType, workflowStage));
        if (!workflowStep) {
          sails.log.warn(`Workflow step not found: ${workflowStage} for record type: ${recordType}`);
          return null;
        }
        sails.log.verbose(`DashboardTypesService: Found workflow step ${workflowStage}`);

        // Extract dashboard table config from workflow step
        const dashboardConfig = _.get(workflowStep, 'config.dashboard.table', {}) as DashboardTableConfig;
        sails.log.verbose(`DashboardTypesService: loaded config for ${recordType}/${workflowStage}, keys: ${Object.keys(dashboardConfig)}`);

        // TODO: In future, merge with user-configurable overrides from AppConfigService
        // const userOverrides = await AppConfigService.getAppConfigByBrandAndKey(brand.id, `dashboardTable_${recordType}_${workflowStage}`);
        // return _.merge({}, dashboardConfig, userOverrides);

        return dashboardConfig;
      } catch (error) {
        sails.log.error(`Error getting dashboard table config for ${recordType}/${workflowStage}:`, error);
        return null;
      }
    }

    /**
     * Get the top-level dashboard configuration for a specific record type.
     * This configuration is stored at the recordtype level, not the workflow step level.
     * 
     * @param brand The branding model
     * @param recordType The record type name
     * @returns The record type dashboard configuration, or null if not found
     */
    public async getRecordTypeDashboardConfig(brand: BrandingModel, recordType: string): Promise<RecordTypeDashboardConfig | null> {
      try {
        // Get record type - need full config, so not limiting fields
        const recType = await firstValueFrom(RecordTypesService.get(brand, recordType));
        if (!recType) {
          sails.log.warn(`Record type not found: ${recordType}`);
          return null;
        }

        // Extract top-level dashboard config from record type
        // This is different from the workflow-specific table config
        const dashboardConfig = _.get(recType, 'dashboard', {}) as RecordTypeDashboardConfig;
        sails.log.verbose(`DashboardTypesService: loaded record type dashboard config for ${recordType}: ${JSON.stringify(dashboardConfig)}`);

        return dashboardConfig;
      } catch (error) {
        sails.log.error(`Error getting record type dashboard config for ${recordType}:`, error);
        return null;
      }
    }

    /**
     * Extract templates from dashboard configuration and prepare them for pre-compilation.
     * Converts dashboard row templates to TemplateCompileInput format for Handlebars pre-compilation.
     * 
     * @param brand The branding model
     * @param recordType The record type name
     * @param workflowStage The workflow stage name
     * @param dashboardType The dashboard type name (default: standard)
     * @returns Array of templates ready for compilation
     */
    public async extractDashboardTemplates(brand: BrandingModel, recordType: string, workflowStage: string, dashboardType: string = 'standard'): Promise<TemplateCompileInput[]> {
      const entries: TemplateCompileInput[] = [];

      const dashboardConfig = await this.getDashboardTableConfig(brand, recordType, workflowStage);

      // Extract templates from rowConfig
      if (dashboardConfig) {
        const rowConfig: DashboardRowConfig[] = (!_.isEmpty(dashboardConfig.rowConfig)) ? (dashboardConfig.rowConfig as DashboardRowConfig[]) : this.defaultRowConfig;
        sails.log.verbose(`DashboardTypesService: extracting ${rowConfig.length} row templates. Using default? ${_.isEmpty(dashboardConfig.rowConfig)}`);
        for (let i = 0; i < rowConfig.length; i++) {
          const row = rowConfig[i] as DashboardRowConfig;
          if (row.template) {
            entries.push({
              key: [recordType, workflowStage, 'rowConfig', i.toString(), row.variable],
              kind: 'handlebars',
              value: row.template
            });
          }
        }

        // Extract templates from groupRowConfig  
        const groupRowConfig = dashboardConfig.groupRowConfig || [];
        for (let i = 0; i < groupRowConfig.length; i++) {
          const row = groupRowConfig[i];
          if (row.template) {
            entries.push({
              key: [recordType, workflowStage, 'groupRowConfig', i.toString(), row.variable],
              kind: 'handlebars',
              value: row.template
            });
          }
        }

        // Extract templates from rowRulesConfig
        const rowRulesConfig = dashboardConfig.rowRulesConfig || [];
        for (let ruleSetIdx = 0; ruleSetIdx < rowRulesConfig.length; ruleSetIdx++) {
          const ruleSet = rowRulesConfig[ruleSetIdx];
          const rules = ruleSet.rules || [];
          for (let ruleIdx = 0; ruleIdx < rules.length; ruleIdx++) {
            const rule = rules[ruleIdx];
            if (rule.renderItemTemplate) {
              entries.push({
                key: [recordType, workflowStage, 'rowRules', ruleSet.ruleSetName, ruleIdx.toString(), 'render'],
                kind: 'handlebars',
                value: rule.renderItemTemplate
              });
            }
            if (rule.evaluateRulesTemplate) {
              entries.push({
                key: [recordType, workflowStage, 'rowRules', ruleSet.ruleSetName, ruleIdx.toString(), 'evaluate'],
                kind: 'handlebars',
                value: rule.evaluateRulesTemplate
              });
            }
          }
        }

        // Extract templates from groupRowRulesConfig
        const groupRowRulesConfig = dashboardConfig.groupRowRulesConfig || [];
        for (let ruleSetIdx = 0; ruleSetIdx < groupRowRulesConfig.length; ruleSetIdx++) {
          const ruleSet = groupRowRulesConfig[ruleSetIdx];
          const rules = ruleSet.rules || [];
          for (let ruleIdx = 0; ruleIdx < rules.length; ruleIdx++) {
            const rule = rules[ruleIdx];
            if (rule.renderItemTemplate) {
              entries.push({
                key: [recordType, workflowStage, 'groupRowRules', ruleSet.ruleSetName, ruleIdx.toString(), 'render'],
                kind: 'handlebars',
                value: rule.renderItemTemplate
              });
            }
            if (rule.evaluateRulesTemplate) {
              entries.push({
                key: [recordType, workflowStage, 'groupRowRules', ruleSet.ruleSetName, ruleIdx.toString(), 'evaluate'],
                kind: 'handlebars',
                value: rule.evaluateRulesTemplate
              });
            }
          }
        }
      }

      // Extract templates from queryFilters (DashboardType config)
      try {
        const dashboardTypeModel = await firstValueFrom(this.get(brand, dashboardType));
        if (dashboardTypeModel) {
          const formatRules = dashboardTypeModel.formatRules;
          const queryFilters = _.get(formatRules, `queryFilters.${recordType}`);
          if (_.isArray(queryFilters)) {
            for (let i = 0; i < queryFilters.length; i++) {
              const queryFilter = queryFilters[i];
              if (_.isArray(queryFilter.filterFields)) {
                for (let j = 0; j < queryFilter.filterFields.length; j++) {
                  const filterField = queryFilter.filterFields[j];
                  if (filterField.template) {
                    entries.push({
                      key: [recordType, dashboardType, 'filters', i.toString(), 'fields', j.toString(), 'template'],
                      kind: 'handlebars',
                      value: filterField.template
                    });
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        sails.log.warn(`Could not load dashboard type ${dashboardType} for template extraction`, e);
      }

      sails.log.verbose(`Extracted ${entries.length} dashboard templates for ${recordType}/${workflowStage}`);
      return entries;
    }
  }
}

declare global {
  let DashboardTypesService: Services.DashboardTypes;
}
