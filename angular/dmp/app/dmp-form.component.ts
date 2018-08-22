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

import { Component, Inject, Input, ElementRef, EventEmitter, Output, ChangeDetectorRef } from '@angular/core';
import { Location, LocationStrategy, PathLocationStrategy } from '@angular/common';
import { FormGroup } from '@angular/forms';
import { RecordsService } from './shared/form/records.service';
import { LoadableComponent } from './shared/loadable.component';
import { FieldControlService } from './shared/form/field-control.service';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/zip';
import * as _ from "lodash";
import { TranslationService } from './shared/translation-service';

// STEST-22
declare var jQuery: any;

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
   * Links to tabs
   */
  failedValidationLinks: any[];

  finishedRendering:boolean;

  @Output() recordCreated: EventEmitter<any> = new EventEmitter<any>();
  @Output() recordSaved: EventEmitter<any> = new EventEmitter<any>();
  @Output() onBeforeSave: EventEmitter<any> = new EventEmitter<any>();
  @Output() onFormLoaded: EventEmitter<any> = new EventEmitter<any>();
  @Output() onValueChange: EventEmitter<any> = new EventEmitter<any>();

  subs = {
    recordCreated: {},
    recordSaved: {},
    onBeforeSave: {},
    onFormLoaded: {},
    onValueChange: {}
  };

  private relatedRecordId: any = null;
  /**
   * Expects a number of DI'ed elements.
   */
  constructor(
    elm: ElementRef,
    @Inject(RecordsService) protected RecordsService: RecordsService,
    @Inject(FieldControlService) protected fcs: FieldControlService,
    @Inject(Location) protected LocationService: Location,
    public translationService: TranslationService,
    private changeRef: ChangeDetectorRef
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
            if (_.isEmpty(this.recordType)) {
              this.recordType = this.formDef.type;
            }
            if (form.fieldsMeta) {
              this.fields = form.fieldsMeta;
              this.rebuildForm();
              let asyncLoadObservables = []
              for( var key in this.fieldMap) {
                if(this.fieldMap[key]['field']) {
                  asyncLoadObservables.push(this.fieldMap[key]['field'].asyncLoadData());
                }
              }
              Observable.zip(...asyncLoadObservables).subscribe( result => {
                this.watchForChanges();
              });
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
   * @param  {string     =             null}  targetStep
   * @param  {boolean=false} forceValidate
   * @return {[type]}
   */
  onSubmit(targetStep:string = null, forceValidate:boolean=false, additionalData: any = null) {
    this.onBeforeSave.emit({oid: this.oid});
    if (!this.isValid(forceValidate)) {
      return Observable.of(false);
    }
    this.setSaving(this.getMessage(this.formDef.messages.saving));
    let values = this.formatValues(this.form.value);
    if (!_.isEmpty(additionalData) && !_.isNull(additionalData)) {
      _.assign(values, additionalData);
    }
    this.payLoad = JSON.stringify(values);
    console.log("Saving the following values:");
    console.log(this.payLoad);
    this.needsSave = false;
    if (_.isEmpty(this.oid)) {
      return this.RecordsService.create(this.payLoad, this.recordType, targetStep).flatMap((res:any)=>{
        this.clearSaving();
        console.log("Create Response:");
        console.log(res);
        if (res.success) {
          this.oid = res.oid;
          this.recordCreated.emit({oid: this.oid});
          this.LocationService.go(`record/edit/${this.oid}`);
          this.setSuccess(this.getMessage(this.formDef.messages.saveSuccess));
          return Observable.of(true);
        } else {
          this.setError(`${this.getMessage(this.formDef.messages.saveError)} ${res.message}`);
          return Observable.of(false);
        }
      }).catch((err:any)=>{
        this.setError(`${this.getMessage(this.formDef.messages.saveError)} ${err.message}`);
        return Observable.of(false);
      });
    } else {
      return this.RecordsService.update(this.oid, this.payLoad, targetStep).flatMap((res:any)=>{
        this.clearSaving();
        console.log("Update Response:");
        console.log(res);
        if (res.success) {
          this.recordSaved.emit({oid: this.oid, success:true});
          this.setSuccess(this.getMessage(this.formDef.messages.saveSuccess));
          return Observable.of(true);
        } else {
          this.recordSaved.emit({oid: this.oid, success:false});
          this.setError(`${this.getMessage(this.formDef.messages.saveError)} ${res.message}`);
          return Observable.of(false);
        }
      }).catch((err:any)=>{
        this.recordSaved.emit({oid: this.oid, success:false});
        this.setError(`${this.getMessage(this.formDef.messages.saveError)} ${err}`);
        return Observable.of(false);
      });
    }
  }

  delete() {
    this.setSaving(this.getMessage(this.formDef.messages.saving));
    return this.RecordsService.delete(this.oid)
    .flatMap((res:any)=>{
      this.clearSaving();
      console.log("Delete Response:");
      console.log(res);
      if (res.success) {
        this.setSuccess(this.getMessage(this.formDef.messages.saveSuccess));
        return Observable.of(true);
      } else {
        this.setError(`${this.getMessage(this.formDef.messages.saveError)} ${res.message}`);
        return Observable.of(false);
      }
    }).catch((err:any)=>{
      this.setError(`${this.getMessage(this.formDef.messages.saveError)} ${err}`);
      return Observable.of(false);
    });
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
        this.onValueChange.emit(data);
      });
    }
    this.onFormLoaded.emit({oid:this.oid});
  }
  /**
   * Trigger form validation
   *
   * @return {[type]}
   */
  triggerValidation(fieldMap=null) {
    if (_.isNull(fieldMap)) {
      fieldMap = this.fieldMap;
    }
    this.failedValidationLinks = [];
    _.forOwn(fieldMap, (fieldEntry:any, fieldName:string) => {
      if (!_.isEmpty(fieldName) && !_.startsWith(fieldName, '_')) {
        if (!_.isUndefined(fieldEntry.field) && !_.isNull(fieldEntry.field)) {
          fieldEntry.field.triggerValidation();
        } else {
          if (!_.isUndefined(fieldEntry.members) && !_.isNull(fieldEntry.members)) {
            this.triggerValidation(fieldEntry.members);
          }
        }
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
      // STEST-22
      this.setError(this.getMessage(this.formDef.messages.validationFail));
      this.generateFailedValidationLinks();
      return false;
    }
    return true;
  }

  // STEST-22
  generateFailedValidationLinks() {
    let label = null;
    _.forOwn(this.form.controls, (ctrl, ctrlName) => {
      if (ctrl.invalid) {
        label = this.fieldMap[ctrlName].field ? this.fieldMap[ctrlName].field.label : this.fieldMap[ctrlName].instance.field.label;
        label = this.failedValidationLinks.length > 0 ? `, ${label}` : label;
        this.failedValidationLinks.push({
          label: label,
          parentId: this.fieldMap[ctrlName].instance.parentId
        });

      }
    });
  }

  gotoTab(tabId) {
    jQuery(`[href=#${tabId}]`).tab('show');
    jQuery("html, body").animate({
      scrollTop: 0
    }, 500);
  }

  getMessage(messageKeyArr: any):string {
    let message: string = '';
    _.each(messageKeyArr, (msgKey) => {
      if (_.startsWith(msgKey, '@')) {
        message = `${message}${this.translationService.t(msgKey)}`;
      }
    });
    return message;
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
      if (!_.isUndefined(this.fieldMap[key].members)) {
        _.each(this.fieldMap[key].members, (member)=>{
          if (_.isFunction(member.instance.formatValue)) {
            const newVal = member.instance.formatValue(formVals[key]);
            formVals[key] = newVal;
          }
        });
      } else {
        if (!_.isUndefined(this.fieldMap[key].instance)) {
          if (_.isFunction(this.fieldMap[key].instance.formatValue)) {
            const newVal = this.fieldMap[key].instance.formatValue(formVals[key]);
            formVals[key] = newVal;
          }
        }
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
    window.location.href = this.RecordsService.getDashboardUrl(this.recordType);
  }
  /**
   * Form cancellation handler.
   *
   * @return {[type]}
   */
  onCancel() {
    this.gotoDashboard();
  }

  subscribe(eventName, subscriberName, fn) {
    if (this.subs[eventName][subscriberName]) {
      return this.subs[eventName][subscriberName];
    }
    this.subs[eventName][subscriberName] = this[eventName].subscribe(fn);
    console.log(this.subs);
  }

  getSubscription(eventName, subscriberName) {
    return this.subs[eventName][subscriberName];
  }

  getFieldWithId(fieldId, fields:any = this.fields) {
    let field = _.find(fields, (f) => {
      return f.id == fieldId;
    });
    if (_.isUndefined(field) && !_.isEmpty(fields.fields)) {
      field = this.getFieldWithId(fieldId, fields.fields);
    }
    return field;
  }

  getFieldValue(fieldName) {
    return this.form.value[fieldName];
  }

  triggerChangeDetection() {
    this.changeRef.detectChanges();
  }

  setRelatedRecordId(oid) {
    this.relatedRecordId = oid;
    this.triggerChangeDetection();
  }
}
