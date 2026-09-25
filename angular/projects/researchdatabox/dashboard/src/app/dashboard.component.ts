import { Component, Inject, ElementRef } from '@angular/core';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';
import {
  BaseComponent,
  UtilityService,
  LoggerService,
  TranslationService,
  RecordService,
  PlanTable,
  UserService,
  ConfigService,
  SortGroupBy,
  QueryFilter,
  FilterField,
  HandlebarsTemplateService,
  DashboardTemplateTarget,
  DashboardViewDefinitionResponse,
  DashboardViewStepDefinitionResponse,
  DashboardSettings,
  DashboardSettingsRowConfig,
  DashboardSettingsRuleSet,
  DashboardModeContext,
  DashboardRuntimeSettings
} from '@researchdatabox/portal-ng-common';
import { handlebarsInstance } from '@researchdatabox/sails-ng-common';
import { get as _get, set as _set, isEmpty as _isEmpty, isUndefined as _isUndefined, trim as _trim, isNull as _isNull, orderBy as _orderBy, find as _find, indexOf as _indexOf, isArray as _isArray, forEach as _forEach, join as _join, has as _has } from 'lodash-es';

/**
 * Settings and interaction state owned by one dashboard stage/step. Nothing in
 * here is shared between stages, so the order in which stages are initialised
 * or rendered cannot leak configuration from one to another.
 */
