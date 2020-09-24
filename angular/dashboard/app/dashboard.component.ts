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
      template: '<%= metadata.contributor_ci != undefined ? metadata.contributor_ci.text_full_name : "" %>'
    },
    {
      title: 'header-data-manager',
      variable: 'metadata.contributor_data_manager.text_full_name',
      template: '<%= metadata.contributor_data_manager != undefined ? metadata.contributor_data_manager.text_full_name : "" %>'
    },
    {
      title: 'header-created',
      variable: 'date_object_created',
      template: '<%= dateCreated %>'
    },
    {
      title: 'header-modified',
      variable: 'date_object_modified',
      template: '<%= dateModified %>'
    }
  ]

  constructor(@Inject(DashboardService) protected dashboardService: DashboardService, protected recordsService: RecordsService, @Inject(DOCUMENT) protected document: any, elementRef: ElementRef, translationService: TranslationService) {
    super();
    this.initTranslator(translationService);
    this.draftPlans = new PlanTable();
    this.activePlans = new PlanTable();
    this.branding = elementRef.nativeElement.getAttribute('branding');
    this.portal = elementRef.nativeElement.getAttribute('portal');
    this.recordType = elementRef.nativeElement.getAttribute('recordType');
  }

  ngOnInit() {
    this.translationService.isReady(tService => {
      this.waitForInit([
        this.dashboardService,
        this.recordsService 
      ], () => {
        this.recordsService.getType(this.recordType).then(type => {
          this.typeLabel = this.getTranslated(`${this.recordType}-name-plural`, "Records");
          this.recordTitle = this.getTranslated(`${this.recordType}-title`, "Title");
        });
        this.recordsService.getWorkflowSteps(this.recordType).then(steps => {
          steps = _.orderBy(steps, ['config.displayIndex'], ['asc'])
          this.workflowSteps = steps;
          _.each(steps, step => {
            let stepTableConfig = this.defaultTableConfig;
            this.defaultTableConfig[0].title= `${this.recordType}-title`, "Title";
            if(step.config.dashboard != null && step.config.dashboard.table != null && step.config.dashboard.table.rowConfig != null) {
              stepTableConfig = step.config.dashboard.table.rowConfig;
            }
            this.tableConfig[step.name] = stepTableConfig;
            this.sortMap[step.name] = {};
            for (let rowConfig of stepTableConfig) {
              this.sortMap[step.name][rowConfig.variable] = {
                sort: rowConfig.initialSort
              };

            }
            this.initTracker.target++;
            this.dashboardService.getRecords(this.recordType, step.name, 1, null, 'date_object_modified:-1').then((stagedRecords: RecordResponseTable) => {
              let planTable: PlanTable = this.evaluatePlanTableColumns(stagedRecords);
              this.initTracker.loaded++;
              this.setDashboardTitle(planTable);
              this.records[step.name] = planTable;
              this.checkIfHasLoaded();
            });
          });
        });
      });
    });
  }

  evaluatePlanTableColumns(stagedRecords: RecordResponseTable): PlanTable {
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
      imports.hasEditAccess = stagedRecord.hasEditAccess;
      imports.branding = this.branding;
      imports.portal = this.portal;
      imports.translationService = this.translationService;


      const templateData = {
        imports: imports
      };
      let record = {};
      let stepTableCOnfig = this.defaultTableConfig;

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


    this.dashboardService.getRecords(this.recordType, step, event.page, null, this.getSortString(sortDetails)).then((stagedRecords: PlanTable) => {
      this.setDashboardTitle(stagedRecords);
      this.records[step] = stagedRecords;
    });
  }

  getSortString(sortDetails: any) {

    let fields = ['date_object_modified', 'date_object_created', 'metadata.title', 'metadata.contributor_ci.text_full_name', 'metadata.contributor_data_manager.text_full_name'];

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
    return 'date_object_modified:-1';
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

  sortChanged(data) {
    let sortString = `'${data.variable}':`;
    if (data.sort == 'desc') {
      sortString = sortString + "-1";
    } else {
      sortString = sortString + "1";
    }
    this.dashboardService.getRecords(this.recordType, data.step, 1, null, sortString).then((stagedRecords: PlanTable) => {
      let planTable: PlanTable = this.evaluatePlanTableColumns(stagedRecords);
      this.setDashboardTitle(stagedRecords);
      this.records[data.step] = stagedRecords;
    });
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