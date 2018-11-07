import {ApplicationRef, Component, ElementRef, Inject, Injectable, OnInit, ViewChild} from '@angular/core';
import {DOCUMENT} from '@angular/platform-browser';
import {DashboardService} from './shared/dashboard-service';
import * as _ from "lodash";
import {LoadableComponent} from './shared/loadable.component';
import {TranslationService} from './shared/translation-service';
import {RecordsService} from './shared/form/records.service';
import {AgGridNg2} from 'ag-grid-angular';
import {Plan, PlanTable} from './shared/dashboard-models';

declare var pageData: any;
declare var jQuery: any;

@Component({
  moduleId: module.id,
  selector: 'manage-test',
  templateUrl: './manage-test.html'
})

@Injectable()
export class ManageTestComponent extends LoadableComponent implements OnInit {
  branding: string;
  portal: string;
  packageType: string;
  initSubs: any;

  gridApi;
  gridColumnApi;
  rowData: any[];

  columnDefs;
  rowModelType;
  rowSelection;
  maxBlocksInCache;
  cacheBlockSize;
  getRowNodeId;
  datasource;

  constructor(
    @Inject(DashboardService) protected dashboardService: DashboardService,
    protected recordsService: RecordsService,
    @Inject(DOCUMENT) protected document: any,
    protected elementRef: ElementRef,
    public translationService: TranslationService,
    protected app: ApplicationRef) {
    super();
    this.setLoading(true);
    this.initTranslator(this.translationService);
    let that = this;
    this.columnDefs = [
      {
        headerName: 'Title', field: 'title', cellRenderer: function (params) {
          //console.log('title params', params);
          if (params && params.data) {
            return `<a href="${that.dashboardService.getBrandingAndPortalUrl}/record/view/${params.data.oid}">${params.value}</a>`;
          } else {
            return '';
          }
        }
      },
      {headerName: 'Workflow Stage', field: 'workflowStage'},
      {headerName: 'Package Type', field: 'packageType'},
      {headerName: 'Created', field: 'dateCreated'},
      {headerName: 'Modified', field: 'dateModified'}
    ];
    this.rowModelType = "infinite";
    this.rowSelection = false;
    this.maxBlocksInCache = 2;
    this.cacheBlockSize = 50;
    this.getRowNodeId = function (item) {
      return item.oid;
    };
    this.datasource = this.getDataSource(this.cacheBlockSize);

  }

  onGridReady(params) {
    this.gridApi = params.api;
    this.gridColumnApi = params.columnApi;
  }

  getDataSource(count) {
    let that = this;

    function GridDataSource(rowCount) {
      this.component = that;
      this.rowCount = rowCount;
    }

    GridDataSource.prototype.getRows = function (params) {
      // The first row index to get.
      let startRow: number = params.startRow;

      // The first row index to NOT get.
      let endRow: number = params.endRow;

      // If doing Server-side sorting, contains the sort model
      let sortModel: any = params.sortModel;

      // If doing Server-side filtering, contains the filter model
      let filterModel: any = params.filterModel;

      // The grid context object
      let context: any = params.context;

      // Callback to call when the request is successful.
      // (rowsThisBlock: any[], lastRow?: number)
      let successCallback: any = params.successCallback;

      // Callback to call when the request fails.
      let failCallback: void = params.failCallback;

      let rowsThisPage = [];

      let recordType = '';
      let state = undefined;
      let pageNumber: number = 1;
      let packageType: string = null;
      let defaultSort: any = [{colId: "date_object_modified", sort: "desc"}];
      let rows: number = endRow - startRow;
      let lastRowIndex: number;

      let sortData = that.buildSortObj(sortModel || defaultSort);
      let filterData = that.buildFilterObj(filterModel);

      console.log('params', params);

      this.component.dashboardService.getRecords(
        recordType, state, pageNumber, packageType, sortData, rows, filterData
      ).then(
        (stagedRecords: PlanTable) => {
          this.component.setDashboardTitle(stagedRecords);

          lastRowIndex = stagedRecords.totalItems ? stagedRecords.totalItems - 1 : null;
          for (let item of stagedRecords.items) {
            rowsThisPage.push({
              'oid': item.oid,
              'title': item.title,
              'dateCreated': item.dateCreated,
              'dateModified': item.dateModified,
              'workflowStage': item.metadata.workflow.stageLabel,
              'packageType': item.metadata.packageType.join(', ')
            });
          }

          setTimeout(function () {
            let lastRow = endRow >= lastRowIndex ? lastRowIndex : undefined;

            console.log('block of rows loaded', rowsThisPage, 'lastRow', lastRow);

            successCallback(rowsThisPage, lastRow);
          }, 100);
        });
    };

    return new GridDataSource(count);
  }

