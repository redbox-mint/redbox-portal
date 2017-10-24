import { Component, Injectable, Inject, ElementRef } from '@angular/core';
import { DOCUMENT } from '@angular/platform-browser';
import { FormArray, FormGroup, FormControl, Validators, FormBuilder } from '@angular/forms';
import { UserSimpleService } from '../shared/user.service-simple';
import { ReportService } from '../shared/report-service';
import { Report, ReportResults } from '../shared/report-models';
import * as _ from "lodash-lib";
import { LoadableComponent } from '../shared/loadable.component';
import { OnInit } from '@angular/core';
import { PaginationModule, TooltipModule } from 'ngx-bootstrap';
import { TranslationService } from '../shared/translation-service';
import { TranslatePipe}


declare var pageData: any;
declare var jQuery: any;

@Component({
  moduleId: module.id,
  selector: 'report',
  templateUrl: './Report.html'
})
// TODO: find a way to remove jQuery dependency
@Injectable()
export class AppComponent extends LoadableComponent {
  branding: string;
  portal: string;
  name: string;
  report: Report;
  reportResults: ReportResults;
  saveMsgType = "info";
  initSubs: any;
  initTracker: any = { reportLoaded: false, resultsReturned: false };
  resultCountParam: object;


  constructor( @Inject(ReportService) protected reportService: ReportService, @Inject(DOCUMENT) protected document: any, elementRef: ElementRef, translationService: TranslationService) {
    super();
    this.initTranslator(translationService);
    this.report = new Report();
    this.reportResults = new ReportResults();
    this.branding = elementRef.nativeElement.getAttribute('branding');
    this.portal = elementRef.nativeElement.getAttribute('portal');
    this.name = elementRef.nativeElement.getAttribute('name');
    this.initSubs = reportService.waitForInit((initStat: boolean) => {
      this.initSubs.unsubscribe();
      reportService.getReport(this.name).then((report: Report) => {
        this.setReport(report);
        this.initTracker.reportLoaded = true;
        this.getReportResults(1);
        this.checkIfHasLoaded();
      });
    });
  }


  public hasLoaded() {
    return this.initTracker.reportLoaded
  }

  public getReportResults( page: number) {
    this.reportService.getReportResults(this.name, page).then((results: ReportResults) => { this.reportResults = results; this.initTracker.resultsReturned = true; this.resultCountParam = { count: this.reportResults.totalItems };});

  }
  public reportResultsPageChanged(event: any): void {
    this.getReportResults(event.page);
  }

  public setReport(report) {
    this.report = report;
  }

}
