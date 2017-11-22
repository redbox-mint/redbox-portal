import { Component, Injectable, Inject, ElementRef } from '@angular/core';
import { DOCUMENT } from '@angular/platform-browser';
import { FormArray, FormGroup, FormControl, Validators, FormBuilder } from '@angular/forms';
import { UserSimpleService } from '../shared/user.service-simple';
import { DashboardService } from '../shared/dashboard-service';
import { PlanTable, Plan } from '../shared/dashboard-models';
import * as _ from "lodash-lib";
import { LoadableComponent } from '../shared/loadable.component';
import { OnInit } from '@angular/core';
import { PaginationModule, TooltipModule} from 'ngx-bootstrap';
import { TranslationService } from '../shared/translation-service';

declare var pageData: any;
declare var jQuery: any;

@Component({
  moduleId: module.id,
  selector: 'dashboard',
  templateUrl: './dashboard.html'
})
// TODO: find a way to remove jQuery dependency
@Injectable()
export class DashboardComponent extends LoadableComponent  {
  branding: string;
  portal: string;
  draftPlans: PlanTable;
  activePlans: PlanTable;
  saveMsgType = "info";
  initSubs: any;
  initTracker: any = {draftLoaded:false, activeLoaded: false};


  constructor( @Inject(DashboardService) protected dashboardService: DashboardService, @Inject(DOCUMENT) protected document: any, elementRef: ElementRef, translationService:TranslationService ) {
    super();
    this.initTranslator(translationService);
    this.draftPlans = new PlanTable();
    this.activePlans = new PlanTable();
    this.branding = elementRef.nativeElement.getAttribute('branding');
    this.portal = elementRef.nativeElement.getAttribute('portal');
    this.initSubs = dashboardService.waitForInit((initStat:boolean) => {
      this.initSubs.unsubscribe();
      dashboardService.getDraftPlans(1).then((draftPlans: PlanTable) => {
        this.setDraftPlans(draftPlans);
        this.initTracker.draftLoaded = true;
        this.checkIfHasLoaded();
      });
      dashboardService.getActivePlans(1).then((activePlans: PlanTable) => {
         this.setActivePlans(activePlans);
         this.initTracker.activeLoaded = true;
         this.checkIfHasLoaded();
       });
    });
  }

  protected setDashboardTitle(planTable: PlanTable) {
    _.forEach(planTable.items, (plan: Plan) => {
      plan.dashboardTitle = (_.isUndefined(plan.title) || _.isEmpty(plan.title) || _.isEmpty(plan.title[0])) ? this.translationService.t('plan-with-no-title'): plan.title;
    });
  }

  public hasLoaded() {
    return this.initTracker.draftLoaded && this.initTracker.activeLoaded && this.translatorReady;
  }

  public draftTablePageChanged(event:any):void {
    this.dashboardService.getDraftPlans(event.page).then((draftPlans: PlanTable) => { this.setDraftPlans(draftPlans); });
  }

  public activeTablePageChanged(event:any):void {
    this.dashboardService.getActivePlans(event.page).then((activePlans: PlanTable) => { this.setActivePlans(activePlans); });
  }

  public setDraftPlans(draftPlans) {
    this.setDashboardTitle(draftPlans);
    this.draftPlans = draftPlans;
  }

  public setActivePlans(activePlans) {
    this.setDashboardTitle(activePlans);
    this.activePlans = activePlans;
  }

}
