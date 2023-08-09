import { Component, Inject, ElementRef } from '@angular/core';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';
import { BaseComponent, UtilityService, LoggerService, TranslationService, RecordService, PlanTable, UserService, ConfigService } from '@researchdatabox/portal-ng-common';
import { get as _get, set as _set, isEmpty as _isEmpty, isUndefined as _isUndefined, trim as _trim, isNull as _isNull, orderBy as _orderBy, map as _map, find as _find, indexOf as _indexOf, isArray as _isArray, forEach as _forEach, join as _join, first as _first } from 'lodash-es';

import { LoDashTemplateUtilityService } from 'projects/researchdatabox/portal-ng-common/src/lib/lodash-template-utility.service';

@Component({
  selector: 'dashboard',
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent extends BaseComponent {
  config: any = {};
  branding: string = '';
  portal: string = '';
  rootContext: string = '';
  baseUrl: string = '';
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
  enableSort: boolean = true;

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
      template: '<%= util.formatDateLocale(util.parseDateString(dateCreated), "DATETIME_MED") %>',
      initialSort: 'desc'
    },
    {
      title: 'header-modified',
      variable: 'metaMetadata.lastSaveDate',
      template: '<%= util.formatDateLocale(util.parseDateString(dateModified),"DATETIME_MED") %>',
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
    @Inject(LoDashTemplateUtilityService) private lodashTemplateUtilityService: LoDashTemplateUtilityService,
    elementRef: ElementRef
  ) {
    super();
    this.recordType = _trim(elementRef.nativeElement.getAttribute('recordType'));
    this.packageType = _trim(elementRef.nativeElement.getAttribute('packageType'));
    let dashboardType = _trim(elementRef.nativeElement.getAttribute('dashboardType'));
    if (_isUndefined(dashboardType) || _isNull(dashboardType) || _isEmpty(dashboardType)) {
      this.dashboardTypeSelected = this.defaultDashboardTypeSelected;
    } else {
      this.dashboardTypeSelected = dashboardType;
    }
    if (!_isUndefined(this.packageType) && !_isNull(this.packageType) && !_isEmpty(this.packageType)) {
      this.dashboardTypeSelected = this.packageType;
    }

    this.initDependencies = [this.translationService, this.recordService, this.userService];
    console.log(`constructor dashboardTypeSelected ${this.dashboardTypeSelected} ${this.packageType}`);
    this.rulesService = this;
  }

  protected override async initComponent(): Promise<void> {
    if (_indexOf(this.dashboardTypeOptions, this.dashboardTypeSelected) >= 0) {
      this.loggerService.debug(`Dashboard waiting for deps to init...`);
      this.loggerService.debug(`Dashboard initialised.`);
      this.config = this.recordService.getConfig();
      this.baseUrl = _get(this.config, 'baseUrl');
      this.rootContext = this.configService.rootContext;
      this.branding = _get(this.config, 'branding');
      this.portal = _get(this.config, 'portal');
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
    let formatRules = _get(dashboardType, 'formatRules');
    let startIndex = 1;
    if (!_isUndefined(formatRules) && !_isNull(formatRules) && !_isEmpty(formatRules)) {
      //global format rules from dashboardtype.js config
      this.formatRules = formatRules;
    }

    let recordTypeFilterBy = _get(this.formatRules, 'recordTypeFilterBy');
    if (!_isUndefined(recordTypeFilterBy) && !_isNull(formatRules) && !_isEmpty(formatRules)) {
      recordType = recordTypeFilterBy;
    }

    let beforeFilterSteps: any = await this.recordService.getWorkflowSteps(recordType);

    let filterWorkflowStepsBy = _get(this.formatRules, 'filterWorkflowStepsBy');
    let steps = [];

    if (!_isUndefined(filterWorkflowStepsBy) && _isArray(filterWorkflowStepsBy) && !_isEmpty(filterWorkflowStepsBy)) {
      for (let bfStep of beforeFilterSteps) {
        let filterByStage = _get(bfStep, 'config.workflow.stage');
        if (!_isUndefined(filterByStage)) {
          let indexFilterByStage = _indexOf(filterWorkflowStepsBy, filterByStage);
          if (indexFilterByStage >= 0) {
            steps.push(bfStep);
          }
        }
      }
    } else {
      steps = beforeFilterSteps;
    }
    steps = _orderBy(steps, ['config.displayIndex'], ['asc']);

    for (let step of steps) {

      this.workflowSteps.push(step);
      // console.log('----------------------- step -------------------------- '+step.config.workflow.stageLabel);
      let stepTableConfig = this.defaultTableConfig;
      if (_isEmpty(this.defaultTableConfig[0].title)) {
        this.defaultTableConfig[0].title = `${recordType}-title` || 'Title';
        // console.log('----------------------- title -------------------------- '+this.defaultTableConfig[0].title);
      }
      if (!_isUndefined(_get(step, 'config.dashboard'))
        && !_isUndefined(_get(step, 'config.dashboard.table'))) {

        if (!_isUndefined(_get(step, 'config.dashboard.table.rowConfig'))) {
          stepTableConfig = _get(step, 'config.dashboard.table.rowConfig');
          this.sortFields = _map(_get(step, 'config.dashboard.table.rowConfig'), (config) => { return config.variable });
        }

        if (!_isUndefined(_get(step, 'config.dashboard.table.rowRulesConfig'))) {
          this.rowLevelRules = _get(step, 'config.dashboard.table.rowRulesConfig');
          console.log(JSON.stringify(this.rowLevelRules));
        }

        if (!_isUndefined(_get(step, 'config.dashboard.table.groupRowConfig'))) {
          this.groupRowConfig = _get(step, 'config.dashboard.table.groupRowConfig');
        }

        if (!_isUndefined(_get(step, 'config.dashboard.table.groupRowRulesConfig'))) {
          this.groupRowRules = _get(step, 'config.dashboard.table.groupRowRulesConfig');
        }

        //formtatRules override at step level from workflow.js config
        if (!_isUndefined(_get(step, 'config.dashboard.table.formatRules'))) {
          this.formatRules = _get(step, 'config.dashboard.table.formatRules');
        }
      }

      this.tableConfig[step.name] = stepTableConfig;
      this.sortMap[step.name] = {};
      for (let rowConfig of stepTableConfig) {
        this.sortMap[step.name][rowConfig.variable] = {
          sort: rowConfig.initialSort
        };
      }
      
      if(this.dashboardTypeSelected == 'consolidated') {
        this.enableSort = false;
      } else {
        this.enableSort = true;
      }

      if(this.dashboardTypeSelected == 'consolidated') {
        this.enableSort = false;
      } else {
        this.enableSort = true;
      }

      let packageType = '';
      let stepName = '';
      let evaluateStepName = '';
      if (this.dashboardTypeSelected == 'consolidated') {
        packageType = '';
        stepName = '';
        evaluateStepName = _get(step, 'name');
        recordType = _get(step, 'config.baseRecordType');
      } else if (this.dashboardTypeSelected == 'workspace') {
        stepName = '';
        packageType = this.packageType;
        evaluateStepName = _get(step, 'name');
        recordType = '';
      } else {
        packageType = '';
        stepName = _get(step, 'name');
        evaluateStepName = stepName;
      }

      await this.initStep(stepName, evaluateStepName, recordType, packageType, startIndex);

      // console.log('-------------------------------------------------');
      // console.log(JSON.stringify(this.records));
      // console.log('-------------------------------------------------');
    }
  }

  public async initStep(stepName: string, evaluateStepName: string, recordType: string, packageType: string, startIndex: number) {

    let filterBy = _get(this.formatRules, 'filterBy');
    let filterString;
    let filterFileds;
    let filterMode;
    if (!_isUndefined(filterBy) && !_isEmpty(filterBy)) {
      let filterBase = _get(filterBy, 'filterBase');
      if (filterBase == 'user') {
        let filterBaseObj = this.currentUser;
        filterString = _get(filterBaseObj, _get(filterBy, 'filterBaseFieldOrValue'));
      } else if (filterBase == 'record') {
        filterString = _get(filterBy, 'filterBaseFieldOrValue');
      }
      filterFileds = _get(filterBy, 'filterField');
      filterMode = _get(filterBy, 'filterMode');
    }

    let sortBy = _get(this.formatRules, 'sortBy');
    let sortByString = '';
    if (!_isUndefined(sortBy) && !_isEmpty(sortBy)) {
      sortByString = sortBy;
    }

    //TODO getRecords defaults to 10 perhaps add another param to set?
    let stagedRecords = await this.recordService.getRecords(recordType, stepName, startIndex, packageType, sortByString, filterFileds, filterString, filterMode);

    let planTable: PlanTable;

    if (this.dashboardTypeSelected == 'consolidated') {
      let items: any = _get(stagedRecords, 'items');
      let totalItems = _get(stagedRecords, 'totalItems');
      let noItemsPerPage = _get(stagedRecords, 'noItems');
      let allItemsByGroup = [];

      let groupBy = _get(this.formatRules, 'groupBy');
      let sortGroupBy = _get(this.formatRules, 'sortGroupBy');

      if (groupBy == 'groupedByRelationships' && !_isUndefined(sortGroupBy) && !_isEmpty(sortGroupBy)) {
        for (let item of items) {
          let oid = _get(item, 'oid');
          let itemsAfterApplyInnerGroupFormatRules = [];

          let itemsGroupRelated: any = await this.recordService.getRelatedRecords(oid);
          let sortItems = _get(itemsGroupRelated, 'items');
          let totalSortItems = sortItems.length;
          let countHerarchyLevels = sortGroupBy.length;

          for (let j = 0; j < totalSortItems; j++) {
            let parentTreeNodeOid = oid;
            for (let i = 0; i < countHerarchyLevels; i++) {
              let rule = _find(sortGroupBy, function (o) {
                if (_get(o, 'rowLevel') == i) {
                  return o;
                }
              });
              let compareField = _get(rule, 'compareField');
              let compareFieldValue = _get(rule, 'compareFieldValue');
              let relatedTo = _get(rule, 'relatedTo');

              for (let sortItem of sortItems) {
                let relatedToOid = _get(sortItem, relatedTo);
                let foundParent = relatedToOid == parentTreeNodeOid;
                let foundRecord = _get(sortItem, compareField) == compareFieldValue;
                let foundTopLevelParent = relatedTo == '';
                if (foundRecord && (foundParent || foundTopLevelParent)) {
                  let currentOid = _get(sortItem, 'oid');
                  let rowExists = _find(itemsAfterApplyInnerGroupFormatRules, ['oid', currentOid]);
                  if (_isUndefined(rowExists)) {
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

          if (!_isEmpty(itemsAfterApplyInnerGroupFormatRules)) {
            _set(itemsGroupRelated, 'items', itemsAfterApplyInnerGroupFormatRules);
          }

          allItemsByGroup.push(itemsGroupRelated);
        }
      } else if (groupBy == 'groupedByRecordType' && !_isUndefined(sortGroupBy) && !_isEmpty(sortGroupBy)) {

        let countHerarchyLevels = sortGroupBy.length;
        for (let i = 0; i < countHerarchyLevels; i++) {

          let rule = _find(sortGroupBy, function (o) {
            if (_get(o, 'rowLevel') == i) {
              return o;
            }
          });
          let compareFieldValue = _get(rule, 'compareFieldValue');
          let itemsGroupRelated: any = await this.recordService.getRecords(compareFieldValue, stepName, startIndex, packageType, sortByString, filterFileds, filterString, filterMode);

          allItemsByGroup.push(itemsGroupRelated);
        }
      }

      let pageNumber = _get(stagedRecords, 'currentPage');

      let groupedRecords: any = {};
      _set(groupedRecords, 'totalItems', totalItems);
      _set(groupedRecords, 'currentPage', pageNumber);
      _set(groupedRecords, 'noItems', noItemsPerPage);
      _set(groupedRecords, 'itemsByGroup', true);
      _set(groupedRecords, 'groupedItems', allItemsByGroup);

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
      totalItems: _get(stagedOrGroupedRecords, 'totalItems'),
      currentPage: _get(stagedOrGroupedRecords, 'currentPage'),
      noItems: _get(stagedOrGroupedRecords, 'noItems')
    };

    let columnMappings = this.dashboardColumnMappings;

    let isGrouped = _get(stagedOrGroupedRecords, 'itemsByGroup');
    let allGroupedItems = _get(stagedOrGroupedRecords, 'groupedItems');
    if (isGrouped && !_isUndefined(allGroupedItems) && !_isEmpty(allGroupedItems)) {

      const imports: any = {};
      for (let groupedRecords of allGroupedItems) {

        let groupedItems = _get(groupedRecords, 'items');

        for (let stagedRecord of groupedItems) {

          _forEach(columnMappings, (value, key) => {
            _set(imports, key, _get(stagedRecord, value));
          });

          _set(imports, 'branding', this.branding);
          _set(imports, 'rootContext', this.rootContext);
          _set(imports, 'baseUrl', this.baseUrl);
          _set(imports, 'portal', this.portal);
          _set(imports, 'translationService', this.translationService);
          _set(imports, 'rulesService', this.rulesService);
          _set(imports, 'rulesConfig', rowLevelRulesConfig);
          if (!_isUndefined(groupRowRules) && !_isEmpty(groupRowRules)) {
            _set(imports, 'groupRulesConfig', groupRowRules);
            _set(imports, 'groupedItems', groupedItems);
          }

          let record: any = {};


          let stepTableConfig = _isEmpty(this.tableConfig[stepName]) ? this.defaultTableConfig : this.tableConfig[stepName];

          for (let rowConfig of stepTableConfig) {


            const templateRes = this.runTemplate(rowConfig.template, imports)
            record[rowConfig.variable] = templateRes;
          }
          recordRows.push(record);
        }

        //Don't evaluate group rules if no records were retrieved meaning recordsRows array has length 0
        if (!_isUndefined(groupRowConfig) && !_isEmpty(groupRowConfig) && recordRows.length > 0 && !_isEmpty(imports)) {

          let groupRecord: any = {};
          for (let groupRow of groupRowConfig) {

            const groupTemplateRes = this.runTemplate(groupRow.template, imports);
            groupRecord[groupRow.variable] = groupTemplateRes;
          }
          recordRows.push(groupRecord);
        }
      }

    } else {

      let stagedOrGroupedRecordItems = _get(stagedOrGroupedRecords, 'items');
      if (!_isUndefined(stagedOrGroupedRecordItems) && !_isEmpty(stagedOrGroupedRecordItems)) {

        for (let stagedRecord of stagedOrGroupedRecordItems) {

          const imports: any = {};

          _forEach(columnMappings, (value, key) => {
            _set(imports, key, _get(stagedRecord, value));
          });

          _set(imports, 'branding', this.branding);
          _set(imports, 'rootContext', this.rootContext);
          _set(imports, 'portal', this.portal);
          _set(imports, 'translationService', this.translationService);



          let record: any = {};
          let stepTableCOnfig = _isEmpty(this.tableConfig[stepName]) ? this.defaultTableConfig : this.tableConfig[stepName];

          for (let rowConfig of stepTableCOnfig) {

            const templateRes = this.runTemplate(rowConfig.template, imports);
            record[rowConfig.variable] = templateRes;
          }
          recordRows.push(record);
        }
      }
    }

    planTable.items = recordRows;

    return planTable;
  }




  public evaluateRowLevelRules(rulesConfig: any, metadata: any, metaMetadata: any, workflow: any, oid: string, ruleSetName: string) {

    let res: any;
    const imports: any = {};
    _set(imports, 'metadata', metadata);
    _set(imports, 'metaMetadata', metaMetadata);
    _set(imports, 'workflow', workflow);
    _set(imports, 'oid', oid);
    _set(imports, 'branding', this.branding);
    _set(imports, 'rootContext', this.rootContext);
    _set(imports, 'portal', this.portal);
    _set(imports, 'translationService', this.translationService);


    let ruleSetConfig = _find(rulesConfig, ['ruleSetName', ruleSetName]);

    if (!_isUndefined(ruleSetConfig)) {

      if (_get(ruleSetConfig, 'applyRuleSet') == true) {

        let rules = _get(ruleSetConfig, 'rules');
        let resArray = [];

        for (let rule of rules) {
          let name = _get(rule, 'name');
          console.log('evaluating rule ' + name);
          let renderItemTemplate = _get(rule, 'renderItemTemplate');
          let evaluateRulesTemplate = _get(rule, 'evaluateRulesTemplate');
          _set(imports, 'name', name);


          let evaluatedAction = '';
          let action = _get(rule, 'action');

          const result = this.runTemplate(evaluateRulesTemplate, imports)
          if (result == 'true') {
            evaluatedAction = action;
          }

          if (evaluatedAction == 'show') {
            const templateRes = this.runTemplate(renderItemTemplate, imports);
            resArray.push(templateRes);
          }
        }

        if (_get(ruleSetConfig, 'type') == 'multi-item-rendering') {
          let separator = _get(ruleSetConfig, 'separator');
          res = _join(resArray, separator);
        } else {
          res = _first(resArray);
        }
      }
    }

    return res;
  }

  public evaluateGroupRowRules(groupRulesConfig: any, groupedItems: any, ruleSetName: string) {

    let res: any;

    let ruleSetConfig = _find(groupRulesConfig, ['ruleSetName', ruleSetName]);

    if (!_isUndefined(ruleSetConfig)) {

      if (_get(ruleSetConfig, 'applyRuleSet') == true) {

        let rules = _get(ruleSetConfig, 'rules');
        let resArray = [];

        for (let rule of rules) {

          let name = _get(rule, 'name');
          console.log('evaluating rule ' + name);
          let renderItemTemplate = _get(rule, 'renderItemTemplate');
          let evaluateRulesTemplate = _get(rule, 'evaluateRulesTemplate');
          let evaluatedAction = '';
          let results = [];
          let action = _get(rule, 'action');
          let mode = _get(rule, 'mode');

          const imports: any = {};
          for (let item of groupedItems) {

            _set(imports, 'metadata', _get(item, 'metadata.metadata'));
            _set(imports, 'metaMetadata', _get(item, 'metadata.metaMetadata'));
            _set(imports, 'workflow', _get(item, 'metadata.workflow'));
            _set(imports, 'branding', this.branding);
            _set(imports, 'rootContext', this.rootContext);
            _set(imports, 'portal', this.portal);
            _set(imports, 'translationService', this.translationService);

            let oid = _get(item, 'oid');
            _set(imports, 'oid', oid);
            _set(imports, 'name', name);



            const result = this.runTemplate(evaluateRulesTemplate, imports)
            if (result == 'true') {
              results.push(result);
            } else if (mode == 'all') {
              results.push(result);
            }
          }

          if (!_isEmpty(results) && (_indexOf(results, 'false') < 0) && (_indexOf(results, 'true') >= 0)) {
            evaluatedAction = action;
          }


          if (evaluatedAction == 'show') {
            const templateRes = this.runTemplate(renderItemTemplate, imports);
            resArray.push(templateRes);
          }
        }

        if (_get(ruleSetConfig, 'type') == 'multi-item-rendering') {
          let separator = _get(ruleSetConfig, 'separator');
          res = _join(resArray, separator);
        } else {
          res = _first(resArray);
        }
      }
    }

    return res;
  }

  public async sortChanged(data: any) {

    if (this.dashboardTypeSelected == 'standard' || this.dashboardTypeSelected == 'workspace') {
      let sortString = `${data.variable}:`;
      if (data.sort == 'desc') {
        sortString = sortString + "-1";
      } else {
        sortString = sortString + "1";
      }
      let stagedRecords: any;
      if (this.dashboardTypeSelected == 'workspace') {
        stagedRecords = await this.recordService.getRecords('', '', 1, this.dashboardTypeSelected, sortString);
      } else {
        stagedRecords = await this.recordService.getRecords(this.recordType, data.step, 1, '', sortString);
      }

      let planTable: PlanTable = this.evaluatePlanTableColumns({}, {}, {}, data.step, stagedRecords);

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
      let planTable: PlanTable = this.evaluatePlanTableColumns({}, {}, {}, step, stagedRecords);
      this.records[step] = planTable;
    } else if (this.dashboardTypeSelected == 'workspace') {
      let stagedRecords = await this.recordService.getRecords('', '', event.page, this.packageType, this.getSortString(sortDetails));
      let planTable: PlanTable = this.evaluatePlanTableColumns({}, {}, {}, this.packageType, stagedRecords);
      this.records[this.packageType] = planTable;
    } else if (this.dashboardTypeSelected == 'consolidated') {
      let packageType = '';
      let stepName = '';
      let evaluateStepName = _get(this.workflowSteps[0], 'name');
      let recordType = _get(this.workflowSteps[0], 'config.baseRecordType');
      await this.initStep(stepName, evaluateStepName, recordType, packageType, event.page);
    }
  }

  private runTemplate(templateString: string, imports: object): any {
    let config: any = {
      template: templateString
    }
    let data = {}
    return this.lodashTemplateUtilityService.runTemplate(data, config, imports)
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


