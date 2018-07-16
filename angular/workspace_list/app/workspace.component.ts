import { Component, Injectable, Inject, ElementRef } from '@angular/core';
import { DOCUMENT } from '@angular/platform-browser';
import { FormArray, FormGroup, FormControl, Validators, FormBuilder } from '@angular/forms';
import { UserSimpleService } from './shared/user.service-simple';
import { DashboardService } from './shared/dashboard-service';
import { PlanTable, Plan } from './shared/dashboard-models';
import * as _ from "lodash";
import { LoadableComponent } from './shared/loadable.component';
import { OnInit } from '@angular/core';
import { PaginationModule, TooltipModule} from 'ngx-bootstrap';
import { TranslationService } from './shared/translation-service';
import { RecordsService } from './shared/form/records.service';

declare var pageData: any;
declare var jQuery: any;

@Component({
  moduleId: module.id,
  selector: 'workspace-list',
  templateUrl: './workspace-list.html'
})
@Injectable()
export class WorkspaceListComponent extends LoadableComponent implements OnInit {
  branding: string;
  portal: string;
  packageType: string;
  recordColLabel: string;
  typeColLabel:string;
  linkColLlabel: string;
  rdmpColLabel: string;

  workflowSteps:any = [];
  records:any;
  saveMsgType = "info";
  initSubs: any;

  constructor( @Inject(DashboardService) protected dashboardService: DashboardService,  protected recordsService: RecordsService, @Inject(DOCUMENT) protected document: any, protected elementRef: ElementRef, public translationService:TranslationService ) {
    super();
    this.setLoading(true);
    this.initTranslator(this.translationService);
  }

  ngOnInit() {
    this.branding = this.elementRef.nativeElement.getAttribute('branding');
    this.portal = this.elementRef.nativeElement.getAttribute('portal');
    this.packageType = this.elementRef.nativeElement.getAttribute('packageType');
    this.initSubs = this.dashboardService.waitForInit((initStat:boolean) => {
      this.initSubs.unsubscribe();
      this.translationService.isReady(tService => {
        this.typeColLabel = this.getTranslated(`workspaces-type-column`, "Type");
        this.recordColLabel = this.getTranslated(`workspaces-title-column`, "Workspace");
        this.linkColLlabel = this.getTranslated(`workspaces-link-column`, "Link");
        this.rdmpColLabel = this.getTranslated(`workspaces-rdmp-column`, "RDMP");
        this.dashboardService.getRecords(null,null,1,this.packageType).then((stagedRecords: PlanTable) => {
          this.setDashboardTitle(stagedRecords);
          this.records = stagedRecords;
          this.checkIfHasLoaded();
        });

      });
    });
  }

  protected setDashboardTitle(planTable: PlanTable) {
    _.forEach(planTable.items, (plan: Plan) => {
      plan.dashboardTitle = (_.isUndefined(plan.title) || _.isEmpty(plan.title) || _.isEmpty(plan.title[0])) ? this.translationService.t('plan-with-no-title'): plan.title;
    });
  }

  public hasLoaded() {
    return this.translatorReady && !_.isEmpty(this.records);
  }

  public pageChanged(event:any):void {
    this.dashboardService.getRecords(null,null,event.page,this.packageType).then((stagedRecords: PlanTable) => {
      this.setDashboardTitle(stagedRecords);
      this.records = stagedRecords;
    });
  }


  getTranslated(key, defValue) {
    if (!_.isEmpty(key) && !_.isUndefined(key)) {
      if (_.isFunction(key.startsWith)) {
        let translatedValue = this.translationService.t(key);
        if(translatedValue == key) {
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

}
