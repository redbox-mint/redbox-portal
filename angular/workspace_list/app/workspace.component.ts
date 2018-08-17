import { Component, Injectable, Inject, ElementRef, ApplicationRef} from '@angular/core';
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
import { RelatedObjectSelectorField } from './shared/form/field-relatedobjectselector.component';

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
  descriptionColLabel: string;
  createWorkspaceLabel: string;

  workflowSteps:any = [];
  records:any;
  saveMsgType = "info";
  initSubs: any;
  createMode: boolean;
  selectorField: RelatedObjectSelectorField;
  selectedRdmpUrl: string;
  nextButtonLabel: string;
  backButtonLabel: string;

  constructor( @Inject(DashboardService) protected dashboardService: DashboardService,  protected recordsService: RecordsService, @Inject(DOCUMENT) protected document: any, protected elementRef: ElementRef, public translationService:TranslationService,
protected app: ApplicationRef ) {
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
        this.descriptionColLabel = this.getTranslated(`workspaces-description-column`, "Description");
        this.recordColLabel = this.getTranslated(`workspaces-title-column`, "Name");
        this.linkColLlabel = this.getTranslated(`workspaces-link-column`, "Location");
        this.rdmpColLabel = this.getTranslated(`workspaces-rdmp-column`, "Plan");
        this.createWorkspaceLabel = this.getTranslated('create-workspace', "Create Workspace");
        this.nextButtonLabel = this.getTranslated('create-workspace-next', "Next");
        this.backButtonLabel = this.getTranslated('create-workspace-back', "Back");
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

  createWorkspace() {
    this.createMode = true;
    if (!this.selectorField) {
      this.selectorField = new RelatedObjectSelectorField(
        {
          label: this.getTranslated('create-workspace-selector-header', 'RDMP related to this workspace'),
          name: 'rdmp',
          recordType: 'rdmp',
          editMode: true
        },
        this.app['_injector']
      );
      this.selectorField.createFormModel();

      this.selectorField.relatedObjectSelected.subscribe((oid) => {
        this.selectedRdmpUrl = `${this.dashboardService.getBrandingAndPortalUrl}/record/edit/${oid}?focusTabId=workspaces`;
      });
      this.selectorField.resetSelectorEvent.subscribe(() => {
        this.selectedRdmpUrl = null;
      });
    }
  }

  cancelCreate() {
    this.createMode = false;
    this.selectorField = null;
    this.selectedRdmpUrl = null;
  }

  hasSelectedRdmp() {
    return !_.isEmpty(this.selectedRdmpUrl) && !_.isUndefined(this.selectedRdmpUrl);
  }

}
