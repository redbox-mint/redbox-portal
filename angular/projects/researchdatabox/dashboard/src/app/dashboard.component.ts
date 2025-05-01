import { Component, Inject, ElementRef } from '@angular/core';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';
import { BaseComponent, UtilityService, LoggerService, TranslationService, RecordService, PlanTable, UserService, ConfigService, FormatRules, SortGroupBy, QueryFilter, FilterField, LoDashTemplateUtilityService } from '@researchdatabox/portal-ng-common';
import { get as _get, set as _set, isEmpty as _isEmpty, isUndefined as _isUndefined, trim as _trim, isNull as _isNull, orderBy as _orderBy, map as _map, find as _find, indexOf as _indexOf, isArray as _isArray, forEach as _forEach, join as _join, first as _first, has as _has } from 'lodash-es';

@Component({
    selector: 'dashboard',
    templateUrl: './dashboard.component.html',
    standalone: false
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
  filterFieldName: string = 'Title';
  filterFieldPath: string = 'metadata.title';
  defaultFilterField: FilterField = { name: this.filterFieldName, path: this.filterFieldPath };
  filterSearchString: any = {};
  hideWorkflowStepTitle: boolean = false;
  isFilterSearchDisplayed: any = {};
  isSearching: any = {};
  isProcessingPageChange: boolean = false;
  defaultSortObject: any = {};

  defaultRowConfig = [
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
      initialSort: 'desc',
      defaultSort: true
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

  defaultFormatRules: FormatRules = {
    filterBy: {}, //filterBase can only have two values user or record
    filterWorkflowStepsBy: [], //values: empty array (all) or a list with particular types i.e. [ 'draft', 'finalised' ]  
    recordTypeFilterBy: '',
    queryFilters: {
      rdmp: [
              { 
                filterType: 'text',
                filterFields: [
                                { 
                                  name: 'Title',
                                  path: 'metadata.title'
                                }
                              ]
              }
            ]
      },
    sortBy: 'metaMetadata.lastSaveDate:-1',
    groupBy: '', //values: empty (not grouped any order), groupedByRecordType, groupedByRelationships 
    sortGroupBy: [], //values: as many levels as required?
    hideWorkflowStepTitleForRecordType: []
  };
  formatRules: FormatRules = this.defaultFormatRules;

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

    this.formatRules = this.defaultFormatRules;
    this.rowLevelRules = this.defaultRowLevelRules;
    this.groupRowConfig = this.defaultGroupRowConfig;
    this.groupRowRules = this.defaultGroupRowRules;

    let dashboardTypeConfig: any = await this.recordService.getDashboardType(this.dashboardTypeSelected);
    let formatRules: FormatRules = _get(dashboardTypeConfig, 'formatRules');
    if (!_isUndefined(formatRules) && !_isNull(formatRules) && !_isEmpty(formatRules)) {
      //global format rules from dashboardtype.js config
      this.formatRules = formatRules;
    }

    let recordTypeFilterBy = _get(this.formatRules, 'recordTypeFilterBy');
    if (!_isUndefined(recordTypeFilterBy) && !_isNull(formatRules) && !_isEmpty(formatRules)) {
      recordType = recordTypeFilterBy;
    }

    for(let recType of formatRules.hideWorkflowStepTitleForRecordType) {
      if(recType == recordType) {
        this.hideWorkflowStepTitle = true;
      }
    }

    let steps = await this.initWorkflowSteps(recordType);

    let startIndex = 1;
    for (let step of steps) {

      this.initStepTableConfig(recordType, step);

      this.initSortMap(step);

      this.workflowSteps.push(step);

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
    }
  }

  private async initWorkflowSteps(recordType: string) {

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
    return steps;
  }

  private initStepTableConfig(recordType: string, step: any) {

    let stepRowConfig = this.defaultRowConfig;

    if (_isEmpty(this.defaultRowConfig[0].title)) {
      this.defaultRowConfig[0].title = `${recordType}-title` || 'Title';
    }

    if (!_isUndefined(_get(step, 'config.dashboard'))
      && !_isUndefined(_get(step, 'config.dashboard.table'))) {

      if (!_isUndefined(_get(step, 'config.dashboard.table.rowConfig'))) {
        stepRowConfig = _get(step, 'config.dashboard.table.rowConfig');
        this.sortFields = _map(_get(step, 'config.dashboard.table.rowConfig'), (config) => { return config.variable; });
      }

      if (!_isUndefined(_get(step, 'config.dashboard.table.rowRulesConfig'))) {
        this.rowLevelRules = _get(step, 'config.dashboard.table.rowRulesConfig');
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

    this.tableConfig[step.name] = stepRowConfig;
  }

  public async initStep(stepName: string, evaluateStepName: string, recordType: string, packageType: string, startIndex: number) {

    let filterBy = _get(this.formatRules, 'filterBy');
    let filterString;
    let filterFields;
    let filterMode;
    if (!_isUndefined(filterBy) && !_isEmpty(filterBy)) {
      let filterBase = _get(filterBy, 'filterBase');
      if (filterBase == 'user') {
        let filterBaseObj = this.currentUser;
        filterString = _get(filterBaseObj, _get(filterBy, 'filterBaseFieldOrValue'));
      } else if (filterBase == 'record') {
        filterString = _get(filterBy, 'filterBaseFieldOrValue');
      }
      filterFields = _get(filterBy, 'filterField');
      filterMode = _get(filterBy, 'filterMode');
    }

    let sortByString = this.getSortStringFromSortMap(this.sortMap[stepName], true);

    let stagedRecords = await this.recordService.getRecords(recordType, stepName, startIndex, packageType, sortByString, filterFields, filterString, filterMode);

    let planTable: PlanTable;

    if (this.dashboardTypeSelected == 'consolidated') {
      let items: any = _get(stagedRecords, 'items');
      let totalItems = _get(stagedRecords, 'totalItems');
      let noItemsPerPage = _get(stagedRecords, 'noItems');
      let allItemsByGroup = [];

      let groupBy = _get(this.formatRules, 'groupBy');
      let sortGroupBy = _get(this.formatRules, 'sortGroupBy');

      if (groupBy == 'groupedByRelationships' && !_isUndefined(sortGroupBy) && !_isEmpty(sortGroupBy)) {

        allItemsByGroup = await this.getAllItemsGroupedByRelationships(items, sortGroupBy);

      } else if (groupBy == 'groupedByRecordType' && !_isUndefined(sortGroupBy) && !_isEmpty(sortGroupBy)) {

        allItemsByGroup = await this.getAllItemsGroupedByRecordType(sortGroupBy, stepName, startIndex, packageType, sortByString, filterFields, filterString, filterMode);
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

      if (this.dashboardTypeSelected == 'standard' || this.dashboardTypeSelected == 'workspace') {
        let filter: FilterField = this.getFirstTextFilter();
        this.filterFieldName = filter.name;
        this.filterFieldPath = filter.path;
      }
    }

    this.records[evaluateStepName] = planTable;

    this.sortChanged(this.defaultSortObject);
  }

  private async getAllItemsGroupedByRecordType(sortGroupBy: SortGroupBy[], stepName: string, startIndex: number, packageType: string, sortByString: string, filterFields: any, filterString: any, filterMode: any) {
    let allItemsByGroup: any[] = [];
    let countHerarchyLevels = sortGroupBy.length;
    for (let i = 0; i < countHerarchyLevels; i++) {

      let rule = _find(sortGroupBy, function (o) {
        if (_get(o, 'rowLevel') == i) {
          return true;
        }
        return false;
      });
      let compareFieldValue = _get(rule, 'compareFieldValue', '');
      let itemsGroupRelated: any = await this.recordService.getRecords(compareFieldValue, stepName, startIndex, packageType, sortByString, filterFields, filterString, filterMode);

      allItemsByGroup.push(itemsGroupRelated);
    }

    return allItemsByGroup;
  }

  private async getAllItemsGroupedByRelationships(items: any, sortGroupBy: SortGroupBy[]) {
    let allItemsByGroup: any[] = [];
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
              return true;
            }
            return false;
          });
          let compareField = _get(rule, 'compareField', '');
          let compareFieldValue = _get(rule, 'compareFieldValue', '');
          let relatedTo = _get(rule, 'relatedTo', '');

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
    return allItemsByGroup;
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

          let stepRowConfig: any[] = this.tableConfig[stepName];

          for (let columnConfig of stepRowConfig) {
            const templateRes = this.runTemplate(columnConfig.template, imports)
            record[columnConfig.variable] = templateRes;
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
          let stepRowConfig = this.tableConfig[stepName];

          for (let columnConfig of stepRowConfig) {
            const templateRes = this.runTemplate(columnConfig.template, imports);
            record[columnConfig.variable] = templateRes;
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

            const result = this.runTemplate(evaluateRulesTemplate, imports);
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

  private initSortMap(step: any) {

    let stepRowConfig: any[] = this.tableConfig[step.name];

    this.sortMap[step.name] = {};

    let stepRowConfigLength = stepRowConfig.length - 1;

    let i = 0;

    for (let columnConfig of stepRowConfig) {

      i = i + 1;

      if(columnConfig.initialSort == 'asc' || columnConfig.initialSort == 'desc') {

        this.sortMap[step.name][columnConfig.variable] = {
          sort: columnConfig.initialSort,
          secondarySort: columnConfig.secondarySort != undefined ? columnConfig.secondarySort : '',
          defaultSort:  columnConfig.defaultSort == true ? true : false
        }
      }

      if(columnConfig.defaultSort == true) {
        this.defaultSortObject = {
          sort: columnConfig.initialSort,
          secondarySort: columnConfig.secondarySort != undefined ? columnConfig.secondarySort : '',
          step: step.name,
          title: '',
          variable: columnConfig.variable
        }
      } else if(i == stepRowConfigLength && _isEmpty(this.defaultSortObject)) {
        this.defaultSortObject = {
          sort: columnConfig.initialSort,
          secondarySort: columnConfig.secondarySort != undefined ? columnConfig.secondarySort : '',
          step: step.name,
          title: '',
          variable: columnConfig.variable
        }
      }
    }

    if (this.dashboardTypeSelected == 'consolidated') {
      this.enableSort = false;
    } else {
      this.enableSort = true;
    }
  }

  public async sortChanged(data: any) {

    if (this.dashboardTypeSelected == 'standard' || this.dashboardTypeSelected == 'workspace') {
      
      let sortString = `${data.variable}:`;
      let secondarySortString = undefined;
      if (data.sort == 'desc') {
        sortString = sortString + "-1";
        if(data.secondarySort != undefined && data.secondarySort != '') {
          secondarySortString = `${data.secondarySort}:`+ "-1";
        }
      } else {
        sortString = sortString + "1";
        if(data.secondarySort != undefined && data.secondarySort != '') {
          secondarySortString = `${data.secondarySort}:`+ "1";
        }
      }
      let stagedRecords: any;
      if (this.dashboardTypeSelected == 'workspace') {
        stagedRecords = await this.recordService.getRecords('', '', 1, this.dashboardTypeSelected, sortString,this.filterFieldPath,this.getFilterSearchString(data.step),'',secondarySortString);
      } else {
        stagedRecords = await this.recordService.getRecords(this.recordType, data.step, 1, '', sortString,this.filterFieldPath,this.getFilterSearchString(data.step),'',secondarySortString);
      }

      let planTable: PlanTable = this.evaluatePlanTableColumns({}, {}, {}, data.step, stagedRecords);

      this.records[data.step] = planTable;

      this.updateSortMap(data);
    }
  }

  private updateSortMap(sortData: any) {

    let stepRowConfig: any[] = this.tableConfig[sortData.step];
    for (let columnConfig of stepRowConfig) {
      this.sortMap[sortData.step][columnConfig.variable] = { 
        sort: columnConfig.noSort ,
        secondarySort: columnConfig.secondarySort != '' ? columnConfig.secondarySort : ''
      };
    }

    this.sortMap[sortData.step][sortData.variable] = { 
      sort: sortData.sort,
      secondarySort: sortData.secondarySort
     };
  }

  public async pageChanged(event: PageChangedEvent, step: string) {
    
    if (this.isProcessingPageChange) {
      return;
    }

    this.isProcessingPageChange = true;

    let sortMapAtStep = this.sortMap[step];

    if (this.dashboardTypeSelected == 'standard') {
      let stagedRecords = await this.recordService.getRecords(this.recordType, step, event.page, '', this.getSortStringFromSortMap(sortMapAtStep),this.filterFieldPath,this.getFilterSearchString(step),'',this.getSecondarySortStringFromSortMap(sortMapAtStep));
      let planTable: PlanTable = this.evaluatePlanTableColumns({}, {}, {}, step, stagedRecords);
      this.records[step] = planTable;
      this.isProcessingPageChange = false;
    } else if (this.dashboardTypeSelected == 'workspace') {
      let stagedRecords = await this.recordService.getRecords('', '', event.page, this.packageType, this.getSortStringFromSortMap(sortMapAtStep),this.filterFieldPath,this.getFilterSearchString(step),'',this.getSecondarySortStringFromSortMap(sortMapAtStep));
      let planTable: PlanTable = this.evaluatePlanTableColumns({}, {}, {}, step, stagedRecords);
      this.records[step] = planTable;
      this.isProcessingPageChange = false;
    } else if (this.dashboardTypeSelected == 'consolidated') {
      let packageType = '';
      let stepName = '';
      let evaluateStepName = _get(this.workflowSteps[0], 'name');
      let recordType = _get(this.workflowSteps[0], 'config.baseRecordType');
      await this.initStep(stepName, evaluateStepName, recordType, packageType, event.page);
      this.isProcessingPageChange = false;
    }
  }

  private runTemplate(templateString: string, imports: object): any {
    let config: any = {
      template: templateString
    }
    let data = {}
    return this.lodashTemplateUtilityService.runTemplate(data, config, imports)
  }

  public getSortStateFromSortMap(sortMap: any, workflowStep: any, rowConfig: any) {
    let step = _get(workflowStep,'config.workflow.stage','');
    let sort = 'desc';
    if(step != '') {
      let sortMapAtStep = sortMap[step];
      if(_has(sortMapAtStep,rowConfig.variable)) {
        sort = sortMapAtStep[rowConfig.variable].sort;
        return sort;
      }
    }
    return sort;
  }

  public getSecondarySortStateFromSortMap(sortMap: any, workflowStep: any, rowConfig: any) {
    let step = _get(workflowStep,'config.workflow.stage','');
    let secondarySort = 'desc';
    if(step != '') {
      let sortMapAtStep = sortMap[step];
      if(_has(sortMapAtStep,rowConfig.variable)) {
        secondarySort = sortMapAtStep[rowConfig.variable].secondarySort;
        return secondarySort;
      }
    }
    return secondarySort;
  }


  private getSortStringFromSortMap(sortMapAtStep: any, forceDefault: boolean = false) {

    let fields = this.sortFields;
    let sortString = 'metaMetadata.lastSaveDate:-1';
    for (let i = 0; i < fields.length; i++) {
      let sortField = fields[i];
      if(!_isEmpty(sortMapAtStep) && !_isEmpty(sortField) && _has(sortMapAtStep,sortField)) {
        if (sortMapAtStep[sortField].sort != null && forceDefault && sortMapAtStep[sortField].defaultSort == true) {
          sortString = `${sortField}:`;
          if (sortMapAtStep[sortField].sort == 'desc') {
            sortString = sortString + "-1";
          } else {
            sortString = sortString + "1";
          }
          return sortString;
        } else {
          if (sortMapAtStep[sortField].sort != null) {
            sortString = `${sortField}:`;
            if (sortMapAtStep[sortField].sort == 'desc') {
              sortString = sortString + "-1";
            } else {
              sortString = sortString + "1";
            }
          }
        } 
      }
    }
    return sortString;
  }


  private getSecondarySortStringFromSortMap(sortMapAtStep: any) {

    let fields = this.sortFields;

    for (let i = 0; i < fields.length; i++) {
      let sortField = fields[i];

      if (sortMapAtStep[sortField].sort != null) {

        let secondarySort = sortMapAtStep[sortField].secondarySort;

        if (sortMapAtStep[sortField].sort == 'desc') {
          if(secondarySort != '' ) {
            let sortString = `${secondarySort}:`;
            sortString = sortString + "-1";
            return sortString;
          }
        } else {
          if(secondarySort != '') {
            let sortString = `${secondarySort}:`;
            sortString = sortString + "1";
            return sortString;
          }
        }
      }
    }
    return '';
  }

  private getFirstFilter(type:string): FilterField {
    try {
      let queryFilters: QueryFilter[] = this.formatRules.queryFilters[this.recordType];
      for(let queryFilter of queryFilters) {
        if(queryFilter.filterType == type) {
          for(let filterField of queryFilter.filterFields) {
            return filterField;
          }
        }
      }
      return this.defaultFilterField;
    } catch(error) {
      return this.defaultFilterField;
    }
  }

  private findFilterTemplate(filterFieldPath: string): string {
    let templateString: string = '';
    let queryFilters: QueryFilter[] = this.formatRules.queryFilters[this.recordType];
    if(_isArray(queryFilters)) {
      for(let queryFilter of queryFilters) {
          for(let filterField of queryFilter.filterFields) {
            if(filterField.path == filterFieldPath) {
              return _get(filterField,'template','');
            }
          }
      }
    }
    return templateString;
  }

  private getFilters(type:string) {
    let filterFields: FilterField[] = [];
    let queryFilters: QueryFilter[] = this.formatRules.queryFilters[this.recordType];
    if(_isArray(queryFilters)) {
      for(let queryFilter of queryFilters) {
        if(queryFilter.filterType == type) {
          for(let filterField of queryFilter.filterFields) {
            filterFields.push(filterField);
          }
        }
      }
    }
    return filterFields;
  }

  private getFirstTextFilter(): FilterField {
    return this.getFirstFilter('text');
  }

  public getTextFilters() {
    return this.getFilters('text');
  }

  public getFilterSearchDisplayed(step: any): boolean {
    let filterDisplayed = _get(this.isFilterSearchDisplayed,step,'');
    if(filterDisplayed == 'filterDisplayed') {
      return true;
    } else {
      return false;
    }
  }

  public getIsSearching(step: any): boolean {
    let searching = _get(this.isSearching,step,'');
    if(searching == 'searching') {
      return true;
    } else {
      return false;
    }
  }

  public getFilterSearchString(step: any): string {
    let filterString = _get(this.filterSearchString,step,'');
    let templateOrPath = this.findFilterTemplate(this.filterFieldPath);
    if (templateOrPath && templateOrPath.indexOf('<%') != -1) {
      const imports: any = { value: filterString};
      return this.runTemplate(templateOrPath,imports);
    }
    return filterString;
  }

  public async filterChanged(step: string) {

    if (this.dashboardTypeSelected == 'standard' || this.dashboardTypeSelected == 'workspace') {
      this.isSearching[step] = 'searching';
      this.isFilterSearchDisplayed[step] = 'filterDisplayed';
      let sortMapAtStep = this.sortMap[step];
      this.records[step].currentPage = 1;
      let stagedRecords: any;
      if(this.dashboardTypeSelected == 'workspace') {
        stagedRecords = await this.recordService.getRecords('', '', 1, this.packageType, this.getSortStringFromSortMap(sortMapAtStep),this.filterFieldPath,this.getFilterSearchString(step),'',this.getSecondarySortStringFromSortMap(sortMapAtStep));
      } else {
        stagedRecords = await this.recordService.getRecords(this.recordType, step, 1, '', this.getSortStringFromSortMap(sortMapAtStep),this.filterFieldPath,this.getFilterSearchString(step),'',this.getSecondarySortStringFromSortMap(sortMapAtStep));
      }
      let planTable: PlanTable = this.evaluatePlanTableColumns({}, {}, {}, step, stagedRecords);
      this.records[step] = planTable;
      this.isSearching[step] = '';
    }
  }

  public async resetFilterAndSearch(step: string, e: any) {
    
    if (this.dashboardTypeSelected == 'standard' || this.dashboardTypeSelected == 'workspace') {
      this.setFilterField(this.getFirstTextFilter(), e);
      this.isSearching[step] = 'searching';
      let sortMapAtStep = this.sortMap[step];
      this.filterSearchString[step] = '';
      this.records[step].currentPage = 1;
      let stagedRecords: any;
      if(this.dashboardTypeSelected == 'workspace') {
        stagedRecords = await this.recordService.getRecords('', '', 1, this.packageType, this.getSortStringFromSortMap(sortMapAtStep),this.filterFieldPath,this.getFilterSearchString(step),'',this.getSecondarySortStringFromSortMap(sortMapAtStep));
      } else {
        stagedRecords = await this.recordService.getRecords(this.recordType, step, 1, '', this.getSortStringFromSortMap(sortMapAtStep),this.filterFieldPath,this.getFilterSearchString(step),'',this.getSecondarySortStringFromSortMap(sortMapAtStep));
      }
      let planTable: PlanTable = this.evaluatePlanTableColumns({}, {}, {}, step, stagedRecords);
      this.records[step] = planTable;
      this.isSearching[step] = '';
    }
  }

  public setFilterField(filterField:FilterField, e: any) {
    if (e) {
      e.preventDefault();
    }
    this.filterFieldName = filterField.name;
    this.filterFieldPath = filterField.path;
  }

}


