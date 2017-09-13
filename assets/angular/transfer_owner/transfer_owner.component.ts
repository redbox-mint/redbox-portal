// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

import { Component, Injectable, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/platform-browser';
import { FormArray, FormGroup, FormControl, Validators, FormBuilder } from '@angular/forms';
import { DashboardService } from '../shared/dashboard-service';
import { UserSimpleService } from '../shared/user.service-simple';
import { RolesService } from '../shared/roles-service';
import { Role, User, LoginResult, SaveResult } from '../shared/user-models';
import * as _ from "lodash-lib";
import { LoadableComponent } from '../shared/loadable.component';
import { TranslationService } from '../shared/translation-service';
import { PlanTable, Plan } from '../shared/dashboard-models';
import { VocabField, VocabFieldComponent, VocabFieldLookupService } from '../shared/form/field-vocab.component';
import { CompleterService } from 'ng2-completer';
import { RecordsService } from '../shared/form/records.service';

declare var pageData :any;
declare var jQuery: any;
/**
 * Manage Roles component
 *
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 */
@Component({
  moduleId: module.id,
  selector: 'transfer-owner',
  templateUrl: './transfer_owner.html'
})

// TODO: find a way to remove jQuery dependency
@Injectable()
export class TransferOwnerComponent extends LoadableComponent {
  plans: PlanTable;
  initSubs: any;
  searchFilterName: any;
  filteredPlans: Plan[];
  userLookupMeta: VocabField;
  formGroup: FormGroup;
  saveMsg: string;
  saveMsgType: string;

  constructor(@Inject(DashboardService) protected dashboardService: DashboardService,
   @Inject(FormBuilder) fb: FormBuilder,
   @Inject(DOCUMENT) protected document:any,
   public translationService:TranslationService,
   @Inject(VocabFieldLookupService) private vocabFieldLookupService,
   @Inject(CompleterService) private completerService: CompleterService,
   @Inject(RecordsService) private recordService: RecordsService) {
    super();
    this.initTranslator(translationService);
    this.plans = new PlanTable();
    this.initSubs = dashboardService.waitForInit((initStat:boolean) => {
      this.initSubs.unsubscribe();
      this.loadPlans();
    });
  }

  protected loadPlans() {
    this.translationService.isReady(tService => {
      this.dashboardService.getAlllDraftPlansCanEdit().then((draftPlans: PlanTable) => {
        this.setDashboardTitle(draftPlans);
        this.plans = draftPlans;
        this.filteredPlans = this.plans.items;
        if (!this.userLookupMeta) {
          this.initUserlookup();
        }
        this.saveMsg = "";
        this.saveMsgType = "";
        this.setLoading(false);
      });
    });
  }

  protected initUserlookup() {
    // create meta object for vocab
    const userLookupOptions = {
      sourceType: 'user',
      fieldNames: ['name', 'id', 'username'],
      searchFields: 'name',
      titleFieldArr: ['name'],
      editMode: true,
      placeHolder: this.translationService.t('transfer-ownership-researcher-name')
    };
    this.userLookupMeta = new VocabField(userLookupOptions);
    this.userLookupMeta.completerService = this.completerService;
    this.userLookupMeta.lookupService = this.vocabFieldLookupService;
    this.userLookupMeta.createFormModel();
    this.userLookupMeta.initLookupData();
    this.formGroup = new FormGroup({researcher_name: this.userLookupMeta.formModel});
  }

  protected setDashboardTitle(planTable: PlanTable) {
    _.forEach(planTable.items, (plan: Plan) => {
      plan.dashboardTitle = (_.isUndefined(plan.title) || _.isEmpty(plan.title) || _.isEmpty(plan.title[0])) ? this.translationService.t('plan-with-no-title'): plan.title;
    });
  }

  onFilterChange() {
    if (this.searchFilterName) {
      this.filteredPlans = _.filter(this.plans.items, (plan: any)=> {
        plan.selected = false;
        return _.startsWith(_.toLower(plan.dashboardTitle), _.toLower(this.searchFilterName));
      });
    } else {
      this.filteredPlans = this.plans.items;
    }
  }

  resetFilter() {
    this.searchFilterName = null;
    this.onFilterChange();
  }

  toggleSelect(plan: any) {
    plan.selected = !plan.selected;
  }

  transferOwnership(event: any) {
    const records = [];
    _.forEach(this.filteredPlans, (plan: any) => {
      if (plan.selected) {
        records.push(plan);
      }
    });
    const username = this.getSelResearcher()['username'];
    this.saveMsg = this.translationService.t('transfer-ownership-transferring');
    this.saveMsgType = "info";
    this.clearSelResearcher();
    this.recordService.modifyEditors(records, username).then((res:any)=>{
      this.saveMsg = this.translationService.t('transfer-ownership-transfer-ok');
      this.saveMsgType = "success";
      this.setLoading(true);
      this.loadPlans();
    }).catch((err:any)=>{
      this.saveMsg = err;
      this.saveMsgType = "error";
    });
    jQuery('#myModal').modal('hide');
  }

  getSelResearcher() {
    return this.formGroup.value.researcher_name;
  }

  clearSelResearcher() {
    this.formGroup.value.researcher_name = "";
  }

  canTransfer() {
    let hasSelectedPlan = false;
    _.forEach(this.filteredPlans, (plan: any) => {
      if (plan.selected) {
        hasSelectedPlan = true;
        return false;
      }
    });
    return hasSelectedPlan && this.getSelResearcher();
  }
}
