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
import { DOCUMENT } from '@angular/platform-browser';
import { Component, Injectable, Inject, ApplicationRef, ElementRef } from '@angular/core';
import { FormArray, FormGroup, FormControl, Validators } from '@angular/forms';
import { DashboardService } from './shared/dashboard-service';
import * as _ from "lodash-es";
import { LoadableComponent } from './shared/loadable.component';
import { TranslationService } from './shared/translation-service';
import { PlanTable, Plan } from './shared/dashboard-models';
import { VocabField, VocabFieldComponent, VocabFieldLookupService } from './shared/form/field-vocab.component';
import { CompleterService } from 'ng2-completer';
import { RecordsService } from './shared/form/records.service';
import { EmailNotificationService } from './shared/email-service';
import { UserSimpleService } from './shared/user.service-simple';
import { User,Role } from './shared/user-models';

declare var pageData: any;
declare var jQuery: any;
/**
 * Manage Roles component
 *
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 */
@Component({
  moduleId: module.id,
  selector: 'transfer-owner',
  templateUrl: './transfer_owner.html'
})
export class TransferOwnerComponent extends LoadableComponent {
  plans: PlanTable;
  initSubs: any;
  searchFilterName: any;
  searchFilterRoles: any;
  filteredPlans: Plan[];
  userLookupMeta: VocabField;
  formGroup: FormGroup;
  saveMsg: string;
  saveMsgType: string;
  recordType: string;
  transferConfig: object;
  fieldsForUpdate: any;
  fieldForUpdate: string;
  user: User;

  constructor( @Inject(DashboardService) protected dashboardService: DashboardService,
    public translationService: TranslationService,
    protected emailService: EmailNotificationService,
    @Inject(VocabFieldLookupService) private vocabFieldLookupService,
    @Inject(CompleterService) private completerService: CompleterService,
    @Inject(RecordsService) private recordService: RecordsService,
    @Inject(UserSimpleService) protected userService: UserSimpleService,
    private app: ApplicationRef, @Inject(DOCUMENT) protected document: any, elementRef: ElementRef, ) {
    super();
    this.initTranslator(translationService);
    this.recordType = elementRef.nativeElement.getAttribute('type');
    this.fieldsForUpdate = [];
    this.plans = new PlanTable();

    this.initSubs = dashboardService.waitForInit((initStat: boolean) => {
      this.initSubs.unsubscribe();

      this.loadTransferConfig().then(config => {
        this.transferConfig = config;

        for (var key in this.transferConfig["fields"]) {
          var config = this.transferConfig["fields"][key];
          config.key = key;
          this.fieldsForUpdate.push(config);
        }
        this.fieldForUpdate = this.fieldsForUpdate[0].key;
      });

      this.loadPlans();
    });
    userService.waitForInit((initStat: boolean) => { userService.getInfo().then(
      user =>
      this.user = user);
    });
  }

  protected loadTransferConfig() {
    return this.recordService.getTransferResponsibility(this.recordType);
  }

  protected loadPlans(transferredRecords: any[] = null) {
    this.translationService.isReady(tService => {
      this.dashboardService.getAllRecordsCanEdit('rdmp,dataRecord','draft').then((draftPlans: PlanTable) => {
        this.dashboardService.setDashboardTitle(draftPlans);
        // skip transferred records...
        _.remove(draftPlans.items, (item: any) => {
          return _.find(transferredRecords, (rec: any) => {
            return rec.oid == item.oid;
          });
        });
        draftPlans.noItems = draftPlans.items.length;
        this.plans = draftPlans;
        this.filteredPlans = this.plans.items;
        if (!this.userLookupMeta) {
          this.initUserlookup();
        }
        this.saveMsg = "";
        this.saveMsgType = "";
        this.setLoading(false);
        this.onFilterChange();
      });
    });
  }

  protected initUserlookup() {
    // create meta object for vocab
    const userLookupOptions = {
      sourceType: 'mint',
      fieldNames: ['text_full_name', 'storage_id', 'Email'],
      searchFields: 'text_full_name',
      titleFieldArr: ['text_full_name'],
      vocabId: 'Parties AND repository_name:People',
      editMode: true,
      placeHolder: this.translationService.t('transfer-ownership-researcher-name')
    };
    this.userLookupMeta = new VocabField(userLookupOptions, this.app['_injector']);
    this.userLookupMeta.completerService = this.completerService;
    this.userLookupMeta.lookupService = this.vocabFieldLookupService;
    this.userLookupMeta.createFormModel();
    this.userLookupMeta.initLookupData();
    this.formGroup = new FormGroup({ researcher_name: this.userLookupMeta.formModel });

  }

  onFilterChange() {


    this.filteredPlans = _.filter(this.plans.items, (plan: any) => {
      plan.selected = false;
      console.log(plan)
      if (this.hasPermissions(plan)) {
        return _.toLower(plan.dashboardTitle).includes(_.toLower(this.searchFilterName));
      }
      return false;
    });

  }

  hasPermissions(plan) {
    var allowedToEdit = this.transferConfig["canEdit"][this.fieldForUpdate];
    var canEdit = false;
    let roles:Role[] = this.user.roles;

    roles = _.filter(roles, (role:Role) => plan.metadata.authorization.editRoles.indexOf(role.name) != -1);

    if(roles.length > 0) {
      return true;
    }

    var userEmail = this.user.email;

    _.each(allowedToEdit, projectRole => {

      var fieldName = this.transferConfig["fields"][projectRole].fieldNames.email;
      if (_.some(plan.metadata[fieldName]) && plan.metadata[fieldName][0] == userEmail) {
        canEdit = true;
      }
    });

    return canEdit;
  }

  resetFilter() {
    this.searchFilterName = null;
    this.onFilterChange();
  }

  toggleSelect(plan: any, event: any) {
    if (event.target.type !== 'checkbox') {
      plan.selected = !plan.selected;
    }
  }

  transferOwnership(event: any) {
    const records = [];
    const recordMeta = [];
    _.forEach(this.filteredPlans, (plan: any) => {
      if (plan.selected) {
        records.push(plan);
        var record = {}
        var title = plan.dashboardTitle;
        record['url'] = this.emailService.getBrandingAndPortalUrl + "/record/view/" + plan.oid;
        record['title'] = title.toString();
        recordMeta.push(record);
      }
    });
    console.log(this.formGroup);
    const name = this.getSelResearcher()['text_full_name'];
    const email = this.getSelResearcher()['Email'];

    this.saveMsg = `${this.translationService.t('transfer-ownership-transferring')}${this.spinnerElem}`;
    this.saveMsgType = "info";
    this.clearSelResearcher();
    this.recordService.updateResponsibilities(records, this.fieldForUpdate, email, name).then((res: any) => {
      this.saveMsg = this.translationService.t('transfer-ownership-transfer-ok');
      this.saveMsgType = "success";

      // ownership transfer ok, send notification email
      // if (email) { // email address isn't a required property for the user model!
      //   var data = {};
      //   data['name'] = name;
      //   data['records'] = recordMeta;
      //   this.emailService.sendNotification(email, 'transferOwnerTo', data)
      //     .then(function(res) { console.log(`Email result: ${JSON.stringify(res)}`) }); // what should we do with this?
      // }

      this.setLoading(true);
      this.loadPlans(records);
      this.resetFilter();
    }).catch((err: any) => {
      this.saveMsg = err;
      this.saveMsgType = "danger";
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
