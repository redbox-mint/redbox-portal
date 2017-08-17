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


import { FormControl, FormGroup, Validators } from '@angular/forms';
/**
 * Base class for dynamic form models...
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
export class FieldBase<T> {
  value: T;
  id: string;
  name: string;
  label: string;
  required: boolean;
  controlType: string;
  compClass: any;
  form: any;
  cssClasses: any;
  hasGroup: boolean;
  hasLookup: boolean;
  options: any;
  groupName: string;
  hasControl: boolean;
  formModel: any;
  validationMessages: any;
  editMode: boolean;
  readOnly: boolean;

  constructor(options = {}) {
    this.setOptions(options);
  }

  setOptions(options: {
    value?: T,
    name?: string,
    id?: string,
    label?: string,
    required?: boolean,
    order?: number,
    controlType?: string,
    cssClasses?: any,
    groupName?: string,
    editMode? : boolean,
    readOnly?: boolean
  } = {}) {
    this.value = options.value;
    this.name = options.name || '';
    this.id = options.id || '';
    this.label = options.label || '';
    this.required = !!options.required;
    this.controlType = options.controlType || '';
    this.cssClasses = options.cssClasses || {}; // array of
    this.groupName = options.groupName || null;
    this.editMode = options.editMode || false;
    this.readOnly = options.readOnly || false;
    if (this.groupName) {
      this.hasGroup = true;
    }
    this.options = options;
    this.hasControl = true;
    this.validationMessages = options['validationMessages'] || {};
  }

  get isValid() {
    if (this.form && this.form.controls) {
      return this.form.controls[this.name].valid;
    }
    return false;
  }

  public createFormModel(): any {
    this.formModel = this.required ? new FormControl(this.value || '', Validators.required)
                                      : new FormControl(this.value || '');
    return this.formModel;
  }

  public getGroup(group: any, fieldMap: any) : any {
    let retval = null;
    fieldMap[this.name] = {field:this};
    let control = this.createFormModel();
    fieldMap[this.name].control = control;
    if (this.hasGroup && this.groupName) {
      if (group[this.groupName]) {
        group[this.groupName].addControl(this.name, control);
      } else {
        const fg = {};
        fg[this.name] = control;
        group[this.groupName] = new FormGroup(fg);
      }
      retval = group[this.groupName];
    } else {
      if (this.hasControl) {
        group[this.name] = control;
        retval = group[this.name];
      }
    }
    return retval;
  }

  public triggerValidation() {
    if (this.formModel) {
      this.formModel.markAsTouched();
      this.formModel.updateValueAndValidity();
    }
  }
}
