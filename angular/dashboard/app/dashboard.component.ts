import {
  Component,
  Injectable,
  Inject,
  ElementRef
} from '@angular/core';
import {
  DOCUMENT
} from '@angular/platform-browser';
import {
  FormArray,
  FormGroup,
  FormControl,
  Validators,
  FormBuilder
} from '@angular/forms';
import {
  UserSimpleService
} from './shared/user.service-simple';
import {
  DashboardService
} from './shared/dashboard-service';
import {
  PlanTable,
  Plan,
  RecordResponseTable
} from './shared/dashboard-models';
import * as _ from "lodash";
import {
  LoadableComponent
} from './shared/loadable.component';
import {
  OnInit
} from '@angular/core';
import {
  PaginationModule,
  TooltipModule
} from 'ngx-bootstrap';
import {
  TranslationService
} from './shared/translation-service';
import {
  RecordsService
} from './shared/form/records.service';

declare var pageData: any;
declare var jQuery: any;

@Component({
  moduleId: module.id,
  selector: 'dashboard',
  templateUrl: './dashboard.html'
})
// TODO: find a way to remove jQuery dependency
@Injectable()
export class DashboardComponent extends LoadableComponent {
  branding: string;
  portal: string;
  packageType: string;
  recordType: string;
  recordTitle: string;
  typeLabel: string;
  workflowSteps: any = [];
  draftPlans: PlanTable;
  activePlans: PlanTable;
  records: any = {};
  saveMsgType = "info";
  initSubs: any;
  sortMap: any = {};
  initTracker: any = {
    target: 0,
    loaded: 0
  };
  tableConfig = {};
  // <a href='/{{ branding }}/{{ portal }}/record/view/{{ plan.oid }}'>{{ plan.dashboardTitle }}</a>
  //                 <span class="dashboard-controls">
  //                   <a *ngIf="plan.hasEditAccess" href="/{{ branding }}/{{ portal }}/record/edit/{{ plan.oid }}" [attr.aria-label]="'edit-link-label' | translate"><i class="fa fa-pencil" aria-hidden="true"></i></a>
  //                 </span>
  defaultTableConfig = [{
    title: 'Record Title',
    variable: 'metadata.title',
    template: `<a href='/<%= branding %>/<%= portal %>/record/view/<%= oid %>'><%= metadata.title %></a>
        <span class="dashboard-controls">
          <% if(hasEditAccess) { %>
            <a href='/<%= branding %>/<%= portal %>/record/edit/<%= oid %>' aria-label='<%= translationService.t('edit-link-label') %>'><i class="fa fa-pencil" aria-hidden="true"></i></a>
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
  viewAsPackageType: boolean = false;

  constructor(@Inject(DashboardService) protected dashboardService: DashboardService, protected recordsService: RecordsService, @Inject(DOCUMENT) protected document: any, elementRef: ElementRef, translationService: TranslationService) {
    super();
    this.initTranslator(translationService);
    this.draftPlans = new PlanTable();
    this.activePlans = new PlanTable();
    this.branding = elementRef.nativeElement.getAttribute('branding');
    this.portal = elementRef.nativeElement.getAttribute('portal');
    this.recordType = elementRef.nativeElement.getAttribute('recordType');
    this.packageType = elementRef.nativeElement.getAttribute('packageType');
  }

  ngOnInit() {
    this.translationService.isReady(tService => {
      this.waitForInit([
        this.dashboardService,
        this.recordsService
      ], async () => {
        if (_.isEmpty(this.packageType)) {
          this.typeLabel = this.getTranslated(`${this.recordType}-name-plural`, "Records");
          this.recordTitle = this.getTranslated(`${this.recordType}-title`, "Title");
          await this.initRecordType(this.recordType);
        } else {
          this.viewAsPackageType = true;
          this.typeLabel = this.getTranslated(`${this.packageType}-name-plural`, "Records");
          this.recordTitle = this.getTranslated(`${this.packageType}-title`, "Title");
          await this.initPackageType(this.packageType);
        }
      });
    });
  }

  async initPackageType(packageType: string) {
    // we're retrieving all recordTypes for this packageType
    const recordTypes = await this.recordsService.getAllTypesOfPackageType(packageType);
    if (_.isEmpty(this.defaultTableConfig[0].title)) {
      this.defaultTableConfig[0].title= `${this.packageType}-title`, "Title";
    }
    let mainWorkflowStep = null;
    for (let recType of recordTypes) {
      const recTypeSteps = await this.recordsService.getWorkflowSteps(recType.name);
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
    this.initTracker.target++;
    let stagedRecords: RecordResponseTable = await this.dashboardService.getRecords(null, null, 1, packageType, 'metaMetadata.lastSaveDate:-1');
    let planTable: PlanTable = this.evaluatePlanTableColumns(packageType, stagedRecords);
    this.initTracker.loaded++;
    this.setDashboardTitle(planTable);
    this.records[packageType] = planTable;
    this.checkIfHasLoaded();
  }

  async initRecordType(recordType: string) {
    let steps = await this.recordsService.getWorkflowSteps(recordType);
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
      this.initTracker.target++;
      let stagedRecords: RecordResponseTable = await this.dashboardService.getRecords(recordType, step.name, 1, null, 'metaMetadata.lastSaveDate:-1');
      let planTable: PlanTable = this.evaluatePlanTableColumns(step.name, stagedRecords);
      this.initTracker.loaded++;
      this.setDashboardTitle(planTable);
      this.records[step.name] = planTable;
      this.checkIfHasLoaded();
    }
  }

  evaluatePlanTableColumns(stepName, stagedRecords: RecordResponseTable): PlanTable {
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
      imports.portal = this.portal;
      imports.translationService = this.translationService;


      const templateData = {
        imports: imports
      };
      let record = {};
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

  protected setDashboardTitle(planTable: PlanTable) {
    _.forEach(planTable.items, (plan: Plan) => {
      plan.dashboardTitle = (_.isUndefined(plan.title) || _.isEmpty(plan.title) || _.isEmpty(plan.title[0])) ? this.translationService.t('plan-with-no-title') : plan.title;
    });
  }

  public hasLoaded() {
    return this.translatorReady && (this.initTracker.loaded >= this.initTracker.target);
  }

  public pageChanged(event: any, step: string): void {
    let sortDetails = this.sortMap[step];

    if (_.isEmpty(this.packageType)) {
      this.dashboardService.getRecords(this.recordType, step, event.page, null, this.getSortString(sortDetails)).then((stagedRecords: PlanTable) => {
        let planTable: PlanTable = this.evaluatePlanTableColumns(step, stagedRecords);
        this.setDashboardTitle(stagedRecords);
        this.records[step] = stagedRecords;
      });
    } else {
      const stagedRecords = this.dashboardService.getRecords(null, null, event.page, this.packageType, this.getSortString(sortDetails)).then((stagedRecords: PlanTable) => {
        let planTable: PlanTable = this.evaluatePlanTableColumns(this.packageType, stagedRecords);
        this.setDashboardTitle(stagedRecords);
        this.records[this.packageType] = stagedRecords;
      });
    }

  }

  getSortString(sortDetails: any) {

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

  getTranslated(key, defValue) {
    if (!_.isEmpty(key) && !_.isUndefined(key)) {
      if (_.isFunction(key.startsWith)) {
        let translatedValue = this.translationService.t(key);
        if (translatedValue == key) {
          return defValue;
        } else {
          return translatedValue;
        }
      } else {
        return key;
      }
    } else {
      return defValue;
    }
  }

  async sortChanged(data) {
    let sortString = `${data.variable}:`;
    if (data.sort == 'desc') {
      sortString = sortString + "-1";
    } else {
      sortString = sortString + "1";
    }
    const recTypeName = data
    if (_.isEmpty(this.packageType)) {
      this.dashboardService.getRecords(this.recordType, data.step, 1, null, sortString).then((stagedRecords: PlanTable) => {
        let planTable: PlanTable = this.evaluatePlanTableColumns(data.step, stagedRecords);
        this.setDashboardTitle(stagedRecords);
        this.records[data.step] = stagedRecords;
      });
    } else {
      this.dashboardService.getRecords(null, null, 1, this.packageType, sortString).then((stagedRecords: PlanTable) => {
        let planTable: PlanTable = this.evaluatePlanTableColumns(this.packageType, stagedRecords);
        this.setDashboardTitle(stagedRecords);
        this.records[this.packageType] = stagedRecords;
      });
    }

    this.updateSortMap(data);
  }

  updateSortMap(sortData) {
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

}
