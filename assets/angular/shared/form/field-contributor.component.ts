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

import { Input, Component, OnInit} from '@angular/core';
import { SimpleComponent } from './field-simple.component';
import { FieldBase } from './field-base';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import * as _ from "lodash-lib";
import { RbValidator } from './validators';
import { VocabField } from './field-vocab.component';
/**
 * Contributor Model
 *
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
export class ContributorField extends FieldBase<any> {
  nameColHdr: string;
  emailColHdr: string;
  roleColHdr: string;
  showHeader: boolean;
  roles: string[];

  groupFieldNames: string[];
  validators: any;
  enabledValidators: boolean;
  marginTop: string;
  freeText: boolean;
  role: string;
  // Frankenstein begin
  vocabField: VocabField;
  // Frankenstein end

  constructor(options: any, translationService: any) {
    super(options, translationService);
    this.controlType = 'textbox';
    this.nameColHdr = options['nameColHdr'] ? this.getTranslated(options['nameColHdr'], options['nameColHdr']) : 'Researcher Name';
    this.emailColHdr = options['emailColHdr'] ? this.getTranslated(options['emailColHdr'], options['emailColHdr']) : 'Email Address';
    this.roleColHdr = options['roleColHdr'] ? this.getTranslated(options['roleColHdr'], options['roleColHdr']) : 'Project Role';

    this.showHeader = options['showHeader'] || true;
    this.roles = options['roles'] || [];
    this.value = options['value'] || this.setEmptyValue();
    this.validationMessages = options['validationMessages'] || {required: {
      email: this.getTranslated(options['validation_required_email'], 'Email required'),
      text_full_name: this.getTranslated(options['validation_required_name'], 'Name is required'),
      role: this.getTranslated(options['validation_required_role'],'Select a role')},
      invalid: { email: this.getTranslated(options['validation_invalid_email'], 'Email format is incorrect')}};
    this.groupFieldNames = ['text_full_name', 'email', 'role'];
    this.freeText = options['freeText'] || false;
    this.role = options['role'] ? this.getTranslated(options['role'], options['role']) : null;

    this.validators = {
      text_full_name: [Validators.required],
      email: [Validators.required, Validators.email],
      role: [Validators.required]
    };
    if (!this.freeText) {
      this.vocabField = new VocabField(this.options, this.translationService);
      this.hasLookup = true;
    }
  }

  setLookupServices(completerService:any, lookupService:any) {
    if (!this.freeText) {
      this.vocabField.setLookupServices(completerService, lookupService);
    }
  }

  createFormModel(valueElem: any = undefined): any {
    if (valueElem) {
      this.value = valueElem;
    }
    if (!this.freeText) {
      this.formModel = this.vocabField.createFormModel(valueElem);
      return this.formModel;
    }

    this.formModel = new FormGroup({text_full_name: new FormControl(this.value.text_full_name || null),
                                 email: new FormControl(this.value.email || null),
                                 role: new FormControl(this.value.role || null)});
    this.enableValidators();
    return this.formModel;
  }

  toggleValidator(c:any) {
    return (value:any) => {
      if (value || _.find(this.formModel.controls, (c:any) => { return c.value })) {
        this.enableValidators();
      } else {
        this.disableValidators();
      }
    };
  }

  enableValidators() {
    if (this.enabledValidators) {
      return;
    }
    this.enabledValidators = true;
    _.forEach(this.groupFieldNames, (f:any) => {
      this.formModel.controls[f].setValidators(this.validators[f]);
    });
  }

  disableValidators() {
    if (!this.enabledValidators) {
      return;
    }
    this.enabledValidators = false;
    _.forEach(this.formModel.controls, (c:any) => {
      c.setValidators(null);
      c.setErrors(null);
    });
  }

  postInit(value:any) {
    if (value) {
      this.value = value;
      if (!this.freeText) {
        this.vocabField.value = value;
        this.vocabField.initialValue = _.cloneDeep(value);
        this.vocabField.initialValue.title = this.vocabField.getTitle(value);
        this.vocabField.initLookupData();
      }
    } else {
      this.setEmptyValue();
    }
  }

  setEmptyValue() {
    this.value = {name: null, email: null, role: null};
    return this.value;
  }

  get isValid() {
    let validity = false;
    _.forEach(this.groupFieldNames, (f:any) => {
      validity = validity && this.formModel.controls[f].valid;
    });
    return validity;
  }

  public triggerValidation(): void {
    _.forEach(this.groupFieldNames, (f:any) => {
      this.formModel.controls[f].updateValueAndValidity();
      this.formModel.controls[f].markAsTouched();
    });
  }

  public getValidationError(): any {
    let errObj = null;
    if (this.formModel) {
      _.forEach(this.groupFieldNames, (f:any) => {
        if (!_.isEmpty(this.formModel.controls[f].errors)) {
          errObj = this.formModel.controls[f].errors;
        }
      });
    }
    return errObj;
  }
}

@Component({
  selector: 'rb-contributor',
  template: `
  <div *ngIf="field.editMode" class='padding-bottom-10'>
    <div class="row" *ngIf="field.label && field.showHeader">
      <div class="col-xs-4"><h5>{{field.label}} {{getRequiredLabelStr()}}</h5></div>
    </div>
    <div class="row">
      <ng-container *ngIf="field.freeText" [formGroup]='field.formModel'>
        <!-- Free Text version -->
        <!--
        <ng-container >
          <div [ngClass]="getGroupClass('name')">
            <input formControlName="name" type="text" class="form-control"/>
            <div class="text-danger" *ngIf="field.formModel.controls['name'].touched && field.formModel.controls['name'].hasError('required')">{{field.validationMessages.required.name}}</div>
          </div>
          <div [ngClass]="getGroupClass('email')">
            <input formControlName="email" type="text" class="form-control" />
            <div class="text-danger" *ngIf="field.formModel.controls['email'].touched && field.formModel.controls['email'].hasError('email')">{{field.validationMessages.invalid.email}}</div>
            <div class="text-danger" *ngIf="field.formModel.controls['email'].touched && field.formModel.controls['email'].hasError('required')">{{field.validationMessages.required.email}}</div>
          </div>
        </ng-container>  -->

        <div *ngIf="!isEmbedded">
          <div class="row">
            <span class='col-xs-10' >
              <!-- Lookup version -->
              <div class='col-xs-1'>
                <span class='text-right'>{{ field.nameColHdr }}</span>
              </div>
              <div [ngClass]="getGroupClass('text_full_name')">
                <input formControlName="text_full_name" type="text" class="form-control"/>
                <div class="text-danger" *ngIf="field.formModel.controls['text_full_name'].touched && field.formModel.controls['text_full_name'].hasError('required')">{{field.validationMessages.required.text_full_name}}</div>
              </div>
              <div class='col-xs-1'>
                <span class='text-right'>{{ field.emailColHdr }}</span>
              </div>
              <div [ngClass]="getGroupClass('email')">
                <input formControlName="email" type="text" class="form-control" />
                <div class="text-danger" *ngIf="field.formModel.controls['email'].touched && field.formModel.controls['email'].hasError('email')">{{field.validationMessages.invalid.email}}</div>
                <div class="text-danger" *ngIf="field.formModel.controls['email'].touched && field.formModel.controls['email'].hasError('required')">{{field.validationMessages.required.email}}</div>
              </div>
            </span>
          </div>
        </div>

        <ng-container *ngIf="isEmbedded">
          <!-- Lookup version -->
          <div class='col-xs-1'>
            <span class='text-right'>{{ field.nameColHdr }}</span>
          </div>
          <div [ngClass]="getGroupClass('text_full_name')">
            <input formControlName="text_full_name" type="text" class="form-control"/>
            <div class="text-danger" *ngIf="field.formModel.controls['text_full_name'].touched && field.formModel.controls['text_full_name'].hasError('required')">{{field.validationMessages.required.text_full_name}}</div>
          </div>
          <div class='col-xs-1'>
            <span class='text-right'>{{ field.emailColHdr }}</span>
          </div>
          <div [ngClass]="getGroupClass('email')">
            <input formControlName="email" type="text" class="form-control" />
            <div class="text-danger" *ngIf="field.formModel.controls['email'].touched && field.formModel.controls['email'].hasError('email')">{{field.validationMessages.invalid.email}}</div>
            <div class="text-danger" *ngIf="field.formModel.controls['email'].touched && field.formModel.controls['email'].hasError('required')">{{field.validationMessages.required.email}}</div>
          </div>
        </ng-container>

      </ng-container>
      <ng-container *ngIf="!field.freeText" [formGroup]="field.formModel">
        <div *ngIf="!isEmbedded">
          <div class="row">
            <span class='col-xs-10' >
              <!-- Lookup version -->
              <div class='col-xs-1'>
                <span class='text-right'>{{ field.nameColHdr }}</span>
              </div>
              <div class='col-xs-5'>
                <ng2-completer [inputClass]="'form-control'" [placeholder]="field.vocabField.placeHolder" [clearUnselected]="true" (selected)="onSelect($event)" [datasource]="field.vocabField.dataService" [minSearchLength]="0" [initialValue]="field.vocabField.initialValue"></ng2-completer>
              </div>
              <div class='col-xs-1'>
                <span class='text-right'>{{ field.emailColHdr }}</span>
              </div>
              <div class='col-xs-5'>
                <input type='text' [ngClass]="'form-control'" [readonly]='true' [value]="field.formModel?.value?.email ? field.formModel?.value?.email : '' " />
              </div>
            </span>
          </div>
        </div>
        <ng-container *ngIf="isEmbedded">
          <!-- Lookup version -->
          <div class='col-xs-1'>
            <span class='text-right'>{{ field.nameColHdr }}</span>
          </div>
          <div class='col-xs-5'>
            <ng2-completer [inputClass]="'form-control'" [placeholder]="field.vocabField.placeHolder" [clearUnselected]="true" (selected)="onSelect($event)" [datasource]="field.vocabField.dataService" [minSearchLength]="0" [initialValue]="field.vocabField.initialValue"></ng2-completer>
          </div>
          <div class='col-xs-1'>
            <span class='text-right'>{{ field.emailColHdr }}</span>
          </div>
          <div class='col-xs-5'>
            <input type='text' [ngClass]="'form-control'" [readonly]='true' [value]="field.formModel?.value?.email ? field.formModel?.value?.email : '' " />
          </div>
        </ng-container>
      </ng-container>
    </div>
  </div>
  <div *ngIf="!field.editMode">
    <label *ngIf="field.label">{{field.label}}</label>
    <div class="row" *ngIf="field.showHeader">
      <div class="col-xs-4"><label>{{field.nameColHdr}}</label></div>
      <div class="col-xs-4"><label>{{field.emailColHdr}}</label></div>
      <div class="col-xs-4"><label>{{field.roleColHdr}}</label></div>
    </div>
    <div class="row">
      <div class="col-xs-4">{{field.value.text_full_name}}</div>
      <div class="col-xs-4">{{field.value.email}}</div>
      <div class="col-xs-4">{{field.value.role}}</div>
    </div>
  </div>
  `,
})
export class ContributorComponent extends SimpleComponent {
  field: ContributorField;
  @Input() isEmbedded: boolean = false;

  public getGroupClass(fldName:any): string {
    let hasError = false;
    hasError = hasError || (this.field.formModel.controls[fldName].touched && this.field.formModel.controls[fldName].hasError('required'));
    if (!hasError && fldName == 'email') {
      hasError = hasError || (this.field.formModel.controls[fldName].touched && this.field.formModel.controls[fldName].hasError('email'));
    }
    return `col-xs-5 form-group${hasError ? ' has-error' : ''}`;
  }

  onSelect(selected: any) {
    if (selected) {
      const val:any = this.field.vocabField.getValue(selected);
      val.role = this.field.role;
      this.field.formModel.setValue(val);
    } else {
      this.field.formModel.setValue(null);
    }
  }
}
