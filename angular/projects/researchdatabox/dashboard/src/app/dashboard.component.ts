import { Component, Inject, OnInit, ElementRef } from '@angular/core';
import { UtilityService, LoggerService, TranslationService, RecordService, PlanTable, Plan, RecordResponseTable } from '@researchdatabox/redbox-portal-core';
import * as _ from 'lodash';

@Component({
  selector: 'dashboard',
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  title = '@researchdatabox/dashboard';
  wfSteps: any = {}; 
  config: any = {};
  branding: string = '';
  portal: string = '';
  rootContext: string = '';
  workflowSteps: any = [];
  typeLabel: string = '';
  recordType: string;
  packageType: string;
  isReady: boolean = false; 
  records: any = {};
  sortMap: any = {};
  tableConfig: any = {};
  recordTitle: string = '';
  viewAsPackageType: boolean = false;
  dashboardTypesOptions: any = ['standard', 'package', 'custom']; //custom or consolidated?
  defaultDashboardTypeSelected: string = 'standard';
  dashboardTypeSelected: string;
  rulesService: object;
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

  defaultDashboardColumnMappings: any = {
    dateCreated: 'dateCreated',
    dateModified: 'dateModified',
    dashboardTitle: 'dashboardTitle',
    oid: 'oid',
    title: 'title',
    metadata: 'metadata.metadata',
    metaMetadata: 'metadata.metaMetadata',
    packageType: 'metadata.packageType',
    workflow: 'metadata.workflow',
    hasEditAccess: 'hasEditAccess'
  };

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
  // filter(record types, field values, workflow steps) and sort(simple or relationships hierarchy) 

  //Format rule modes:
  // per grouped records or table wide

  //TODO potentially merge with sortBy or merge sortFields attribute into the below object ?
  sortFields = ['metaMetadata.lastSaveDate', 'metaMetadata.createdOn', 'metadata.title', 'metadata.contributor_ci.text_full_name', 'metadata.contributor_data_manager.text_full_name'];
  
  defaultFormatCustomRules: any = {
    filterBy: [], 
    sortBy: '',
    groupBy: '', //values: notGroupedAnyOrder == empty, groupedByRecordType, groupedByRelationships 
    sortGroupBy: [], //values: as many levels as required?
    filterWorkflowStepsBy: 'all', //values: all or a particular type i.e. draft or finalised  
  };
  formatCustomRules: any = {};

  defaultGroupRowConfig = {};
  groupRowConfig = {};

  //Per group rules like show/hide buttons/activities(links) that apply to one group
  defaultGroupRowCustomRules: any = {};
  groupRowCustomRules: any = {};

  //Per each row rules show/hide fields or buttons/activities(links)
  defaultRowLevelCustomRules: any = {};
  rowLevelCustomRules: any = {};

  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(UtilityService) private utilService: UtilityService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(RecordService) private recordService: RecordService,
    elementRef: ElementRef
  ) {
    this.recordType = _.trim(elementRef.nativeElement.getAttribute('recordType'));
    this.packageType = _.trim(elementRef.nativeElement.getAttribute('packageType'));
    // console.log(`constructor this.recordType ${this.recordType}`);
    let dashboardType = _.trim(elementRef.nativeElement.getAttribute('dashboardType'));
    if(_.isUndefined(dashboardType) || _.isNull(dashboardType) || _.isEmpty(dashboardType)) {
      this.dashboardTypeSelected = this.defaultDashboardTypeSelected;
    } else {
      this.dashboardTypeSelected = dashboardType;
    }
    //TODO hack for older compatibility may or may not need to be removed later
    if(!_.isUndefined(this.packageType) && !_.isNull(this.packageType) && !_.isEmpty(this.packageType)) {
      this.dashboardTypeSelected = 'package';
    }

    console.log(`constructor dashboardTypeSelected ${this.dashboardTypeSelected}`);
    this.rulesService = this;
  }

  async ngOnInit() {
    this.loggerService.debug(`Dashboard waiting for deps to init...`); 
    await this.utilService.waitForDependencies([this.translationService, this.recordService]);
    this.loggerService.debug(`Dashboard initialised.`); 
    //this.recordType = 'rdmp';
    this.config = this.recordService.getConfig();
    console.log(this.config);
    this.rootContext = _.get(this.config, 'baseUrl');
    this.branding = _.get(this.config, 'branding');
    this.portal = _.get(this.config, 'portal');
    // this.workflowSteps = await this.recordService.getWorkflowSteps(this.recordType);
    // this.records = await this.recordService.getRecords(this.recordType,'draft',1);
    // console.log(this.records);
    // console.log(JSON.stringify(this.config));
    // this.loggerService.debug(this.config);
    // console.log(`config: rootContext ${this.rootContext} branding ${this.branding} portal ${this.portal}`);
    if(this.dashboardTypeSelected == 'standard') {
      this.typeLabel = `${this.translationService.t(`${this.recordType}-name-plural`)}`; //TODO check interpolation legacy had additonal attribute "Records"
      this.recordTitle = `${this.translationService.t(`${this.recordType}-title`)}`; //TODO check interpolation legacy had additonal attribute "Title"
      // this.typeLabel = this.getTranslated(`${this.recordType}-name-plural`, "Records");
      // this.recordTitle = this.getTranslated(`${this.recordType}-title`, "Title");
      await this.initRecordType(this.recordType);
    } else if(this.dashboardTypeSelected == 'package') {
      this.viewAsPackageType = true;
      this.typeLabel = `${this.translationService.t(`${this.packageType}-name-plural`)}`; //TODO check interpolation legacy had additonal attribute "Records"
      this.recordTitle = `${this.translationService.t(`${this.packageType}-title`)}`; //TODO check interpolation legacy had additonal attribute "Title"
      // this.typeLabel = this.getTranslated(`${this.packageType}-name-plural`, "Records");
      // this.recordTitle = this.getTranslated(`${this.packageType}-title`, "Title");
      await this.initPackageType(this.packageType);
    } else if(this.dashboardTypeSelected == 'custom') {
      this.typeLabel = `${this.translationService.t(`${this.recordType}-name-plural`)}`; //TODO check interpolation legacy had additonal attribute "Records"
      this.recordTitle = `${this.translationService.t(`${this.recordType}-title`)}`; //TODO check interpolation legacy had additonal attribute "Title"
      await this.initCustomView(this.recordType);
    }
    this.isReady = true;
  }

  // async ngAfterViewInit() {
  //   await this.utilService.waitForDependencies([this.translationService, this.recordService]);
  //   this.wfSteps = await this.recordService.getRelatedRecords('fbff59909c6111ed8dfd4d8104fc0287');
  //   this.isReady = true;
  // }

  async initPackageType(packageType: string) {
    // we're retrieving all recordTypes for this packageType
    const recordTypes: any = await this.recordService.getRecordTypes(packageType); //TODO needs to re-implement fit for purpose endpoint
    if (_.isEmpty(this.defaultTableConfig[0].title)) {
      this.defaultTableConfig[0].title= `${this.packageType}-title`, "Title";
    }
    let mainWorkflowStep = null;
    for (let recType of recordTypes) {
      const recTypeSteps: any = await this.recordService.getWorkflowSteps(recType.name);
      mainWorkflowStep = _.find(recTypeSteps, (step) => { return step.config.displayIndex == 0 });
      if (!_.isEmpty(mainWorkflowStep)) {
        break;
      }
    }
    if (_.isEmpty(mainWorkflowStep)) {
      console.error(`Failed to load the main workflow step for package type: ${packageType}`);
      return;
    }

    let stepTableConfig = this.defaultTableConfig;
    if(mainWorkflowStep.config.dashboard != null && mainWorkflowStep.config.dashboard.table != null && mainWorkflowStep.config.dashboard.table.rowConfig != null) {
      stepTableConfig = mainWorkflowStep.config.dashboard.table.rowConfig;
      this.sortFields = _.map(mainWorkflowStep.config.dashboard.table.rowConfig, (config) => { return config.variable });
    }

    this.tableConfig[packageType] = stepTableConfig;
    this.sortMap[packageType] = {};
    for (let rowConfig of stepTableConfig) {
      this.sortMap[packageType][rowConfig.variable] = {
        sort: rowConfig.initialSort
      };
    }
    // this.initTracker.target++;
    let stagedRecords: any = await this.recordService.getRecords('', '', 1, packageType, 'metaMetadata.lastSaveDate:-1');
    let planTable: PlanTable = this.evaluatePlanTableColumns(packageType, stagedRecords);
    // this.initTracker.loaded++;
    this.setDashboardTitle(planTable);
    this.records[packageType] = planTable;
    // this.checkIfHasLoaded();
  }

  async initRecordType(recordType: string) {
    let steps: any = await this.recordService.getWorkflowSteps(recordType);
    steps = _.orderBy(steps, ['config.displayIndex'], ['asc']);
    // this.workflowSteps = steps;
    // this.workflowSteps.push(steps);
    for (let step of steps) {
      step.recordTypeName = recordType;
      this.workflowSteps.push(step);
      let stepTableConfig = this.defaultTableConfig;
      if (_.isEmpty(this.defaultTableConfig[0].title)) {
        this.defaultTableConfig[0].title= `${recordType}-title`, "Title";
      }
      if(step.config.dashboard != null && step.config.dashboard.table != null && step.config.dashboard.table.rowConfig != null) {
        stepTableConfig = step.config.dashboard.table.rowConfig;
        this.sortFields = _.map(step.config.dashboard.table.rowConfig, (config) => { return config.variable });
      }
      this.tableConfig[step.name] = stepTableConfig;
      this.sortMap[step.name] = {};
      for (let rowConfig of stepTableConfig) {
        this.sortMap[step.name][rowConfig.variable] = {
          sort: rowConfig.initialSort
        };
      }
      // this.initTracker.target++;
      let stagedRecords: any = await this.recordService.getRecords(recordType,step.name,1,'','metaMetadata.lastSaveDate:-1');
      // console.log('-------------------------------------------------');
      // console.log(JSON.stringify(stagedRecords));
      // console.log('-------------------------------------------------');
      let planTable: PlanTable = this.evaluatePlanTableColumns(step.name, stagedRecords);
      // console.log(JSON.stringify(planTable));
      // console.log(planTable);
      // this.initTracker.loaded++;
      this.setDashboardTitle(planTable);
      // console.log(this.records);
      this.records[step.name] = planTable;
      // this.checkIfHasLoaded();
      // console.log(this.records);
    }
  }

  evaluatePlanTableColumns(stepName: string, stagedRecords: RecordResponseTable): PlanTable {
    let planTable: PlanTable = stagedRecords;
    let recordRows = [];
    for (let stagedRecord of stagedRecords.items) {

      const imports: any = {};
      imports.dateCreated = stagedRecord.dateCreated
      imports.dateModified = stagedRecord.dateModified
      imports.dashboardTitle = stagedRecord.dashboardTitle
      imports.oid = stagedRecord.oid
      imports.title = stagedRecord.title
      imports.metadata = stagedRecord.metadata['metadata'];
      imports.metaMetadata = stagedRecord.metadata['metaMetadata'];
      imports.packageType = stagedRecord.metadata['packageType'];
      imports.workflow = stagedRecord.metadata['workflow'];
      imports.hasEditAccess = stagedRecord.hasEditAccess;
      imports.branding = this.branding;
      imports.rootContext = this.rootContext;
      imports.portal = this.portal;
      imports.translationService = this.translationService;

      const templateData = {
        imports: imports
      };
      let record: any = {};
      let stepTableCOnfig = _.isEmpty(this.tableConfig[stepName]) ? this.defaultTableConfig : this.tableConfig[stepName];

      for (let rowConfig of stepTableCOnfig) {
        // console.log(rowConfig);
        const template = _.template(rowConfig.template, templateData);
        const templateRes = template();
        // console.log('-------------------------------------------------');
        // console.log(templateRes);
        // console.log('-------------------------------------------------');
        record[rowConfig.variable] = templateRes;
      }
      recordRows.push(record);
    }
    planTable.items = recordRows;

    return planTable;
  }
  
  async initCustomView(recordType: string) {
    //TODO need to implement ajax call that will retrieve redboxOids for which a user is primary/lead investigator "contributor_ci"
    //TODO check why the dashboardCustom config was not retrieved outside of dashboard config section
    let steps: any = await this.recordService.getWorkflowSteps(recordType);
    steps = _.orderBy(steps, ['config.displayIndex'], ['asc']);
    this.formatCustomRules = this.defaultFormatCustomRules;
    this.rowLevelCustomRules = this.defaultRowLevelCustomRules;
    this.groupRowConfig = this.defaultGroupRowConfig;
    this.groupRowCustomRules = this.defaultGroupRowCustomRules;
    for (let step of steps) {
      step.recordTypeName = recordType;
      this.workflowSteps.push(step);
      let stepTableConfig = this.defaultTableConfig;
      if (_.isEmpty(this.defaultTableConfig[0].title)) {
        this.defaultTableConfig[0].title= `${recordType}-title`, "Title";
      }
      if(!_.isUndefined(_.get(step,'config.dashboard.dashboardCustom')) 
        && !_.isUndefined(_.get(step, 'config.dashboard.dashboardCustom.table'))) {
        
        if(!_.isUndefined(_.get(step, 'config.dashboard.dashboardCustom.table.rowConfig'))) {
          stepTableConfig = _.get(step,'config.dashboard.dashboardCustom.table.rowConfig');
          this.sortFields = _.map(_.get(step,'config.dashboard.dashboardCustom.table.rowConfig'), (config) => { return config.variable });
        }

        if(!_.isUndefined(_.get(step, 'config.dashboard.dashboardCustom.table.rowRulesConfig'))) {
          this.rowLevelCustomRules = _.get(step, 'config.dashboard.dashboardCustom.table.rowRulesConfig');
        }

        if(!_.isUndefined(_.get(step, 'config.dashboard.dashboardCustom.table.groupRowConfig'))) {
          this.groupRowConfig = _.get(step, 'config.dashboard.dashboardCustom.table.groupRowConfig');
        }
        
        if(!_.isUndefined(_.get(step, 'config.dashboard.dashboardCustom.table.groupRowRulesConfig'))) {
          this.groupRowCustomRules = _.get(step, 'config.dashboard.dashboardCustom.table.groupRowRulesConfig');
        }

        if(!_.isUndefined(_.get(step, 'config.dashboard.dashboardCustom.table.formatCustomRules'))) {
          this.formatCustomRules = _.get(step, 'config.dashboard.dashboardCustom.table.formatCustomRules');
        }
      }
      this.tableConfig[step.name] = stepTableConfig;
      this.sortMap[step.name] = {};
      for (let rowConfig of stepTableConfig) {
        this.sortMap[step.name][rowConfig.variable] = {
          sort: rowConfig.initialSort
        };
      }

      //TODO define what step will be used for consolidated view? a normal step of the workflow or a special step? 
      //     perhaps a property may be needed to identify a particular workflow step as "special" ?

      //TODO double check if this initTracker variable and checkIfHasLoaded function are needed ???
      // this.initTracker.target++;
      
      //TODO double check what's the best way/right way to obtain current logged in user
      let filterString = 'alberto.zweinstein@example.edu.au';
      let filterFileds = 'metadata.contributor_ci.email';
      let filterMode = 'equal';
      let totalItems = 0;
      let startIndex = 1;
      let noItemsPerPage = 10; //TODO getRecords defaults to 10 perhaps add another param to set?
                               //TODO getRecords can retrieve all states if attribute draft is passed in empty ?
      let records = await this.recordService.getRecords(this.recordType,'draft',startIndex,'','',filterFileds,filterString,filterMode);
      // console.log('-------------------------------------------------');
      // console.log(JSON.stringify(records));
      // console.log('-------------------------------------------------');
      let items: any = _.get(records, 'items');
      let allItemsByGroup = [];
      let sortGroupBy = _.get(this.formatCustomRules,'sortGroupBy');
      for(let item of items) {

        let oid = _.get(item, 'oid');
        let itemsAfterApplyInnerGroupFormatRules = [];
        let itemsGroupRelated: any = await this.recordService.getRelatedRecords(oid);
        totalItems = totalItems + itemsGroupRelated.items.length;
        let getItems =_.get(itemsGroupRelated,'items');
        // console.log('-------------------------------------------------');
        // console.log(JSON.stringify(getItems));
        // console.log('-------------------------------------------------');

        //TODO assert this is the best place for group sort and other groupBy format settings ?
        //TODO make sure it works when simple format settings are set without groupBy etc
        if(!_.isUndefined(sortGroupBy)) {
          for(let getItem of getItems) {
            let getOid = _.get(getItem, 'oid'); 
            let countHerarchyLevels = sortGroupBy.length;
            for(let i = 0; i < countHerarchyLevels; i++) {
              let rule = _.find(sortGroupBy, function(o) { if(_.get(o,'rowLevel') == i){
                                                                            return o
                                                                          }});
              // console.log(JSON.stringify(rule));
              let compareField = _.get(rule,'compareField');
              let compareFieldValue = _.get(rule,'compareFieldValue');
              // console.log('compareField '+compareField);
              // console.log('compareFieldValue '+compareFieldValue);
              let row = _.find(getItems, function(obj) { if(_.get(obj,compareField) == compareFieldValue && 
                                                            _.get(obj,'oid') == getOid)
                                                            {
                                                              return obj
                                                            }});
              // console.log(row);
              if(!_.isUndefined(row) && !_.isNull(row) && !_.isEmpty(row)) {
                _.set(row, 'rowLevel', i);
                itemsAfterApplyInnerGroupFormatRules.push(row);
              }
            }
            if(!_.isEmpty(itemsAfterApplyInnerGroupFormatRules)) {
              let sorted = _.sortBy(itemsAfterApplyInnerGroupFormatRules, 'rowLevel');
              _.set(itemsGroupRelated,'items', sorted);
            }
          }
        }

        allItemsByGroup.push(itemsGroupRelated);

        //TODO consider remove the raw JSON boolean option or not?
        //customRules = await this.recordService.getRelatedRecords(oid, true);
      }
      
      // console.log('-------------------------------------------------');
      // console.log(JSON.stringify(allItemsByGroup));
      // console.log('-------------------------------------------------');

      let pageNumber = (startIndex / noItemsPerPage) + 1;
      _.set(this.wfSteps, 'totalItems', totalItems);
      _.set(this.wfSteps, 'currentPage', pageNumber);
      _.set(this.wfSteps, 'noItems', noItemsPerPage);
      _.set(this.wfSteps, 'itemsByGroup', true);
      _.set(this.wfSteps, 'groupedItems', allItemsByGroup);

      // console.log('-------------------------------------------------');
      // console.log(JSON.stringify(this.wfSteps));
      // console.log('-------------------------------------------------');

      //TODO load custom columns field mappings from mogodb config and override this.defaultDasboardColumnMappings
      let customColumnMappings = this.defaultDashboardColumnMappings;
      if(!_.isEmpty(this.dashboardColumnMappings)) {
        customColumnMappings = this.dashboardColumnMappings;
      }

      let planTable: PlanTable = this.evaluatePlanTableColumnsCustomRules(this.groupRowConfig, this.groupRowCustomRules, this.rowLevelCustomRules, customColumnMappings, step.name, this.wfSteps);
      // console.log(JSON.stringify(planTable));
      // console.log(planTable);
      // this.initTracker.loaded++;
      this.setDashboardTitle(planTable);
      // console.log(this.records);
      this.records[step.name] = planTable;
      // this.checkIfHasLoaded();
      // console.log(this.records);
    }
  }

  evaluatePlanTableColumnsCustomRules(groupRowConfig: any, groupRowCustomRules: any, rowLevelCustomRulesConfig: any, cunstomColumns: any , stepName: string, stagedOrGroupedRecords: any): PlanTable {
    
    let recordRows: any = [];
    let planTable: PlanTable = {
      items: [],
      totalItems: _.get(stagedOrGroupedRecords, 'totalItems'),
      currentPage: _.get(stagedOrGroupedRecords, 'currentPage'),
      noItems: _.get(stagedOrGroupedRecords, 'noItems')
    };

    let isGrouped = _.get(stagedOrGroupedRecords, 'itemsByGroup');
    let allGroupedItems = _.get(stagedOrGroupedRecords, 'groupedItems');
    if(isGrouped && !_.isUndefined(allGroupedItems)) {

      const imports: any = {};
      for(let groupedRecords of allGroupedItems) {

        let groupedItems = _.get(groupedRecords, 'items');

        for (let stagedRecord of groupedItems) {

          _.forEach(cunstomColumns, (value, key) => {
            _.set(imports, key, _.get(stagedRecord, value));
          });

          _.set(imports, 'branding',this.branding);
          _.set(imports, 'rootContext', this.rootContext);
          _.set(imports, 'portal', this.portal);
          _.set(imports, 'translationService', this.translationService);
          _.set(imports, 'rulesService', this.rulesService);
          _.set(imports, 'rulesConfig', rowLevelCustomRulesConfig);
          if(!_.isUndefined(groupRowCustomRules) && !_.isEmpty(groupRowCustomRules)) {
            _.set(imports, 'groupRulesConfig', groupRowCustomRules);
            _.set(imports, 'groupedItems', groupedItems);
          }

          let record: any = {};
          
          const templateData = {
            imports: imports
          };

          let stepTableConfig = _.isEmpty(this.tableConfig[stepName]) ? this.defaultTableConfig : this.tableConfig[stepName];

          for (let rowConfig of stepTableConfig) {

            // console.log(rowConfig);
            const template = _.template(rowConfig.template, templateData);
            const templateRes = template();
            // if(rowConfig.title == 'Actions') {
            //   console.log('-------------------------------------------------');
            //   console.log(templateRes);
            //   console.log('-------------------------------------------------');
            // }
            record[rowConfig.variable] = templateRes;
          }
          recordRows.push(record);
        }


        if(!_.isUndefined(groupRowConfig) && !_.isEmpty(groupRowConfig)) {

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
    }
    planTable.items = recordRows;

    return planTable;
  }
  
  async sortChanged(data: any) {
    let sortString = `${data.variable}:`;
    if (data.sort == 'desc') {
      sortString = sortString + "-1";
    } else {
      sortString = sortString + "1";
    }
    //TODO sort doesn't work in consolidated view
    let stagedRecords: any = await this.recordService.getRecords(this.recordType, data.step, 1, '', sortString);
    // console.log(stagedRecords);
    let planTable: PlanTable = this.evaluatePlanTableColumns(data.step, stagedRecords);
    // console.log(planTable);
    this.setDashboardTitle(stagedRecords);
    this.records[data.step] = stagedRecords;

    this.updateSortMap(data);
  }

  updateSortMap(sortData: any) {
    let sortDetails = this.sortMap[sortData.step];

    sortDetails = {};

    let stepRowConfig = this.tableConfig[sortData.step];
    for (let rowConfig of stepRowConfig) {
      sortDetails[rowConfig.variable] = {
        sort: null
      };

    }

    sortDetails[sortData.variable] = {
      sort: sortData.sort
    };

    this.sortMap[sortData.step] = sortDetails;
  }

  protected setDashboardTitle(planTable: PlanTable) {
    _.forEach(planTable.items, (plan: Plan) => {
      plan.dashboardTitle = (_.isUndefined(plan.title) || _.isEmpty(plan.title) || _.isEmpty(plan.title[0])) ? this.translationService.t('plan-with-no-title') : plan.title;
    });
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
          
        if(_.get(ruleSetConfig,'type') == 'multi-value') {
          let separator = _.get(ruleSetConfig,'separator');
          res = _.join(resArray, separator);
        } else {
          res = _.first(resArray);
        }
      }
    }

    return res;
  }

  public evaluateGroupRowRules(rulesConfig: any, groupedItems:any, ruleSetName:string) {
    
    let res: any;

    console.log(groupedItems);

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
          let evaluatedAction = '';
          let results = [];
          let action = _.get(rule, 'action');

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
            }
          }

          if(!_.isEmpty(results) && (_.indexOf(results, 'false') < 0)) {
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

        if(_.get(ruleSetConfig,'type') == 'multi-value') {
          let separator = _.get(ruleSetConfig,'separator');
          res = _.join(resArray, separator);
        } else {
          res = _.first(resArray);
        }
      }
    }

    return res;
  }

  //TODO migrated as is it may not be needed with new interpolation
  // protected getTranslated(key: string, defValue: string) {
  //   if (!_.isEmpty(key) && !_.isUndefined(key)) {
  //     if (_.isFunction(key.startsWith)) {
  //       let translatedValue = this.translationService.t(key);
  //       if (translatedValue == key) {
  //         return defValue;
  //       } else {
  //         return translatedValue;
  //       }
  //     } else {
  //       return key;
  //     }
  //   } else {
  //     return defValue;
  //   }
  // }

}


