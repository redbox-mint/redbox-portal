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
import * as _ from "lodash";
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
  selectAllChecked: boolean;

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

    this.translationService.isReady(tService => {
      this.waitForInit([
        dashboardService,
        recordService,
        userService
      ], () => {

        if (!this.transferConfig) {
          this.loadTransferConfig().then(config => {
            this.transferConfig = config;

            for (var key in this.transferConfig["fields"]) {
              var config = this.transferConfig["fields"][key];
              config.key = key;
              this.fieldsForUpdate.push(config);
            }
            this.fieldForUpdate = this.fieldsForUpdate[0].key;
            if (_.isUndefined(this.userLookupMeta) || _.isNull(this.userLookupMeta)) {
              this.initUserlookup();
            }
            this.loadPlans();
            userService.getInfo().then(
              user =>
              this.user = user);
          });
        }

      });
    });
  }

  protected loadTransferConfig() {
    return this.recordService.getTransferResponsibility(this.recordType);
  }

  public selectAllLocations(checked){
    _.each(this.filteredPlans, (plan:any) => {
      plan.selected = checked;
    });
  }

  protected loadPlans(transferredRecords: any[] = null) {
    this.setLoading(true);
    this.translationService.isReady(tService => {
      this.dashboardService.getAllRecordsCanEdit('rdmp,dataRecord','draft').then((draftPlans: PlanTable) => {
        this.dashboardService.setDashboardTitle(draftPlans);
        draftPlans.noItems = draftPlans.items.length;
        this.plans = draftPlans;
        this.filteredPlans = this.plans.items;
        this.saveMsg = "";
        this.saveMsgType = "";
        this.setLoading(false);
        this.resetFilter();
        this.clearSelResearcher();
      });
    });
  }

  protected initUserlookup() {
    // create meta object for vocab
    const userLookupOptions = {
      name: 'userlookup',
      sourceType: 'mint',
      fieldNames: ['text_full_name', 'storage_id', {'email': 'Email[0]'}, {'full_name_honorific': 'text_full_name_honorific'}, {'given_name': 'text_given_name'}, {'family_name': 'text_family_name'}, {'honorific': 'Honorific[0]'}, {'full_name_family_name_first': 'dc_title'}, {'username': 'username'} ],
      searchFields: 'text_full_name',
      titleFieldArr: ['text_full_name'],
      titleCompleterDescription: 'Email',
      vocabId: 'Parties AND repository_name:People',
      editMode: true,
      placeHolder: this.translationService.t('transfer-ownership-researcher-name'),
      restrictToSelection: true
    };
    this.userLookupMeta = new VocabField(userLookupOptions, this.app['_injector']);
    this.userLookupMeta.completerService = this.completerService;
    this.userLookupMeta.lookupService = this.vocabFieldLookupService;
    this.userLookupMeta.createFormModel();
    this.userLookupMeta.initLookupData();
    this.formGroup = new FormGroup({ researcher_name: this.userLookupMeta.formModel });

  }

  onFilterChange() {

    this.selectAllChecked = false;

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
      const fieldSource = !_.isUndefined(this.transferConfig["fields"][projectRole].updateField)? `${ this.transferConfig["fields"][projectRole].updateField }.email` : `${this.transferConfig["fields"][projectRole].fieldNames.email}`;
      const fieldVal = _.get(plan.metadata.metadata, fieldSource);
      if (fieldVal == userEmail) {
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
    this.selectAllChecked = false;
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
    const selectedUser = this.getSelResearcher();

    this.saveMsg = `${this.translationService.t('transfer-ownership-transferring')}${this.spinnerElem}`;
    this.saveMsgType = "info";
    this.recordService.updateResponsibilities(records, this.fieldForUpdate, selectedUser).then((res: any) => {
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
      this.loadPlans(records);
    }).catch((err: any) => {
      this.saveMsg = err;
      this.saveMsgType = "danger";
    });
    jQuery('#myModal').modal('hide');
  }

  getSelResearcher() {
    return (this.userLookupMeta && this.userLookupMeta.formModel) ? this.userLookupMeta.formModel.value : null;
  }

  clearSelResearcher() {
    this.userLookupMeta.setEmptyValue(true);
    this.formGroup.setValue({researcher_name: null}, {emitEvent: true});
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
