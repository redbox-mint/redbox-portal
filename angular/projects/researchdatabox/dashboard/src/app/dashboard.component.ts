import { Component, Inject, OnInit, ElementRef } from '@angular/core';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';
import { BaseComponent, UtilityService, LoggerService, TranslationService, RecordService, PlanTable, Plan, RecordResponseTable, UserService, ConfigService} from '@researchdatabox/portal-ng-common';
import * as _ from 'lodash';

@Component({
  selector: 'dashboard',
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent extends BaseComponent {
  config: any = {};
  branding: string = '';
  portal: string = '';
  rootContext: string = '';
  baseUrl:string = '';
  workflowSteps: any = [];
  typeLabel: string = '';
  recordType: string;
  packageType: string;
  records: any = {};
  sortMap: any = {};
  tableConfig: any = {};
  dashboardTypeOptions: any = ['standard', 'workspace', 'consolidated'];
  defaultDashboardTypeSelected: string = this.dashboardTypeOptions[0];
  dashboardTypeSelected: string;
  rulesService: object;
  currentUser: object = {};

  defaultTableConfig = [
    {
      title: 'Record Title',
      variable: 'metadata.title',
      template: `<a href='<%=rootContext%>/<%= branding %>/<%= portal %>/record/view/<%= oid %>'><%= metadata.title %></a>
          <span class="dashboard-controls">
            <% if(hasEditAccess) { %>
              <a href='<%=rootContext%>/<%= branding %>/<%= portal %>/record/edit/<%= oid %>' aria-label='<%= translationService.t('edit-link-label') %>'><i class="fa fa-pencil" aria-hidden="true"></i></a>
            <% } %>
          </span>
        `,
      initialSort: 'desc'
    },
    {
      title: 'header-ci',
      variable: 'metadata.contributor_ci.text_full_name',
      template: '<%= metadata.contributor_ci != undefined ? metadata.contributor_ci.text_full_name : "" %>',
      initialSort: 'desc'
    },
    {
      title: 'header-data-manager',
      variable: 'metadata.contributor_data_manager.text_full_name',
      template: '<%= metadata.contributor_data_manager != undefined ? metadata.contributor_data_manager.text_full_name : "" %>',
      initialSort: 'desc'
    },
    {
      title: 'header-created',
      variable: 'metaMetadata.createdOn',
      template: '<%= dateCreated %>',
      initialSort: 'desc'
    },
    {
      title: 'header-modified',
      variable: 'metaMetadata.lastSaveDate',
      template: '<%= dateModified %>',
      initialSort: 'desc'
    }
  ];

  dashboardColumnMappings: any = {
    dateCreated: 'dateCreated',
    dateModified: 'dateModified',
    dashboardTitle: 'dashboardTitle',
    oid: 'oid',
    title: 'title',
    metadata: 'metadata.metadata',
    metaMetadata: 'metadata.metaMetadata',
    packageType: 'metadata.packageType',
    workflow: 'metadata.workflow',
    hasEditAccess: 'hasEditAccess',
    recordType: 'metadata.metaMetadata.type'
  };

  //Format rule types :
  // filter(record types, field values, workflow steps) and sortBy(simple) or groupBy(relationships hierarchy ) 

  //Format rule modes:
  // per grouped records or table wide

  sortFields = ['metaMetadata.lastSaveDate', 'metaMetadata.createdOn', 'metadata.title', 'metadata.contributor_ci.text_full_name', 'metadata.contributor_data_manager.text_full_name'];
  
  defaultFormatRules: any = {
    filterBy: [], //filterBase can only have two values user or record
    filterWorkflowStepsBy: [], //values: empty array (all) or a list with particular types i.e. [ 'draft', 'finalised' ]  
    sortBy: 'metaMetadata.lastSaveDate:-1',
    groupBy: '', //values: empty (not grouped any order), groupedByRecordType, groupedByRelationships 
    sortGroupBy: [], //values: as many levels as required?
  };
  formatRules: any = {};

  defaultGroupRowConfig = {};
  groupRowConfig = {};

  //Per group rules like show/hide buttons/activities(links) that apply to one group
  defaultGroupRowRules: any = {};
  groupRowRules: any = {};

  //Per each row rules show/hide fields or buttons/activities(links) that apply to one row
  defaultRowLevelRules: any = {};
  rowLevelRules: any = {};

  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(UtilityService) private utilService: UtilityService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(RecordService) private recordService: RecordService,
    @Inject(UserService) private userService: UserService,
    @Inject(ConfigService) private configService: ConfigService,
    elementRef: ElementRef
  ) {
    super();
    this.recordType = _.trim(elementRef.nativeElement.getAttribute('recordType'));
    this.packageType = _.trim(elementRef.nativeElement.getAttribute('packageType'));
    let dashboardType = _.trim(elementRef.nativeElement.getAttribute('dashboardType'));
    if(_.isUndefined(dashboardType) || _.isNull(dashboardType) || _.isEmpty(dashboardType)) {
      this.dashboardTypeSelected = this.defaultDashboardTypeSelected;
    } else {
      this.dashboardTypeSelected = dashboardType;
    }
    if(!_.isUndefined(this.packageType) && !_.isNull(this.packageType) && !_.isEmpty(this.packageType)) {
      this.dashboardTypeSelected = this.packageType;
    }

    this.initDependencies = [this.translationService, this.recordService, this.userService];
    console.log(`constructor dashboardTypeSelected ${this.dashboardTypeSelected} ${this.packageType}`);
    this.rulesService = this;
  }

  protected override async initComponent():Promise<void> {
    if(_.indexOf(this.dashboardTypeOptions, this.dashboardTypeSelected) >= 0) {
      this.loggerService.debug(`Dashboard waiting for deps to init...`); 
      this.loggerService.debug(`Dashboard initialised.`); 
      this.config = this.recordService.getConfig();
      this.baseUrl = _.get(this.config, 'baseUrl');
      this.rootContext = this.configService.rootContext;
      this.branding = _.get(this.config, 'branding');
      this.portal = _.get(this.config, 'portal');
      this.typeLabel = `${this.translationService.t(`${this.recordType}-name-plural`)}` || 'Records';
      this.currentUser = await this.userService.getInfo();
      await this.initView(this.recordType);
    } else {
      this.loggerService.debug(`Unsupported Dashboard Type: ${this.dashboardTypeSelected}`); 
    }
  }
  
  public async initView(recordType: string) {

    //console.log('----------------------- initView -------------------------- '+this.dashboardTypeSelected);
    this.formatRules = this.defaultFormatRules;
    this.rowLevelRules = this.defaultRowLevelRules;
    this.groupRowConfig = this.defaultGroupRowConfig;
    this.groupRowRules = this.defaultGroupRowRules;

    let dashboardType: any = await this.recordService.getDashboardType(this.dashboardTypeSelected);
    let formatRules = _.get(dashboardType, 'formatRules');
    let startIndex = 1;
    if(!_.isUndefined(formatRules) && !_.isNull(formatRules) && !_.isEmpty(formatRules)) {
      //global format rules from dashboardtype.js config
      this.formatRules = formatRules;
    }

    let recordTypeFilterBy = _.get(this.formatRules, 'recordTypeFilterBy');
    if(!_.isUndefined(recordTypeFilterBy) && !_.isNull(formatRules) && !_.isEmpty(formatRules)) {
      recordType = recordTypeFilterBy;
    }
    
    let beforeFilterSteps: any = await this.recordService.getWorkflowSteps(recordType);
    
    let filterWorkflowStepsBy = _.get(this.formatRules, 'filterWorkflowStepsBy');
    let steps = [];
    
    if(!_.isUndefined(filterWorkflowStepsBy) && _.isArray(filterWorkflowStepsBy) && !_.isEmpty(filterWorkflowStepsBy)) {
      for (let bfStep of beforeFilterSteps) {
        let filterByStage = _.get(bfStep, 'config.workflow.stage');
        if(!_.isUndefined(filterByStage)) {
          let indexFilterByStage = _.indexOf(filterWorkflowStepsBy, filterByStage);
          if(indexFilterByStage >= 0) {
            steps.push(bfStep);
          }
        }
      }
    } else {
      steps = beforeFilterSteps;
    }
    steps = _.orderBy(steps, ['config.displayIndex'], ['asc']);

    for (let step of steps) {
      
      this.workflowSteps.push(step);
      // console.log('----------------------- step -------------------------- '+step.config.workflow.stageLabel);
      let stepTableConfig = this.defaultTableConfig;
      if (_.isEmpty(this.defaultTableConfig[0].title)) {
        this.defaultTableConfig[0].title= `${recordType}-title` || 'Title';
        // console.log('----------------------- title -------------------------- '+this.defaultTableConfig[0].title);
      }
      if(!_.isUndefined(_.get(step,'config.dashboard')) 
        && !_.isUndefined(_.get(step, 'config.dashboard.table'))) {
        
        if(!_.isUndefined(_.get(step, 'config.dashboard.table.rowConfig'))) {
          stepTableConfig = _.get(step,'config.dashboard.table.rowConfig');
          this.sortFields = _.map(_.get(step,'config.dashboard.table.rowConfig'), (config) => { return config.variable });
        }

        if(!_.isUndefined(_.get(step, 'config.dashboard.table.rowRulesConfig'))) {
          this.rowLevelRules = _.get(step, 'config.dashboard.table.rowRulesConfig');
          console.log(JSON.stringify(this.rowLevelRules));
        }

        if(!_.isUndefined(_.get(step, 'config.dashboard.table.groupRowConfig'))) {
          this.groupRowConfig = _.get(step, 'config.dashboard.table.groupRowConfig');
        }
        
        if(!_.isUndefined(_.get(step, 'config.dashboard.table.groupRowRulesConfig'))) {
          this.groupRowRules = _.get(step, 'config.dashboard.table.groupRowRulesConfig');
        }

        //formtatRules override at step level from workflow.js config
        if(!_.isUndefined(_.get(step, 'config.dashboard.table.formatRules'))) {
          this.formatRules = _.get(step, 'config.dashboard.table.formatRules');
        }
      }
      this.tableConfig[step.name] = stepTableConfig;
      this.sortMap[step.name] = {};
      for (let rowConfig of stepTableConfig) {
        this.sortMap[step.name][rowConfig.variable] = {
          sort: rowConfig.initialSort
        };
      }
      
      let packageType = '';
      let stepName = '';
      let evaluateStepName = '';
      if (this.dashboardTypeSelected == 'consolidated') {
        packageType = '';
        stepName = '';
        evaluateStepName = _.get(step, 'name');
        recordType = _.get(step, 'config.baseRecordType');
      } else if (this.dashboardTypeSelected == 'workspace') {
        stepName = '';
        packageType = this.packageType;
        evaluateStepName = _.get(step, 'name');
        recordType = '';
      } else {
        packageType = '';
        stepName = _.get(step, 'name');
        evaluateStepName = stepName;
      }

      await this.initStep(stepName, evaluateStepName, recordType, packageType, startIndex);
      
      // console.log('-------------------------------------------------');
      // console.log(JSON.stringify(this.records));
      // console.log('-------------------------------------------------');
    }
  }

  public async initStep(stepName: string, evaluateStepName: string, recordType: string, packageType: string, startIndex: number) {

    let filterBy = _.get(this.formatRules, 'filterBy');
    let filterString;
    let filterFileds;
    let filterMode;
    if(!_.isUndefined(filterBy) && !_.isEmpty(filterBy)) {
      let filterBase = _.get(filterBy,'filterBase');
      if(filterBase == 'user') {
        let filterBaseObj = this.currentUser;
        filterString =  _.get(filterBaseObj, _.get(filterBy,'filterBaseFieldOrValue'));
      } else if(filterBase == 'record') {
        filterString =  _.get(filterBy,'filterBaseFieldOrValue');
      }
      filterFileds = _.get(filterBy,'filterField');
      filterMode = _.get(filterBy,'filterMode');
    }

    let sortBy = _.get(this.formatRules, 'sortBy');
    let sortByString = '';
    if(!_.isUndefined(sortBy) && !_.isEmpty(sortBy)) {
      sortByString = sortBy;
    }

    //TODO getRecords defaults to 10 perhaps add another param to set?
    let stagedRecords = await this.recordService.getRecords(recordType, stepName, startIndex, packageType, sortByString, filterFileds, filterString, filterMode);

    let planTable: PlanTable;

    if (this.dashboardTypeSelected == 'consolidated') {
      let items: any = _.get(stagedRecords, 'items');
      let totalItems = _.get(stagedRecords, 'totalItems');
      let noItemsPerPage = _.get(stagedRecords, 'noItems');
      let allItemsByGroup = [];

      let groupBy = _.get(this.formatRules, 'groupBy');
      let sortGroupBy = _.get(this.formatRules, 'sortGroupBy');

      if (groupBy == 'groupedByRelationships' && !_.isUndefined(sortGroupBy) && !_.isEmpty(sortGroupBy)) {
        for (let item of items) {
          let oid = _.get(item, 'oid');
          let itemsAfterApplyInnerGroupFormatRules = [];
          
          let itemsGroupRelated: any = await this.recordService.getRelatedRecords(oid);
          let sortItems = _.get(itemsGroupRelated, 'items');
          let totalSortItems = sortItems.length;
          let countHerarchyLevels = sortGroupBy.length;

          for (let j = 0; j < totalSortItems; j++) {
            let parentTreeNodeOid = oid;
            for (let i = 0; i < countHerarchyLevels; i++) {
              let rule = _.find(sortGroupBy, function (o) {
                if (_.get(o, 'rowLevel') == i) {
                  return o;
                }
              });
              let compareField = _.get(rule, 'compareField');
              let compareFieldValue = _.get(rule, 'compareFieldValue');
              let relatedTo = _.get(rule, 'relatedTo');

              for (let sortItem of sortItems) {
                let relatedToOid = _.get(sortItem, relatedTo);
                let foundParent = relatedToOid == parentTreeNodeOid;
                let foundRecord = _.get(sortItem, compareField) == compareFieldValue;
                let foundTopLevelParent = relatedTo == '';
                if (foundRecord && (foundParent || foundTopLevelParent)) {
                  let currentOid = _.get(sortItem, 'oid');
                  let rowExists = _.find(itemsAfterApplyInnerGroupFormatRules, ['oid', currentOid]);
                  if (_.isUndefined(rowExists)) {
                    itemsAfterApplyInnerGroupFormatRules.push(sortItem);
                    if ((i + 1) < countHerarchyLevels) {
                      parentTreeNodeOid = currentOid;
                      break;
                    }
                  }
                }
              }
            }
          }

          if (!_.isEmpty(itemsAfterApplyInnerGroupFormatRules)) {
            _.set(itemsGroupRelated, 'items', itemsAfterApplyInnerGroupFormatRules);
          }

          allItemsByGroup.push(itemsGroupRelated);
        }
      } else if (groupBy == 'groupedByRecordType' && !_.isUndefined(sortGroupBy) && !_.isEmpty(sortGroupBy)) {

        let countHerarchyLevels = sortGroupBy.length;
        for (let i = 0; i < countHerarchyLevels; i++) {

          let rule = _.find(sortGroupBy, function (o) {
            if (_.get(o, 'rowLevel') == i) {
              return o;
            }
          });
          let compareFieldValue = _.get(rule, 'compareFieldValue');
          let itemsGroupRelated: any = await this.recordService.getRecords(compareFieldValue, stepName, startIndex, packageType, sortByString, filterFileds, filterString, filterMode);

          allItemsByGroup.push(itemsGroupRelated);
        }
      }

      let pageNumber = _.get(stagedRecords, 'currentPage');
      
      let groupedRecords: any = {};
      _.set(groupedRecords, 'totalItems', totalItems);
      _.set(groupedRecords, 'currentPage', pageNumber);
      _.set(groupedRecords, 'noItems', noItemsPerPage);
      _.set(groupedRecords, 'itemsByGroup', true);
      _.set(groupedRecords, 'groupedItems', allItemsByGroup);

      planTable = this.evaluatePlanTableColumns(this.groupRowConfig, this.groupRowRules, this.rowLevelRules, evaluateStepName, groupedRecords);

    } else {

      planTable = this.evaluatePlanTableColumns({}, {}, {}, evaluateStepName, stagedRecords);
    }

    this.records[evaluateStepName] = planTable;
  }

  public evaluatePlanTableColumns(groupRowConfig: any, groupRowRules: any, rowLevelRulesConfig: any, stepName: string, stagedOrGroupedRecords: any): PlanTable {
    
    let recordRows: any = [];
    let planTable: PlanTable = {
      items: [],
      totalItems: _.get(stagedOrGroupedRecords, 'totalItems'),
      currentPage: _.get(stagedOrGroupedRecords, 'currentPage'),
      noItems: _.get(stagedOrGroupedRecords, 'noItems')
    };

    let columnMappings = this.dashboardColumnMappings;

    let isGrouped = _.get(stagedOrGroupedRecords, 'itemsByGroup');
    let allGroupedItems = _.get(stagedOrGroupedRecords, 'groupedItems');
    if(isGrouped && !_.isUndefined(allGroupedItems) && !_.isEmpty(allGroupedItems)) {

      const imports: any = {};
      for(let groupedRecords of allGroupedItems) {

        let groupedItems = _.get(groupedRecords, 'items');

        for (let stagedRecord of groupedItems) {

          _.forEach(columnMappings, (value, key) => {
            _.set(imports, key, _.get(stagedRecord, value));
          });

          _.set(imports, 'branding',this.branding);
          _.set(imports, 'rootContext', this.rootContext);
          _.set(imports, 'baseUrl', this.baseUrl);
          _.set(imports, 'portal', this.portal);
          _.set(imports, 'translationService', this.translationService);
          _.set(imports, 'rulesService', this.rulesService);
          _.set(imports, 'rulesConfig', rowLevelRulesConfig);
          if(!_.isUndefined(groupRowRules) && !_.isEmpty(groupRowRules)) {
            _.set(imports, 'groupRulesConfig', groupRowRules);
            _.set(imports, 'groupedItems', groupedItems);
          }

          let record: any = {};
          
          const templateData = {
            imports: imports
          };

          let stepTableConfig = _.isEmpty(this.tableConfig[stepName]) ? this.defaultTableConfig : this.tableConfig[stepName];

          for (let rowConfig of stepTableConfig) {

            const template = _.template(rowConfig.template, templateData);
            const templateRes = template();
            record[rowConfig.variable] = templateRes;
          }
          recordRows.push(record);
        }

        //Don't evaluate group rules if no records were retrieved meaning recordsRows array has length 0
        if(!_.isUndefined(groupRowConfig) && !_.isEmpty(groupRowConfig) && recordRows.length > 0 && !_.isEmpty(imports)) {

          const groupTemplateData = {
            imports: imports
          };

          let groupRecord: any = {};
          for (let groupRow of groupRowConfig) {
            const groupTemplate = _.template(groupRow.template, groupTemplateData);
            const groupTemplateRes = groupTemplate();
            groupRecord[groupRow.variable] = groupTemplateRes;
          }
          recordRows.push(groupRecord);
        }
      }

    } else {

      let stagedOrGroupedRecordItems = _.get(stagedOrGroupedRecords, 'items');
      if(!_.isUndefined(stagedOrGroupedRecordItems) && !_.isEmpty(stagedOrGroupedRecordItems)) {

        for (let stagedRecord of stagedOrGroupedRecordItems) {

          const imports: any = {};
          
          _.forEach(columnMappings, (value, key) => {
            _.set(imports, key, _.get(stagedRecord, value));
          });
    
          _.set(imports, 'branding',this.branding);
          _.set(imports, 'rootContext', this.rootContext);
          _.set(imports, 'portal', this.portal);
          _.set(imports, 'translationService', this.translationService);
    
          const templateData = {
            imports: imports
          };
          let record: any = {};
          let stepTableCOnfig = _.isEmpty(this.tableConfig[stepName]) ? this.defaultTableConfig : this.tableConfig[stepName];
    
          for (let rowConfig of stepTableCOnfig) {
            
            const template = _.template(rowConfig.template, templateData);
            const templateRes = template();
            record[rowConfig.variable] = templateRes;
          }
          recordRows.push(record);
        }
      }
    }

    planTable.items = recordRows;

    return planTable;
  }
  


  public evaluateRowLevelRules(rulesConfig: any, metadata:any, metaMetadata:any, workflow:any, oid:string, ruleSetName:string) {
    
    let res: any;
    const imports: any = {};
    _.set(imports, 'metadata',metadata);
    _.set(imports, 'metaMetadata',metaMetadata);
    _.set(imports, 'workflow',workflow);
    _.set(imports, 'oid', oid);
    _.set(imports, 'branding',this.branding);
    _.set(imports, 'rootContext', this.rootContext);
    _.set(imports, 'portal', this.portal);
    _.set(imports, 'translationService', this.translationService);
    _.set(imports, '_', _); //import lodash

    let ruleSetConfig = _.find(rulesConfig,['ruleSetName',ruleSetName]);

    if(!_.isUndefined(ruleSetConfig)) {

      if(_.get(ruleSetConfig, 'applyRuleSet') == true) {

        let rules = _.get(ruleSetConfig, 'rules');
        let resArray = [];

        for(let rule of rules) {
          let name = _.get(rule, 'name');
          console.log('evaluating rule '+name);
          let renderItemTemplate = _.get(rule, 'renderItemTemplate');
          let evaluateRulesTemplate = _.get(rule, 'evaluateRulesTemplate');
          _.set(imports, 'name', name );
          
          const templateData = {
            imports: imports
          };

          let evaluatedAction = '';
          let action = _.get(rule, 'action');

          const templateRules = _.template(evaluateRulesTemplate, templateData);
          const result = templateRules();
          if(result == 'true')
          {
            evaluatedAction = action;
          }

          if(evaluatedAction == 'show') {
            const template = _.template(renderItemTemplate, templateData);
            const templateRes = template();
            resArray.push(templateRes);
          }
        }
          
        if(_.get(ruleSetConfig,'type') == 'multi-item-rendering') {
          let separator = _.get(ruleSetConfig,'separator');
          res = _.join(resArray, separator);
        } else {
          res = _.first(resArray);
        }
      }
    }

    return res;
  }

  public evaluateGroupRowRules(groupRulesConfig: any, groupedItems:any, ruleSetName:string) {
    
    let res: any;

    let ruleSetConfig = _.find(groupRulesConfig,['ruleSetName',ruleSetName]);

    if(!_.isUndefined(ruleSetConfig)) {

      if(_.get(ruleSetConfig, 'applyRuleSet') == true) {

        let rules = _.get(ruleSetConfig, 'rules');
        let resArray = [];

        for(let rule of rules) {

          let name = _.get(rule, 'name');
          console.log('evaluating rule '+name);
          let renderItemTemplate = _.get(rule, 'renderItemTemplate');
          let evaluateRulesTemplate = _.get(rule, 'evaluateRulesTemplate');
          let evaluatedAction = '';
          let results = [];
          let action = _.get(rule, 'action');
          let mode = _.get(rule, 'mode');

          const imports: any = {};
          for(let item of groupedItems) {

            _.set(imports, 'metadata',_.get(item,'metadata.metadata'));
            _.set(imports, 'metaMetadata',_.get(item,'metadata.metaMetadata'));
            _.set(imports, 'workflow',_.get(item,'metadata.workflow'));
            _.set(imports, 'branding',this.branding);
            _.set(imports, 'rootContext', this.rootContext);
            _.set(imports, 'portal', this.portal);
            _.set(imports, 'translationService', this.translationService);
            _.set(imports, '_', _); //import lodash
            let oid = _.get(item,'oid');
            _.set(imports, 'oid', oid);
            _.set(imports, 'name', name );
            
            const templateData = {
              imports: imports
            };

            const templateRules = _.template(evaluateRulesTemplate, templateData);
            const result = templateRules();
            if(result == 'true')
            {
              results.push(result);
            } else if(mode == 'all') {
              results.push(result);
            }
          }

          if(!_.isEmpty(results) && (_.indexOf(results, 'false') < 0) && (_.indexOf(results, 'true') >= 0)) {
             evaluatedAction =  action;
          }
          
          const groupTemplateData = {
            imports: imports
          };
          if(evaluatedAction == 'show') {
            const template = _.template(renderItemTemplate, groupTemplateData);
            const templateRes = template();
            resArray.push(templateRes);
          }
        }

        if(_.get(ruleSetConfig,'type') == 'multi-item-rendering') {
          let separator = _.get(ruleSetConfig,'separator');
          res = _.join(resArray, separator);
        } else {
          res = _.first(resArray);
        }
      }
    }

    return res;
  }

  public async sortChanged(data: any) {
    
    if(this.dashboardTypeSelected == 'standard' || this.dashboardTypeSelected == 'workspace') {
      let sortString = `${data.variable}:`;
      if (data.sort == 'desc') {
        sortString = sortString + "-1";
      } else {
        sortString = sortString + "1";
      }
      let stagedRecords: any;
      if(this.dashboardTypeSelected == 'workspace') {
        stagedRecords = await this.recordService.getRecords('', '', 1, this.dashboardTypeSelected, sortString);
      } else {
        stagedRecords = await this.recordService.getRecords(this.recordType, data.step, 1, '', sortString);
      }
      
      let planTable: PlanTable = this.evaluatePlanTableColumns({},{},{}, data.step, stagedRecords);
      
      this.records[data.step] = planTable;
  
      this.updateSortMap(data);
    } 
  }

  private updateSortMap(sortData: any) {
    let stepTableConfig = this.tableConfig[sortData.step];
    for (let rowConfig of stepTableConfig) {
      this.sortMap[sortData.step][rowConfig.variable] = { sort: rowConfig.noSort };
    }

    this.sortMap[sortData.step][sortData.variable] = { sort: sortData.sort };
  }

  public async pageChanged(event: PageChangedEvent, step: string) {
    
    let sortDetails = this.sortMap[step];

    if (this.dashboardTypeSelected == 'standard') {
      let stagedRecords = await this.recordService.getRecords(this.recordType, step, event.page, '', this.getSortString(sortDetails));
      let planTable: PlanTable = this.evaluatePlanTableColumns({},{},{}, step, stagedRecords);
      this.records[step] = planTable;
    } else if(this.dashboardTypeSelected == 'workspace'){
      let stagedRecords = await this.recordService.getRecords('', '', event.page, this.packageType, this.getSortString(sortDetails)); 
      let planTable: PlanTable = this.evaluatePlanTableColumns({},{},{}, this.packageType, stagedRecords);
      this.records[this.packageType] = planTable;
    } else if(this.dashboardTypeSelected == 'consolidated') {
      let packageType = '';
      let stepName = '';
      let evaluateStepName = _.get(this.workflowSteps[0], 'name');
      let recordType = _.get(this.workflowSteps[0], 'config.baseRecordType');
      await this.initStep(stepName, evaluateStepName, recordType, packageType, event.page);
    }
  }

  private getSortString(sortDetails: any) {

    let fields = this.sortFields;

    for (let i = 0; i < fields.length; i++) {
      let sortField = fields[i];
      let sortString = `${sortField}:`;

      if (sortDetails[sortField].sort != null) {
        if (sortDetails[sortField].sort == 'desc') {
          sortString = sortString + "-1";
        } else {
          sortString = sortString + "1";
        }
        return sortString;
      }
    }
    return 'metaMetadata.lastSaveDate:-1';
  }

}


