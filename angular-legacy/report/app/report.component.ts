import { Component, Injectable, Inject, ElementRef, ViewChildren } from '@angular/core';
import { DOCUMENT } from '@angular/platform-browser';
import { FormArray, FormGroup, FormControl, Validators, FormBuilder } from '@angular/forms';
import { UserSimpleService } from './shared/user.service-simple';
import { ReportService } from './shared/report-service';
import { Report, ReportResults } from './shared/report-models';
import * as _ from "lodash";
import { LoadableComponent } from './shared/loadable.component';
import { OnInit } from '@angular/core';
import { PaginationModule, TooltipModule } from 'ngx-bootstrap';
import { TranslationService } from './shared/translation-service';
import * as moment from 'moment';


declare var pageData: any;
declare var jQuery: any;

@Component({
  moduleId: module.id,
  selector: 'report',
  templateUrl: './Report.html'
})
// TODO: find a way to remove jQuery dependency
@Injectable()
export class ReportComponent extends LoadableComponent {
  branding: string;
  portal: string;
  name: string;
  report: Report;
  reportResults: ReportResults;
  saveMsgType = "info";
  initSubs: any;
  initTracker: any = { reportLoaded: false, resultsReturned: false };
  resultCountParam: object;
  filterParams: any;
  @ViewChildren('dateTime1') public dateTime1: any;
  @ViewChildren('dateTime2') public dateTime2: any;
  fromDate: string = "";
  toDate: string = "";


  constructor( @Inject(ReportService) protected reportService: ReportService, @Inject(DOCUMENT) protected document: any, elementRef: ElementRef, translationService: TranslationService) {
    super();
    this.initTranslator(translationService);
    this.report = new Report();
    this.reportResults = new ReportResults();
    this.branding = elementRef.nativeElement.getAttribute('branding');
    this.portal = elementRef.nativeElement.getAttribute('portal');
    this.name = elementRef.nativeElement.getAttribute('name');
    this.filterParams = {};
    this.initSubs = reportService.waitForInit((initStat: boolean) => {
      this.initSubs.unsubscribe();
      reportService.getReport(this.name).then((report: Report) => {
        this.setReport(report);
        this.initTracker.reportLoaded = true;
        this.getReportResults(1, {});
        this.checkIfHasLoaded();
      });
    });
  }

  ngAfterViewInit() {
    this.dateTime1.changes.subscribe((dateTime:any) => {
      jQuery(`#${dateTime.first.idDatePicker}`).attr('aria-label', this.getTranslated('report-filter-date-from', 'From'));
    });
    this.dateTime2.changes.subscribe((dateTime:any) => {
      jQuery(`#${dateTime.first.idDatePicker}`).attr('aria-label', this.getTranslated('report-filter-date-to', 'To'));
    });
  }


  public hasLoaded() {
    return this.initTracker.reportLoaded
  }

  public getReportResults(page: number, params:object) {
    this.reportService.getReportResults(this.name, page, params).then((results: ReportResults) => { this.reportResults = results; this.initTracker.resultsReturned = true; this.resultCountParam = { count: this.reportResults.totalItems }; });

  }
  public reportResultsPageChanged(event: any): void {
    this.getReportResults(event.page, {});
  }

  public setReport(report) {
    if(!_.isArray(report["filter"])) {
      let filterArray:object[] = []
      if(report["filter"] != null) {
        report["filter"]["paramName"] = "dateRange"
        filterArray.push(report["filter"])
      }
      report["filter"] = filterArray;
    }
    

    this.report = report;
  }

  public filter(event: any): void {
    this.initTracker.resultsReturned = false;
    this.reportResults = new ReportResults();
    this.getReportResults(1, this.getParams());
  }

  private getParams() {
    var params = {};
    let filters:object[] = this.report["filter"] as object[]
    for(let filter of filters) {
      if (filter["type"] == 'date-range') {

        var fromDate = (this.filterParams[filter['paramName'] + "_fromDate"] != null ? moment(this.filterParams[filter['paramName'] + "_fromDate"]) : null);
        var toDate = (this.filterParams[filter['paramName'] + "_toDate"] != null ? moment(this.filterParams[filter['paramName'] + "_toDate"]) : null);
  
        if (fromDate != null) {
          params[filter['paramName'] + "_fromDate"] = fromDate.utc().format();
          this.fromDate = params[filter['paramName'] + "_fromDate"];
        } else {
          this.fromDate = '';
        }
        if (toDate != null) {
          params[filter['paramName'] + "_toDate"] = toDate.utc().format();
          this.toDate = params[filter['paramName'] + "_toDate"];
        } else {
          this.toDate = '';
        }
      } else {
        let paramValue = this.filterParams[filter['paramName']];
        if(!_.isEmpty(paramValue)) {
         params[filter['paramName']] = paramValue
        }
      }
  
    }

    
    return params;
  }

  getDownloadCSVUrl() {
    let url = `${this.reportService.getBrandingAndPortalUrl}/admin/downloadReportCSV?name=${this.name}`;
    let params = this.getParams();
    for(var key in params) {
      url=url+'&'+key+"="+params[key];
    }
    return url;
    // href="/{{ branding }}/{{ portal }}/admin/downloadReportCSV?name={{ name }}{{ fromDate != '' ? '&fromDate=' + fromDate : '' }}{{ toDate != '' ? '&toDate=' + toDate : '' }}"
  }
}