interface StepState {
  target: DashboardTemplateTarget;
  settings: DashboardSettings;
  fingerprint: string;
  templatePrefix: string[];
  filterField: FilterField;
}

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
  dashboardView: string = '';
  dashboardViewConfig: DashboardViewDefinitionResponse | null = null;
  typeLabel: string = '';
  recordType: string;
  packageType: string;
  records: any = {};
  sortMap: any = {};
  tableConfig: { [step: string]: DashboardSettingsRowConfig[] } = {};
  stepState: { [step: string]: StepState } = {};
  dashboardTypeOptions: any = ['standard', 'workspace', 'consolidated'];
  defaultDashboardTypeSelected: string = this.dashboardTypeOptions[0];
  dashboardTypeSelected: string;
  rulesService: object;
  currentUser: object = {};
  enableSort: boolean = true;
  defaultFilterField: FilterField = { name: 'Title', path: 'metadata.title' };
  filterSearchString: any = {};
  private submittedSearch: Record<string, string> = {};
  isFilterSearchDisplayed: any = {};
  isSearching: any = {};
  isProcessingPageChange: boolean = false;
  settingsUnavailable: boolean = false;

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

  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(UtilityService) private utilService: UtilityService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(RecordService) private recordService: RecordService,
    @Inject(UserService) private userService: UserService,
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(HandlebarsTemplateService) private handlebarsTemplateService: HandlebarsTemplateService,
    elementRef: ElementRef
  ) {
    super();
    this.recordType = _trim(elementRef.nativeElement.getAttribute('recordType'));
    this.packageType = _trim(elementRef.nativeElement.getAttribute('packageType'));
    this.dashboardView = _trim(elementRef.nativeElement.getAttribute('dashboardView'));
    let dashboardType = _trim(elementRef.nativeElement.getAttribute('dashboardType'));
    if (_isUndefined(dashboardType) || _isNull(dashboardType) || _isEmpty(dashboardType)) {
      this.dashboardTypeSelected = this.defaultDashboardTypeSelected;
    } else {
      this.dashboardTypeSelected = dashboardType;
    }
    if (_isEmpty(this.dashboardView) && !_isEmpty(this.packageType) && this.packageType == 'workspace') {
      this.dashboardTypeSelected = this.packageType;
    }

    this.initDependencies = [this.translationService, this.recordService, this.userService, this.handlebarsTemplateService];
    this.rulesService = this;
  }

  protected override async initComponent(): Promise<void> {
    if (_indexOf(this.dashboardTypeOptions, this.dashboardTypeSelected) >= 0) {
      this.config = this.recordService.getConfig();
      this.baseUrl = _get(this.config, 'baseUrl');
      this.rootContext = this.configService.rootContext;
      this.branding = _get(this.config, 'branding');
      this.portal = _get(this.config, 'portal');
      this.currentUser = await this.userService.getInfo();
      if (!_isEmpty(this.dashboardView)) {
        await this.initDashboardView(this.dashboardView);
      } else {
        this.typeLabel = `${this.translationService.t(`${this.recordType}-name-plural`)}` || 'Records';
        await this.initView(this.recordType);
      }
    } else {
      this.loggerService.debug(`Unsupported Dashboard Type: ${this.dashboardTypeSelected}`);
    }
  }

  public getStepKey(step: any): string {
    return _get(step, 'stepKey', _get(step, 'config.workflow.stage', _get(step, 'name', '')));
  }

  public getStepStageLabel(step: any): string {
    return _get(step, 'config.workflow.stageLabel', _get(step, 'name', ''));
  }

  private get isViewPage(): boolean {
    return !_isEmpty(this.dashboardView);
  }

  private normalizeDashboardViewStep(step: DashboardViewStepDefinitionResponse) {
    return {
      name: step.name,
      stepKey: step.name,
      config: {
        workflow: {
          stage: step.name,
          stageLabel: step.name
        },
        baseRecordType: step.baseRecordType
      },
      dashboardViewStep: step
    };
  }

  /**
   * Build per-step state from one settings snapshot and load the templates
   * compiled for exactly those settings. If the server reports that settings
   * changed in between, reload settings and templates together once rather
   * than rendering a mix of versions.
   */
  private async loadStepStates(kind: 'workflow' | 'view', owner: string, stepKeys: string[]): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      let snapshot: DashboardRuntimeSettings;
      try {
        snapshot = await this.recordService.getDashboardSettings(kind, owner);
      } catch (error) {
        this.loggerService.error(`Dashboard settings are unavailable for ${kind} ${owner}`, error);
        this.settingsUnavailable = true;
        return;
      }
      const states: { [step: string]: StepState } = {};
      for (const stepKey of stepKeys) {
        const entry = snapshot?.targets?.[stepKey];
        if (!entry) {
          this.loggerService.error(`No dashboard settings are saved for ${kind} ${owner} / ${stepKey}`);
          continue;
        }
        const target: DashboardTemplateTarget = kind === 'workflow' ? { kind, recordType: owner, stage: stepKey } : { kind, view: owner, step: stepKey };
        states[stepKey] = {
          target,
          settings: entry.settings,
          fingerprint: entry.fingerprint,
          templatePrefix: this.handlebarsTemplateService.buildDashboardTemplateKeyPrefix(this.branding, target, entry.fingerprint),
          filterField: this.defaultFilterField
        };
      }
      let consistent = true;
      for (const state of Object.values(states)) {
        const loaded = await this.handlebarsTemplateService.loadDashboardTargetTemplates(this.branding, this.portal, state.target, state.fingerprint);
        consistent = consistent && loaded;
      }
      this.stepState = { ...this.stepState, ...states };
      for (const [stepKey, state] of Object.entries(states)) {
        this.tableConfig[stepKey] = state.settings.tableConfig.rowConfig;
        state.filterField = this.getFirstTextFilter(stepKey);
      }
      if (consistent) {
        return;
      }
      this.loggerService.warn(`Dashboard settings changed while loading ${kind} ${owner}; reloading settings and templates.`);
    }
  }

  public async initView(recordType: string) {
    this.workflowSteps = [];
    this.records = {};
    this.tableConfig = {};
    this.stepState = {};
    this.sortMap = {};

    // Structural context of the dashboard mode, e.g. which record type the workspace page lists.
    const dashboardTypeConfig: any = await this.recordService.getDashboardType(this.dashboardTypeSelected);
    const context: DashboardModeContext = _get(dashboardTypeConfig, 'data.formatRules', _get(dashboardTypeConfig, 'formatRules', {})) ?? {};
    const settingsRecordType = !_isEmpty(context.recordTypeFilterBy) ? String(context.recordTypeFilterBy) : recordType;

    const steps = await this.initWorkflowSteps(settingsRecordType, context);
    await this.loadStepStates('workflow', settingsRecordType, steps.map((step: any) => this.getStepKey(step)));

    for (const step of steps) {
      const stepKey = this.getStepKey(step);
      if (!this.stepState[stepKey]) {
        continue;
      }
      const defaultSortObject = this.initSortMap(step);
      this.workflowSteps.push(step);

      if (this.dashboardTypeSelected == 'workspace') {
        await this.initStep('', stepKey, '', this.packageType, 1);
      } else {
        await this.initStep(stepKey, stepKey, settingsRecordType, '', 1);
      }
    }
  }

  public async initDashboardView(dashboardView: string) {
    this.workflowSteps = [];
    this.records = {};
    this.tableConfig = {};
    this.stepState = {};
    this.sortMap = {};

    const dashboardViewConfig = await this.recordService.getDashboardView(dashboardView);
    this.dashboardViewConfig = dashboardViewConfig;
    this.recordType = dashboardViewConfig.sourceRecordType;
    this.dashboardTypeSelected = dashboardViewConfig.dashboardType || this.dashboardTypeSelected;
    this.typeLabel = `${this.translationService.t(`${this.recordType}-name-plural`)}` || 'Records';

    const steps = (dashboardViewConfig.steps || []).map((step) => this.normalizeDashboardViewStep(step));
    await this.loadStepStates('view', dashboardView, steps.map((step) => this.getStepKey(step)));

    for (const step of steps) {
      const stepKey = this.getStepKey(step);
      if (!this.stepState[stepKey]) {
        continue;
      }
      this.initSortMap(step);
      this.workflowSteps.push(step);
      const dashboardStep = step.dashboardViewStep;
      const stepName = dashboardStep.fetchMode == 'workflowStage' ? (dashboardStep.sourceWorkflowStage || stepKey) : '';
      const stepRecordType = dashboardStep.sourceRecordType || this.recordType;
      await this.initStep(stepName, stepKey, stepRecordType, '', 1);
    }
  }

  private async initWorkflowSteps(recordType: string, context: DashboardModeContext) {
    const beforeFilterSteps: any = await this.recordService.getWorkflowSteps(recordType);
    const filterWorkflowStepsBy = context.filterWorkflowStepsBy;
    let steps: any[] = [];
    if (_isArray(filterWorkflowStepsBy) && !_isEmpty(filterWorkflowStepsBy)) {
      for (const bfStep of beforeFilterSteps) {
        const filterByStage = _get(bfStep, 'config.workflow.stage');
        if (!_isUndefined(filterByStage) && _indexOf(filterWorkflowStepsBy, filterByStage) >= 0) {
          steps.push(bfStep);
        }
      }
    } else {
      steps = beforeFilterSteps;
    }
    return _orderBy(steps, ['config.displayIndex'], ['asc']);
  }

  private getFormatRules(stepKey: string) {
    return this.stepState[stepKey]?.settings?.tableConfig?.formatRules ?? {};
  }

  /** The step's own editable filter, used whenever no search text is active. */
  private getStepFilter(stepKey: string): { filterFields: any; filterString: any; filterMode: any } {
    const filterBy: any = this.getFormatRules(stepKey).filterBy;
    if (_isEmpty(filterBy)) {
      return { filterFields: undefined, filterString: undefined, filterMode: undefined };
    }
    let filterString;
    const filterBase = _get(filterBy, 'filterBase');
    if (filterBase == 'user') {
      filterString = _get(this.currentUser, _get(filterBy, 'filterBaseFieldOrValue'));
    } else if (filterBase == 'record') {
      filterString = _get(filterBy, 'filterBaseFieldOrValue');
    }
    return { filterFields: _get(filterBy, 'filterField'), filterString, filterMode: _get(filterBy, 'filterMode') };
  }

  /** Submitted search text, otherwise the step's own filter. */
  private getActiveFilter(stepKey: string): { filterFields: any; filterString: any; filterMode: any } {
    // A submitted legacy workspace search may resolve to an empty string and
    // must still replace the initial record filter, as v5.0.1 did.
    if (Object.prototype.hasOwnProperty.call(this.submittedSearch, stepKey)) {
      return {
        filterFields: this.getFilterFieldPath(stepKey),
        filterString: this.submittedSearch[stepKey],
        filterMode: ''
      };
    }
    return this.getStepFilter(stepKey);
  }

  public async initStep(stepName: string, stepKey: string, recordType: string, packageType: string, startIndex: number) {
    const { filterFields, filterString, filterMode } = this.getActiveFilter(stepKey);
    const sortByString = this.getSortStringFromSortMap(this.sortMap[stepKey], stepKey, true);
    const secondarySortString = this.getSecondarySortStringFromSortMap(this.sortMap[stepKey], stepKey, true);
    const stagedRecords = await this.recordService.getRecords(recordType, stepName, startIndex, packageType, sortByString, filterFields, filterString, filterMode, secondarySortString);

    let planTable: PlanTable;
    const formatRules = this.getFormatRules(stepKey);
    const groupBy = formatRules.groupBy;
    const sortGroupBy = formatRules.sortGroupBy;

    // Grouping is a custom-view feature; workflow stage dashboards list records directly.
    if (this.isViewPage) {
      let allItemsByGroup: any[] = [];
      if (groupBy == 'groupedByRelationships' && !_isEmpty(sortGroupBy)) {
        allItemsByGroup = await this.getAllItemsGroupedByRelationships(_get(stagedRecords, 'items'), sortGroupBy as SortGroupBy[]);
      } else if (groupBy == 'groupedByRecordType' && !_isEmpty(sortGroupBy)) {
        allItemsByGroup = await this.getAllItemsGroupedByRecordType(sortGroupBy as SortGroupBy[], stepName, startIndex, packageType, sortByString, filterFields, filterString, filterMode);
      }
      const groupedRecords: any = {
        totalItems: _get(stagedRecords, 'totalItems'),
        currentPage: _get(stagedRecords, 'currentPage'),
        noItems: _get(stagedRecords, 'noItems'),
        itemsByGroup: !_isEmpty(groupBy),
        groupedItems: allItemsByGroup,
        items: _get(stagedRecords, 'items')
      };
      planTable = this.evaluatePlanTableColumns(stepKey, groupedRecords, recordType);
    } else {
      planTable = this.evaluatePlanTableColumns(stepKey, stagedRecords, recordType);
    }

    this.records[stepKey] = planTable;
  }

  private async getAllItemsGroupedByRecordType(sortGroupBy: SortGroupBy[], stepName: string, startIndex: number, packageType: string, sortByString: string, filterFields: any, filterString: any, filterMode: any) {
    const allItemsByGroup: any[] = [];
    for (let i = 0; i < sortGroupBy.length; i++) {
      const rule = _find(sortGroupBy, (o) => _get(o, 'rowLevel') == i);
      const compareFieldValue = _get(rule, 'compareFieldValue', '');
      const itemsGroupRelated: any = await this.recordService.getRecords(compareFieldValue, stepName, startIndex, packageType, sortByString, filterFields, filterString, filterMode);
      allItemsByGroup.push(itemsGroupRelated);
    }
    return allItemsByGroup;
  }

  private async getAllItemsGroupedByRelationships(items: any, sortGroupBy: SortGroupBy[]) {
    const allItemsByGroup: any[] = [];
    for (const item of items ?? []) {
      const oid = _get(item, 'oid');
      const itemsAfterApplyInnerGroupFormatRules: any[] = [];

      const itemsGroupRelated: any = await this.recordService.getRelatedRecords(oid);
      const sortItems = _get(itemsGroupRelated, 'items');
      const countHerarchyLevels = sortGroupBy.length;

      for (let j = 0; j < sortItems.length; j++) {
        let parentTreeNodeOid = oid;
        for (let i = 0; i < countHerarchyLevels; i++) {
          const rule = _find(sortGroupBy, (o) => _get(o, 'rowLevel') == i);
          const compareField = _get(rule, 'compareField', '');
          const compareFieldValue = _get(rule, 'compareFieldValue', '');
          const relatedTo = _get(rule, 'relatedTo', '');

          for (const sortItem of sortItems) {
            const relatedToOid = _get(sortItem, relatedTo);
            const foundParent = relatedToOid == parentTreeNodeOid;
            const foundRecord = _get(sortItem, compareField) == compareFieldValue;
            const foundTopLevelParent = relatedTo == '';
            if (foundRecord && (foundParent || foundTopLevelParent)) {
              const currentOid = _get(sortItem, 'oid');
              const rowExists = _find(itemsAfterApplyInnerGroupFormatRules, ['oid', currentOid]);
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

  private templateKey(stepKey: string, ...parts: string[]): string[] {
    return [...(this.stepState[stepKey]?.templatePrefix ?? [stepKey]), ...parts];
  }

  private buildRowImports(stepKey: string, recordType: string, stagedRecord: any): any {
    const settings = this.stepState[stepKey]?.settings;
    const imports: any = {};
    this.setRuleEvaluationContext(imports, recordType, stepKey);
    _forEach(this.dashboardColumnMappings, (value, key) => {
      _set(imports, key, _get(stagedRecord, value));
    });
    _set(imports, 'branding', this.branding);
    _set(imports, 'rootContext', this.rootContext);
    _set(imports, 'baseUrl', this.baseUrl);
    _set(imports, 'portal', this.portal);
    _set(imports, 'translationService', this.translationService);
    _set(imports, 'rulesService', this.rulesService);
    _set(imports, 'rulesConfig', settings?.tableConfig?.rowRulesConfig ?? []);
    return imports;
  }

  private renderRow(stepKey: string, rows: DashboardSettingsRowConfig[], kind: 'rowConfig' | 'groupRowConfig', imports: any): any {
    const record: any = {};
    for (let i = 0; i < rows.length; i++) {
      const columnConfig = rows[i];
      record[columnConfig.variable] = this.handlebarsTemplateService.compileAndRunTemplate(columnConfig.template, imports, this.templateKey(stepKey, kind, i.toString(), columnConfig.variable));
    }
    return record;
  }

  public evaluatePlanTableColumns(stepKey: string, stagedOrGroupedRecords: any, recordType: string): PlanTable {
    const recordRows: any[] = [];
    const planTable: PlanTable = {
      items: [],
      totalItems: _get(stagedOrGroupedRecords, 'totalItems'),
      currentPage: _get(stagedOrGroupedRecords, 'currentPage'),
      noItems: _get(stagedOrGroupedRecords, 'noItems')
    };
    const settings = this.stepState[stepKey]?.settings;
    const stepRowConfig = this.tableConfig[stepKey] ?? [];
    const groupRowConfig = settings?.tableConfig?.groupRowConfig ?? [];
    const groupRowRules = settings?.tableConfig?.groupRowRulesConfig ?? [];

    const isGrouped = _get(stagedOrGroupedRecords, 'itemsByGroup');
    const allGroupedItems = _get(stagedOrGroupedRecords, 'groupedItems');
    if (isGrouped && !_isEmpty(allGroupedItems)) {
      for (const groupedRecords of allGroupedItems) {
        const groupedItems = _get(groupedRecords, 'items') ?? [];
        let imports: any = null;
        for (const stagedRecord of groupedItems) {
          imports = this.buildRowImports(stepKey, recordType, stagedRecord);
          if (!_isEmpty(groupRowRules)) {
            _set(imports, 'groupRulesConfig', groupRowRules);
            _set(imports, 'groupedItems', groupedItems);
          }
          recordRows.push(this.renderRow(stepKey, stepRowConfig, 'rowConfig', imports));
        }
        // Group rows only render for groups that returned records.
        if (!_isEmpty(groupRowConfig) && groupedItems.length > 0 && imports) {
          recordRows.push(this.renderRow(stepKey, groupRowConfig, 'groupRowConfig', imports));
        }
      }
    } else {
      for (const stagedRecord of _get(stagedOrGroupedRecords, 'items') ?? []) {
        recordRows.push(this.renderRow(stepKey, stepRowConfig, 'rowConfig', this.buildRowImports(stepKey, recordType, stagedRecord)));
      }
    }

    planTable.items = recordRows;
    return planTable;
  }

  private setRuleEvaluationContext(imports: any, recordType: string, stepName: string): void {
    const handlebars = handlebarsInstance();

    _set(imports, 'evaluateRowLevelRules', (rulesConfig: any, metadata: any, metaMetadata: any, workflow: any, oid: string, ruleSetName: string) => {
      const result = this.evaluateRowLevelRules(rulesConfig, metadata, metaMetadata, workflow, oid, ruleSetName, recordType, stepName);
      return new handlebars.SafeString(result ?? '');
    });
    _set(imports, 'evaluateGroupRowRules', (groupRulesConfig: any, groupedItems: any, ruleSetName: string) => {
      const result = this.evaluateGroupRowRules(groupRulesConfig, groupedItems, ruleSetName, recordType, stepName);
      return new handlebars.SafeString(result ?? '');
    });
  }

  private getRuleSetConfig(rulesConfig: any, ruleSetName: string) {
    if (_isArray(rulesConfig)) {
      return _find(rulesConfig, (ruleSet: any) => _get(ruleSet, 'ruleSetName') === ruleSetName);
    }
    return undefined;
  }

  private renderRules(ruleSetConfig: DashboardSettingsRuleSet | undefined, imports: any, keyBase: (i: number) => string[]): string | undefined {
    if (_isUndefined(ruleSetConfig) || _get(ruleSetConfig, 'applyRuleSet', true) === false) {
      return undefined;
    }
    const rules = ruleSetConfig.rules ?? [];
    const renderedRules: any[] = [];
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (rule.evaluateRulesTemplate) {
        const shouldRender = this.handlebarsTemplateService.compileAndRunTemplate(rule.evaluateRulesTemplate, imports, [...keyBase(i), 'evaluate']);
        if (shouldRender != 'true') {
          continue;
        }
      }
      if (rule.renderItemTemplate) {
        renderedRules.push(this.handlebarsTemplateService.compileAndRunTemplate(rule.renderItemTemplate, imports, [...keyBase(i), 'render']));
      }
    }
    return _isEmpty(renderedRules) ? undefined : _join(renderedRules, _get(ruleSetConfig, 'separator', ''));
  }

  public evaluateRowLevelRules(rulesConfig: any, metadata: any, metaMetadata: any, workflow: any, oid: string, ruleSetName: string, recordType: string, stepName: string) {
    const imports: any = {
      branding: this.branding,
      rootContext: this.rootContext,
      baseUrl: this.baseUrl,
      portal: this.portal,
      translationService: this.translationService,
      metadata,
      metaMetadata,
      workflow,
      oid
    };
    return this.renderRules(this.getRuleSetConfig(rulesConfig, ruleSetName), imports, (i) => this.templateKey(stepName, 'rowRules', ruleSetName, i.toString()));
  }

  public evaluateGroupRowRules(groupRulesConfig: any, groupedItems: any, ruleSetName: string, recordType: string, stepName: string) {
    const imports: any = {
      branding: this.branding,
      rootContext: this.rootContext,
      baseUrl: this.baseUrl,
      portal: this.portal,
      translationService: this.translationService,
      groupedItems
    };
    return this.renderRules(this.getRuleSetConfig(groupRulesConfig, ruleSetName), imports, (i) => this.templateKey(stepName, 'groupRowRules', ruleSetName, i.toString()));
  }

  private initSortMap(step: any) {
    const stepKey = this.getStepKey(step);
    const stepRowConfig: DashboardSettingsRowConfig[] = this.tableConfig[stepKey] ?? [];
    this.sortMap[stepKey] = {};
    for (const columnConfig of stepRowConfig) {
      if (columnConfig.initialSort == 'asc' || columnConfig.initialSort == 'desc') {
        this.sortMap[stepKey][columnConfig.variable] = {
          sort: columnConfig.initialSort,
          secondarySort: columnConfig.secondarySort != undefined ? columnConfig.secondarySort : '',
          defaultSort: columnConfig.defaultSort == true
        };
      }
    }
    this.enableSort = !this.isViewPage;
  }

  private async reloadStep(stepKey: string, page: number) {
    if (this.dashboardTypeSelected == 'workspace') {
      await this.initStep('', stepKey, '', this.packageType, page);
    } else {
      const state = this.stepState[stepKey];
      const recordType = state?.target.kind === 'workflow' ? state.target.recordType : this.recordType;
      await this.initStep(stepKey, stepKey, recordType, '', page);
    }
  }

  public async sortChanged(data: any) {
    if (this.dashboardTypeSelected == 'standard' || this.dashboardTypeSelected == 'workspace') {
      this.updateSortMap(data);
      await this.reloadStep(data.step, 1);
    }
  }

  private updateSortMap(sortData: any) {
    const stepRowConfig = this.tableConfig[sortData.step] ?? [];
    for (const columnConfig of stepRowConfig) {
      this.sortMap[sortData.step][columnConfig.variable] = {
        sort: (columnConfig as any).noSort,
        secondarySort: columnConfig.secondarySort ?? ''
      };
    }
    this.sortMap[sortData.step][sortData.variable] = {
      sort: sortData.sort,
      secondarySort: sortData.secondarySort,
      defaultSort: true
    };
  }

  public async pageChanged(event: PageChangedEvent, step: string) {
    if (this.isProcessingPageChange) {
      return;
    }
    this.isProcessingPageChange = true;
    try {
      if (this.isViewPage) {
        const currentStep = _find(this.workflowSteps, (workflowStep) => this.getStepKey(workflowStep) == step) || this.workflowSteps[0];
        if (!currentStep) {
          return;
        }
        const stepKey = this.getStepKey(currentStep);
        const dashboardViewStep = _get(currentStep, 'dashboardViewStep', {}) as DashboardViewStepDefinitionResponse;
        const stepName = dashboardViewStep.fetchMode == 'workflowStage' ? (dashboardViewStep.sourceWorkflowStage || stepKey) : '';
        await this.initStep(stepName, stepKey, dashboardViewStep.sourceRecordType || this.recordType, '', event.page);
      } else {
        await this.reloadStep(step, event.page);
      }
    } finally {
      this.isProcessingPageChange = false;
    }
  }

  public getSortStateFromSortMap(sortMap: any, workflowStep: any, rowConfig: any) {
    const sortMapAtStep = sortMap[this.getStepKey(workflowStep)];
    return _has(sortMapAtStep, rowConfig.variable) ? sortMapAtStep[rowConfig.variable].sort : 'desc';
  }

  public getSecondarySortStateFromSortMap(sortMap: any, workflowStep: any, rowConfig: any) {
    const sortMapAtStep = sortMap[this.getStepKey(workflowStep)];
    return _has(sortMapAtStep, rowConfig.variable) ? sortMapAtStep[rowConfig.variable].secondarySort : 'desc';
  }

  private getActiveSortFieldFromSortMap(sortMapAtStep: any, step: string, forceDefault: boolean = false) {
    const fields = (this.tableConfig[step] ?? []).map((column) => column.variable);
    if (_isEmpty(fields) || _isEmpty(sortMapAtStep)) {
      return '';
    }
    let activeSortField = '';
    for (const sortField of fields) {
      if (!_has(sortMapAtStep, sortField) || _isEmpty(sortMapAtStep[sortField])) {
        continue;
      }
      const sort = _get(sortMapAtStep, [sortField, 'sort']);
      if (sort !== 'asc' && sort !== 'desc') {
        continue;
      }
      if (forceDefault && _get(sortMapAtStep, [sortField, 'defaultSort']) == true) {
        return sortField;
      }
      if (_isEmpty(activeSortField)) {
        activeSortField = sortField;
      }
    }
    return activeSortField;
  }

  /** Column sort first; otherwise the step's overall sort; otherwise last modified. */
  private getSortStringFromSortMap(sortMapAtStep: any, step: string, forceDefault: boolean = false) {
    const sortField = this.getActiveSortFieldFromSortMap(sortMapAtStep, step, forceDefault);
    if (_isEmpty(sortField)) {
      const sortBy = this.getFormatRules(step).sortBy;
      return !_isEmpty(sortBy) ? String(sortBy) : 'metaMetadata.lastSaveDate:-1';
    }
    return `${sortField}:${_get(sortMapAtStep, [sortField, 'sort']) == 'desc' ? '-1' : '1'}`;
  }

  private getSecondarySortStringFromSortMap(sortMapAtStep: any, step: string, forceDefault: boolean = false) {
    const sortField = this.getActiveSortFieldFromSortMap(sortMapAtStep, step, forceDefault);
    if (_isEmpty(sortField)) {
      return '';
    }
    const secondarySort = _get(sortMapAtStep, [sortField, 'secondarySort']);
    if (secondarySort != null && secondarySort !== '') {
      return `${secondarySort}:${_get(sortMapAtStep, [sortField, 'sort']) == 'desc' ? '-1' : '1'}`;
    }
    return '';
  }

  /** Search controls for a step, keyed by this page's record type. */
  private getQueryFilters(step: string): QueryFilter[] {
    const queryFilters = this.getFormatRules(step).queryFilters ?? {};
    const filters = (queryFilters as any)[this.recordType];
    return _isArray(filters) ? filters : [];
  }

  private getFirstTextFilter(step: string): FilterField {
    for (const queryFilter of this.getQueryFilters(step)) {
      if (queryFilter.filterType == 'text' && !_isEmpty(queryFilter.filterFields)) {
        return queryFilter.filterFields[0];
      }
    }
    return this.defaultFilterField;
  }

  public getTextFilters(step: string): FilterField[] {
    const filterFields: FilterField[] = [];
    for (const queryFilter of this.getQueryFilters(step)) {
      if (queryFilter.filterType == 'text') {
        filterFields.push(...(queryFilter.filterFields ?? []));
      }
    }
    return filterFields;
  }

  public getFilterFieldName(step: string): string {
    return this.stepState[step]?.filterField?.name ?? this.defaultFilterField.name;
  }

  private getFilterFieldPath(step: string): string {
    return this.stepState[step]?.filterField?.path ?? this.defaultFilterField.path;
  }

  /** Whether this step shows the search box on this page. */
  public isSearchEnabled(step: string): boolean {
    return (this.dashboardTypeSelected == 'standard' || this.dashboardTypeSelected == 'workspace')
      && !this.isViewPage
      && this.stepState[step]?.settings?.searchable === true;
  }

  /** Whether this step shows its stage heading on this page. */
  public isStageTitleShown(step: string): boolean {
    return (this.dashboardTypeSelected == 'standard' || this.dashboardTypeSelected == 'consolidated')
      && this.stepState[step]?.settings?.showStageTitle !== false;
  }

  public getFilterSearchDisplayed(step: any): boolean {
    return _get(this.isFilterSearchDisplayed, step, '') == 'filterDisplayed';
  }

  public getIsSearching(step: any): boolean {
    return _get(this.isSearching, step, '') == 'searching';
  }

  public getFilterSearchString(step: any): string {
    const filterString = _get(this.filterSearchString, step, '');
    if (_isEmpty(filterString)) {
      return '';
    }
    const queryFilters = this.getQueryFilters(step);
    const filterFieldPath = this.getFilterFieldPath(step);
    for (let i = 0; i < queryFilters.length; i++) {
      const filterFields = queryFilters[i].filterFields ?? [];
      for (let j = 0; j < filterFields.length; j++) {
        const filterField = filterFields[j];
        if (
          filterField.path == filterFieldPath &&
          filterField.legacyTemplateLookupFailed === true &&
          !filterField.template
        ) {
          // v5.0.1 workspace lookup missed a configured non-empty template
          // and passed its empty result to search. Migration keeps that apart
          // from a genuinely empty template, which uses the entered text.
          return '';
        }
        if (filterField.path == filterFieldPath && filterField.template) {
          const key = this.templateKey(step, 'filters', this.recordType, i.toString(), 'fields', j.toString(), 'template');
          return this.handlebarsTemplateService.compileAndRunTemplate(filterField.template, { value: filterString }, key);
        }
      }
    }
    return filterString;
  }

  public async filterChanged(step: string) {
    if (!this.isSearchEnabled(step)) {
      return;
    }
    this.submittedSearch[step] = this.getFilterSearchString(step);
    this.isSearching[step] = 'searching';
    this.isFilterSearchDisplayed[step] = 'filterDisplayed';
    try {
      await this.reloadStep(step, 1);
    } finally {
      this.isSearching[step] = '';
    }
  }

  public async resetFilterAndSearch(step: string, e: any) {
    if (!this.isSearchEnabled(step)) {
      return;
    }
    this.setFilterField(step, this.getFirstTextFilter(step), e);
    this.isSearching[step] = 'searching';
    this.filterSearchString[step] = '';
    this.submittedSearch[step] = '';
    try {
      await this.reloadStep(step, 1);
    } finally {
      this.isSearching[step] = '';
    }
  }

  public setFilterField(step: string, filterField: FilterField, e: any) {
    if (e) {
      e.preventDefault();
    }
    if (this.stepState[step]) {
      this.stepState[step].filterField = filterField;
    }
  }
}