  ngOnInit() {
    this.branding = this.elementRef.nativeElement.getAttribute('branding');
    this.portal = this.elementRef.nativeElement.getAttribute('portal');
    this.packageType = this.elementRef.nativeElement.getAttribute('packageType');
    this.initSubs = this.dashboardService.waitForInit((initStat: boolean) => {
      this.initSubs.unsubscribe();
      this.translationService.isReady(tService => {
        this.checkIfHasLoaded();
      });
    });
  }

  protected setDashboardTitle(planTable: PlanTable) {
    _.forEach(planTable.items, (plan: Plan) => {
      plan.dashboardTitle = (_.isUndefined(plan.title) || _.isEmpty(plan.title) || _.isEmpty(plan.title[0])) ? this.translationService.t('plan-with-no-title') : plan.title;
    });
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

  buildSortObj(agGridSortModel: any) {
    // format: [{ colId: "column name", sort: "desc" }]
    return agGridSortModel;
  }

  buildFilterObj(agGridFilterModel: any) {
    // creates an array of filters// possible fields from this.columnDefs[0]['field']
    // combine from agGridFilterModel['operator']
    // convert filters in agGridFilterModel to one of these possible filters:
    // equal, not_equal, contains, not_contains, gte, gt, lte, lt, starts_with, ends_with
    // 'inRange' is inclusive, should be converted to gte and lte
    // filter model is an object with keys that are column names (from field names)
    // then values are {filter: '...', filterType: '', type: ''} or
    // { condition1: {}, condition2: {}, operator: 'AND' / 'OR'
    console.log('build filter obj', agGridFilterModel);

    let result = {'AND': []};
    for (let key in agGridFilterModel) {
      if (agGridFilterModel.hasOwnProperty(key)) {
        let value = agGridFilterModel[key];
        let type1 = undefined;
        let filter1 = undefined;
        let filterType1 = undefined;
        let type2 = undefined;
        let filter2 = undefined;
        let filterType2 = undefined;

        if (value['operator'] && value['condition1'] && value['condition2']) {
          type1 = value['condition1']['type'];
          filter1 = value['condition1']['filter'];
          filterType1 = value['condition1']['filterType'];
          type2 = value['condition2']['type'];
          filter2 = value['condition2']['filter'];
          filterType2 = value['condition2']['filterType'];

          let output = {};
          output[value['operator']] = [];
          output[value['operator']][0] = {};
          output[value['operator']][0][key] = {};
          output[value['operator']][0][key][type1] = filter1;
          output[value['operator']][1] = {};
          output[value['operator']][1][key] = {};
          output[value['operator']][1][key][type2] = filter2;

          result['AND'].push(output);

        } else if (value['type'] && value['filter'] && value['filterType']) {
          type1 = value['type'];
          filter1 = value['filter'];
          filterType1 = value['filterType'];

          let output = {};
          output['AND'] = [];
          output['AND'][0] = {};
          output['AND'][0][key] = {};
          output['AND'][0][key][type1] = filter1;

          result['AND'].push(output);
        }
      }
    }

    console.log('built filter obj', result);
    return result;
  }

}
