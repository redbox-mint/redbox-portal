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

import { Component, Inject, Input, ElementRef } from '@angular/core';
import { Location, LocationStrategy, PathLocationStrategy } from '@angular/common';
import { FormGroup } from '@angular/forms';
import { RecordsService } from '../shared/form/records.service';
import { LoadableComponent } from '../shared/loadable.component';
import { FieldControlService } from '../shared/form/field-control.service';
import * as _ from "lodash-lib";
import { TranslationService } from '../shared/translation-service';
/**
 * Main DMP Edit component
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
@Component({
  moduleId: module.id,
  selector: 'dmp-form',
  templateUrl: './dmp-form.html',
  providers: [Location, {provide: LocationStrategy, useClass: PathLocationStrategy}]
})
export class DmpFormComponent extends LoadableComponent {
  /**
   * The OID for this Form.
   *
   */
  @Input() oid: string;
  /**
   * Edit mode
   *
   */
  @Input() editMode: boolean;
  /**
   * The Record type
   *
   */
  @Input() recordType: string;
  /**
   * Fields for the form
   */
  fields: any[] = [];
  /**
   * Form group
   */
  form: FormGroup;
  /**
   * Initialization subscription
   */
  initSubs: any;
  /**
   * Field map
   */
  fieldMap: any;
  /**
   * Form JSON string
   */
  payLoad: any;
  /**
   * Form status
   */
  status: any;
  /**
   * Critical error message
   */
  criticalError: any;
  /**
   * Form definition
   */
  formDef: any;
  /**
   * CSS classes for this form
   */
  cssClasses: any;
  /**
   * Flag when form needs saving.
   *
   */
  needsSave: boolean;
  /**
   * Expects a number of DI'ed elements.
   */
  constructor(
    elm: ElementRef,
    @Inject(RecordsService) protected RecordsService: RecordsService,
    @Inject(FieldControlService) protected fcs: FieldControlService,
    @Inject(Location) protected LocationService: Location,
    translationService: TranslationService
  ) {
    super();
    this.status = {};
    this.initSubs = RecordsService.waitForInit((initStat:boolean) => {
      this.initSubs.unsubscribe();
      translationService.isReady(tService => {
        this.fieldMap = {_rootComp:this};
        this.oid = elm.nativeElement.getAttribute('oid');
        this.editMode = elm.nativeElement.getAttribute('editMode') == "true";
        this.recordType = elm.nativeElement.getAttribute('recordType');
        console.log(`Loading form with OID: ${this.oid}, on edit mode:${this.editMode}, Record Type: ${this.recordType}`);
        this.RecordsService.getForm(this.oid, this.recordType, this.editMode).then((obs:any) => {
          obs.subscribe((form:any) => {
            this.formDef = form;
            if (this.editMode) {
              this.cssClasses = this.formDef.editCssClasses;
            } else {
              this.cssClasses = this.formDef.viewCssClasses;
            }
            this.needsSave = false;
            if (form.fieldsMeta) {
              this.fields = form.fieldsMeta;
              this.rebuildForm();
              this.watchForChanges();
            }
          });
        }).catch((err:any) => {
          console.log("Error loading form...");
          console.log(err);
          if (err.status == false) {
              this.criticalError = err.message;
          }
          this.setLoading(false);
        });
      });
    });
  }
  /**
   * Main submit method.
   *
   * @param  {boolean    =             false} nextStep
   * @param  {string     =             null}  targetStep
   * @param  {boolean=false} forceValidate
   * @return {[type]}
   */
  onSubmit(nextStep:boolean = false, targetStep:string = null, forceValidate:boolean=false) {
    if (!this.isValid(forceValidate)) {
      return;
    }
    this.setSaving(this.formDef.messages.saving);
    const values = this.formatValues(this.form.value);
    this.payLoad = JSON.stringify(values);
    console.log("Saving the following values:");
    console.log(this.payLoad);
    this.needsSave = false;
    if (_.isEmpty(this.oid)) {
      this.RecordsService.create(this.payLoad).then((res:any)=>{
        this.clearSaving();
        console.log("Create Response:");
        console.log(res);
        if (res.success) {
          this.oid = res.oid;
          this.LocationService.go(`record/edit/${this.oid}`);
          this.setSuccess(this.formDef.messages.saveSuccess);
          if (nextStep) {
            this.stepTo(targetStep);
          }
        } else {
          this.setError(`${this.formDef.messages.saveError} ${res.message}`);
        }
      }).catch((err:any)=>{
        this.setError(`${this.formDef.messages.saveError} ${err.message}`);
      });
    } else {
      this.RecordsService.update(this.oid, this.payLoad).then((res:any)=>{
        this.clearSaving();
        console.log("Update Response:");
        console.log(res);
        if (res.success) {
          this.setSuccess(this.formDef.messages.saveSuccess);
        } else {
          this.setError(`${this.formDef.messages.saveError} ${res.message}`);
        }
      }).catch((err:any)=>{
        this.setError(`${this.formDef.messages.saveError} ${err}`);
      });
    }
  }

  /**
   * Sets the form message status.
   *
   * @param  {string} stat  Bootstrap contextual status: https://getbootstrap.com/docs/3.3/css/#helper-classes
   * @param  {string} msg Message
   * @return {[type]}
   */
  setStatus(stat:string, msg:string) {
    _.forOwn(this.status, (stat:string, key:string) => {
      this.status[key] = null;
    });
    this.status[stat] = {msg: msg};
  }

  /**
   * Clears status
   *
   * @param  {string} stat - Clears the status
   * @return {[type]}
   */
  clearStatus(stat:string) {
    this.status[stat] = null;
  }

  /**
   * Convenience wrapper to set saving status.
   *
   * @param  {string = 'Saving...'} msg
   * @return {[type]}
   */
  setSaving(msg:string = 'Saving...') {
    this.clearError();
    this.clearSuccess();
    this.setStatus('saving', msg);
  }
  /**
   * Convenience wrapper to clear saving status.
   *
   * @return {[type]}
   */
  clearSaving() {
    this.clearStatus('saving');
  }
  /**
   * Set a 'error' message.
   *
   * @param  {string} msg
   * @return {[type]}
   */
  setError(msg: string) {
    this.clearSaving();
    this.needsSave = true;
    this.setStatus('error', msg);
  }

  /**
   * Clear the error message.
   *
   * @return {[type]}
   */
  clearError() {
    this.clearStatus('error');
  }

  /**
   * Set a 'success' message.
   * @param  {string} msg
   * @return {[type]}
   */
  setSuccess(msg: string) {
    this.clearSaving();
    this.setStatus('success', msg);
  }
  /**
   * Clear the 'success' message.
   * @return {[type]}
   */
  clearSuccess() {
    this.clearStatus('success');
  }
  /**
   * Rebuild the form message.
   *
   * @return {[type]}
   */
  rebuildForm() {
    this.form = this.fcs.toFormGroup(this.fields, this.fieldMap);
  }
  /**
   * Enable form change monitor.
   *
   * @return {[type]}
   */
  watchForChanges() {
    this.setLoading(false);
    if (this.editMode) {
      this.form.valueChanges.subscribe((data:any) => {
        this.needsSave = true;
      });
    }
  }
  /**
   * Trigger form validation
   *
   * @return {[type]}
   */
  triggerValidation() {
    _.forOwn(this.fieldMap, (fieldEntry:any, fieldName:string) => {
      if (!_.isEmpty(fieldName) && !_.startsWith(fieldName, '_')) {
        fieldEntry.field.triggerValidation();
      }
    });
  }
  /**
   * Checks form validity.
   *
   * @param  {boolean=false} forceValidate
   * @return {[type]}
   */
  isValid(forceValidate:boolean=false) {
    if (this.formDef.skipValidationOnSave  && (_.isUndefined(forceValidate) || _.isNull(forceValidate) || !forceValidate)) {
      return true;
    }
    this.triggerValidation();
    if (!this.form.valid) {
      this.setError('There are issues in the form.');
      this.setError(this.formDef.messages.validationFail);
      return false;
    }
    return true;
  }
  /**
   * Submit the form towards a target step.
   *
   * @param  {string} targetStep
   * @return {[type]}
   */
  stepTo(targetStep: string) {
    console.log(this.form.value);
    if (!this.isValid(true)) {
      return;
    }
    this.needsSave = false;
    if (_.isEmpty(this.oid)) {
      this.onSubmit(true, targetStep, true);
    } else {
      this.setSaving(this.formDef.messages.saving);
      const values = this.formatValues(this.form.value);
      this.payLoad = JSON.stringify(values);
      console.log(this.payLoad);
      this.RecordsService.stepTo(this.oid, this.payLoad, targetStep).then((res:any) => {
        this.clearSaving();
        console.log("Update Response:");
        console.log(res);
        if (res.success) {
          this.setSuccess(this.formDef.messages.saveSuccess);
          this.gotoDashboard();
        } else {
          this.setError(`${this.formDef.messages.saveError} ${res.message}`);
        }
      }).catch((err:any)=>{
        this.setError(`${this.formDef.messages.saveError} ${err}`);
      });
    }
  }
  /**
   * Trigger form elements to format their values.
   *
   * @param  {any}    data
   * @return {[type]}
   */
  formatValues(data:any) {
    const formVals = _.cloneDeep(data);
    _.forOwn(formVals, (val:any, key:string) => {
      if (_.isFunction(this.fieldMap[key].instance.formatValue)) {
        const newVal = this.fieldMap[key].instance.formatValue(formVals[key]);
        formVals[key] = newVal;
      }
    });
    return formVals;
  }
  /**
   * Returns the saving status of the form.
   *
   * @return {[type]}
   */
  isSaving() {
    return this.status.saving;
  }
  /**
   * Redirect to dashboard.
   *
   * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
   * @return {[type]}
   */
  gotoDashboard() {
    window.location.href = this.RecordsService.getDashboardUrl();
  }
  /**
   * Form cancellation handler.
   *
   * @return {[type]}
   */
  onCancel() {
    this.gotoDashboard();
  }
}
