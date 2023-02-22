import { Component, Inject, OnInit, ElementRef } from '@angular/core';
import { UtilityService, LoggerService, TranslationService, RecordService, PlanTable, Plan, RecordResponseTable } from '@researchdatabox/redbox-portal-core';
import * as _ from 'lodash';

@Component({
  selector: 'dashboard',
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  title = '@researchdatabox/dashboard';
  wfSteps: any; 
  config: any = {};
  branding: string = '';
  portal: string = '';
  rootContext: string = '';
  workflowSteps: any = [];
  typeLabel: string = '';
  recordType: string = '';
  isReady: boolean = false; 
  records: any = {};
  sortMap: any = {};
  tableConfig: any = {};
  recordTitle: string = '';
  standardDashboard: boolean = false;
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
  sortFields = ['metaMetadata.lastSaveDate', 'metaMetadata.createdOn', 'metadata.title', 'metadata.contributor_ci.text_full_name', 'metadata.contributor_data_manager.text_full_name'];

  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(UtilityService) private utilService: UtilityService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(RecordService) private recordService: RecordService,
    elementRef: ElementRef
  ) {
    //do nothing
    this.recordType = elementRef.nativeElement.getAttribute('recordType');
    console.log(`constructor this.recordType ${this.recordType}`);
    this.standardDashboard = elementRef.nativeElement.getAttribute('standardDashboard');
    console.log(`constructor this.standardDashboard ${this.standardDashboard}`);
  }

  async ngOnInit() {
    this.loggerService.debug(`Export waiting for deps to init...`); 
    await this.utilService.waitForDependencies([this.translationService, this.recordService]);
    this.loggerService.debug(`Export initialised.`); 
    this.recordType = 'rdmp';
    this.config = this.recordService.getConfig();
    console.log(this.config);
    this.rootContext = _.get(this.config, 'baseUrl');
    this.branding = _.get(this.config, 'branding');
    this.portal = _.get(this.config, 'portal');
    // this.workflowSteps = await this.recordService.getWorkflowSteps(this.recordType);
    // this.records = await this.recordService.getRecords(this.recordType,'draft',1);
    // console.log(this.records);
    console.log(JSON.stringify(this.config));
    // this.loggerService.debug(this.config);
    console.log(`config: rootContext ${this.rootContext} branding ${this.branding} portal ${this.portal}`);
    this.typeLabel = `${this.translationService.t(`${this.recordType}-name-plural`)}`;
    this.recordTitle = `${this.translationService.t(`${this.recordType}-title`)}`;
    await this.initRecordType(this.recordType);
    this.isReady = true;
  }

  async ngAfterViewInit() {
    await this.utilService.waitForDependencies([this.translationService, this.recordService]);
    this.wfSteps = await this.recordService.getRelatedRecords('fbff59909c6111ed8dfd4d8104fc0287');
    this.isReady = true;
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
      let stagedRecords: any = await this.recordService.getRecords(recordType, step.name, 1, '', 'metaMetadata.lastSaveDate:-1');
      let planTable: PlanTable = this.evaluatePlanTableColumns(step.name, stagedRecords);
      // console.log(planTable);
      // this.initTracker.loaded++;
      this.setDashboardTitle(planTable);
      // console.log(this.records);
      this.records[step.name] = planTable;
      // this.checkIfHasLoaded();
      console.log(this.records);
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
        console.log(rowConfig);
        const template = _.template(rowConfig.template, templateData);
        const templateRes = template();

        record[rowConfig.variable] = templateRes;
      }
      recordRows.push(record);
    }
    planTable.items = recordRows;

    return planTable;
  }
  
  // async sortChanged(data: any) {
  //   let sortString = `${data.variable}:`;
  //   if (data.sort == 'desc') {
  //     sortString = sortString + "-1";
  //   } else {
  //     sortString = sortString + "1";
  //   }
    
  //   let stagedRecords: any = await this.recordService.getRecords(this.recordType, data.step, 1, '', sortString);
  //   console.log(stagedRecords);
  //   let planTable: PlanTable = this.evaluatePlanTableColumns(data.step, stagedRecords);
  //   console.log(planTable);
  //   this.setDashboardTitle(stagedRecords);
  //   this.records[data.step] = stagedRecords;

  //   this.updateSortMap(data);
  // }

  // updateSortMap(sortData: any) {
  //   let sortDetails = this.sortMap[sortData.step];

  //   sortDetails = {};

  //   let stepRowConfig = this.tableConfig[sortData.step];
  //   for (let rowConfig of stepRowConfig) {
  //     sortDetails[rowConfig.variable] = {
  //       sort: null
  //     };

  //   }

  //   sortDetails[sortData.variable] = {
  //     sort: sortData.sort
  //   };

  //   this.sortMap[sortData.step] = sortDetails;
  // }

  protected setDashboardTitle(planTable: PlanTable) {
    _.forEach(planTable.items, (plan: Plan) => {
      plan.dashboardTitle = (_.isUndefined(plan.title) || _.isEmpty(plan.title) || _.isEmpty(plan.title[0])) ? this.translationService.t('plan-with-no-title') : plan.title;
    });
  }
}


