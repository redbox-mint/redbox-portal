declare var _;
declare var sails;

export class DashboardConfigModel {
    name: string;
    baseRecordType: string;
    table: DashboardTableConfig;

    constructor(name:string, dashboardConfig:any) {
      
        this.name = name;
        this.baseRecordType = dashboardConfig.dashboardConfig;
        this.table = new DashboardTableConfig(dashboardConfig.table);

    }

    getSailsModel(brandId:string): any {
        return {
          branding: brandId,
            name: this.name,
            baseRecordType: this.baseRecordType,
            table: this.table
        }
      }

      static getSailsModelConfig():object {
        return  {
            attributes: {
              key: {
                type: 'string',
                unique: true
              },
              name: {
                type: 'string',
                required: true
              },
              branding: {
                model: 'brandingconfig',
                required: true
              },
              table: {
                type: 'json',
                required: true
              }
            },
              beforeCreate: function(dashboardType, cb) {
                  dashboardType.key = dashboardType.branding+'_'+dashboardType.name;
                  cb();
              }
          }          
      }

}


class DashboardTableConfig {

        
        rowConfig: DashboardTableRowConfig[] = []
        rowRulesConfig: DashboardTableRowRulesConfig[] = []
        groupRowConfig: DashboardTableRowConfig[] = []
        groupRowRulesConfig: DashboardTableRowRulesConfig[] = []
        formatRules: DashboardTypeFormatRules | undefined;
    
        constructor(dashboardTableConfig:any) {
          sails.log.error(JSON.stringify(dashboardTableConfig.rowConfig));
            this.rowConfig = _.get(dashboardTableConfig,'rowConfig',this.rowConfig)
            this.rowRulesConfig = _.get(dashboardTableConfig,'rowRulesConfig',this.rowRulesConfig)
            this.groupRowConfig = _.get(dashboardTableConfig,'groupRowConfig',this.groupRowConfig)
            this.groupRowRulesConfig = _.get(dashboardTableConfig,'groupRowRulesConfig',this.groupRowRulesConfig)
            this.formatRules = _.get(dashboardTableConfig,'formatRules',this.formatRules)
        }

      
}

enum FilterBaseType {
    record = 'record',
    user = 'user'
  }
  
  enum FilterMode {
    equal = 'equal',
    regex = 'regex'
  }
  
  class DashboardTypeFormatRulesFilterType {  
    filterBase: FilterBaseType = FilterBaseType.record
    filterBaseFieldOrValue: string = 'rdmp'
    filterField: string = 'metaMetadata.type'
    filterMode: FilterMode = FilterMode.equal
  }
  
  class DashboardTypeFormatRulesSortGroupBy {
   rowLevel:number = 0
   compareFieldValue:string = ''
   compareField:string = ''
   relatedTo:string = ''
  }
  
  enum DashboardTypeFormatRulesGroupBy {
    empty = '',
    groupedByRecordType = 'groupedByRecordType',
    groupedByRelationships = 'groupedByRelationships'
  }
  
  
  
  class DashboardTypeFormatRules {
    filterBy:DashboardTypeFormatRulesFilterType | undefined 
  
    recordTypeFilterBy: string | undefined
    filterWorkflowStepsBy:string[] = []
    sortBy:string = 'metaMetadata.lastSaveDate:-1'
    groupBy:DashboardTypeFormatRulesGroupBy = DashboardTypeFormatRulesGroupBy.empty
    sortGroupBy:DashboardTypeFormatRulesSortGroupBy[] = []
  
  }
  
  class DashboardType {
    name: string|undefined;
  
    formatRules: DashboardTypeFormatRules = new DashboardTypeFormatRules();
  
    constructor(data: any) {
      this.name = _.get(data, 'name', this.name)
      this.formatRules = _.get(data, 'formatRules', this.formatRules)
    }
  }
  
  class WorkflowStepConfigStepInfo {
    stage:string;
    stageLabel:string
    constructor(data:any) {
      this.stage = data.stage;
      this.stageLabel = data.stageLabel;
    }
  }
  
  class DashboardTableRowConfig {
    title:string;
    variable:string;
    template:string;
    initialSort:string|undefined;
  
    constructor(data:any) {
      this.title = data.title;
      this.variable = data.variable;
      this.template = data.template;
      this.initialSort = data.initialSort;
    }
  
  }
  
  class DashboardTableRowRule {
    name:string;
    action: string;
    renderItemTemplate: string;
    evaluateRulesTemplate: string;
  
    constructor(data:any) {
      this.name = data.name;
      this.action = data.action;
      this.renderItemTemplate = data.renderItemTemplate;
      this.evaluateRulesTemplate = data.evaluateRulesTemplate;
    }
  
  }
  
  class DashboardTableRowRulesConfig {
  
    ruleSetName:string;
    applyRuleSet:boolean;
    type:string;
    rules:DashboardTableRowRule[]
  
    constructor(data:any) {
      this.ruleSetName = data.ruleSetName;
      this.applyRuleSet = data.applyRuleSet;
      this.type = data.type;
      this.rules = data.rules;
    }
  }
  
  class WorkflowStepConfigDashboard
  {
    table:DashboardTableConfig;
  
    constructor(data:any) {
      this.table = data.table;
  
    }
  }
  
  class WorkflowStepConfig {
    authorization:any = {}
    workflow:WorkflowStepConfigStepInfo|undefined
    dashboard:WorkflowStepConfigDashboard|undefined
    baseRecordType:string = '';
  }
  
  class WorkflowStep {
    hidden: boolean;
    recordType: any;
    starting: boolean;
    config: WorkflowStepConfig;
    form: any;
    name: string;
  
    constructor(data:any) {
      this.name = data.name
      this.form = data.form
      this.config = data.config
      this.starting = data.starting
      this.recordType = data.recordType
      this.hidden = data.hidden
    }
  }
  
  enum DashboardTypeOptions{
    standard = 'standard', 
    workspace = 'workspace', 
    consolidated = 'consolidated'
  }
  