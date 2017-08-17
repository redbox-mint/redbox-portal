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
  

  constructor(options: any) {
    super(options);
    this.controlType = 'textbox';
    this.nameColHdr = options['nameColHdr'] || 'Researcher Name';
    this.emailColHdr = options['emailColHdr'] || 'Email Address';
    this.roleColHdr = options['roleColHdr'] || 'Project Role';
    this.showHeader = options['showHeader'] || true;
    this.roles = options['roles'] || [];
    this.value = options['value'] || this.setEmptyValue();
    this.validationMessages = options['validationMessages'] || {required: { email: 'Email required', name: 'Name is required', role: 'Select a role'}, invalid: { email: 'Email format is incorrect'}};
    this.groupFieldNames = ['name', 'email', 'role'];
    this.validators = {
      name: [Validators.required],
      email: [Validators.required, Validators.email],
      role: [Validators.required]
    };
  }

  createFormModel(valueElem: any = undefined): any {
    if (valueElem) {
      this.value = valueElem;
    }
    this.formModel = new FormGroup({name: new FormControl(this.value.name || null),
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
  };

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
  <div *ngIf="field.editMode" [formGroup]='field.formModel' >
    <div class="row" *ngIf="field.showHeader">
      <div class="col-xs-4"><label>{{field.nameColHdr}}</label></div>
      <div class="col-xs-4"><label>{{field.emailColHdr}}</label></div>
      <div class="col-xs-4"><label>{{field.roleColHdr}}</label></div>
    </div>
    <div class="row">
      <div [ngClass]="getGroupClass('name')">
        <input formControlName="name" type="text" class="form-control"/>
        <div class="text-danger" *ngIf="field.formModel.controls['name'].touched && field.formModel.controls['name'].hasError('required')">{{field.validationMessages.required.name}}</div>
      </div>
      <div [ngClass]="getGroupClass('email')">
        <input formControlName="email" type="text" class="form-control" />
        <div class="text-danger" *ngIf="field.formModel.controls['email'].touched && field.formModel.controls['email'].hasError('email')">{{field.validationMessages.invalid.email}}</div>
        <div class="text-danger" *ngIf="field.formModel.controls['email'].touched && field.formModel.controls['email'].hasError('required')">{{field.validationMessages.required.email}}</div>
      </div>
      <div [ngClass]="getGroupClass('role')">
        <select formControlName="role" class="form-control">
          <option *ngFor="let role of field.roles" [value]="role">{{role}}</option>
        </select>
        <div class="text-danger" *ngIf="field.formModel.controls['role'].touched && field.formModel.controls['role'].hasError('required')">{{field.validationMessages.required.role}}</div>
      </div>
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
      <div class="col-xs-4">{{field.value.name}}</div>
      <div class="col-xs-4">{{field.value.email}}</div>
      <div class="col-xs-4">{{field.value.role}}</div>
    </div>
  </div>
  `,
})
export class ContributorComponent extends SimpleComponent {
  public getGroupClass(fldName:any): string {
    let hasError = false;
    hasError = hasError || (this.field.formModel.controls[fldName].touched && this.field.formModel.controls[fldName].hasError('required'));
    if (!hasError && fldName == 'email') {
      hasError = hasError || (this.field.formModel.controls[fldName].touched && this.field.formModel.controls[fldName].hasError('email'));
    }
    return `col-xs-4 form-group${hasError ? ' has-error' : ''}`;
  }
}
