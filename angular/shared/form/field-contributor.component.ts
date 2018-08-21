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

import { Input, Component, OnInit, ViewChild, ElementRef} from '@angular/core';
import { SimpleComponent } from './field-simple.component';
import { FieldBase } from './field-base';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import * as _ from "lodash";
import { RbValidator } from './validators';
import { VocabField } from './field-vocab.component';
/**
 * Contributor Model
 *
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
const KEY_TAB = 9;
const KEY_EN = 13;

export class ContributorField extends FieldBase<any> {
  nameColHdr: string;
  emailColHdr: string;
  roleColHdr: string;
  orcidColHdr: string;
  showHeader: boolean;
  showRole: boolean;
  roles: string[];

  fieldNames: any;
  fullNameResponseField: string = "text_full_name";
  groupFieldNames: string[];
  enabledValidators: boolean;
  marginTop: string;
  baseMarginTop: string;
  role: string;
  // Frankenstein begin
  vocabField: VocabField;
  previousEmail: string;
  username: string;
  hasInit: boolean;
  freeText: boolean;
  forceLookupOnly: boolean;
  splitNames: boolean;
  familyNameHdr: string;
  givenNameHdr: string;
  // Frankenstein end
  component: any;


  constructor(options: any, injector: any) {
    super(options, injector);
    this.clName = 'ContributorField';
    this.controlType = 'textbox';
    this.splitNames = options['splitNames'] || false;
    this.familyNameHdr = options['familyNameHdr'] ? this.getTranslated(options['familyNameHdr'], options['familyNameHdr']) : 'Family';
    this.givenNameHdr = options['givenNameHdr'] ? this.getTranslated(options['givenNameHdr'], options['givenNameHdr']) : 'Given';
    this.nameColHdr = options['nameColHdr'] ? this.getTranslated(options['nameColHdr'], options['nameColHdr']) : 'Researcher Name';
    this.emailColHdr = options['emailColHdr'] ? this.getTranslated(options['emailColHdr'], options['emailColHdr']) : 'Email Address';
    this.roleColHdr = options['roleColHdr'] ? this.getTranslated(options['roleColHdr'], options['roleColHdr']) : 'Project Role';
    this.orcidColHdr = options['orcidColHdr'] ? this.getTranslated(options['orcidColHdr'], options['orcidColHdr']) : 'ORCID';

    this.showHeader = options['showHeader'] || true;
    this.showRole = options['showRole'] || true;
    this.baseMarginTop = options['baseMarginTop'] || '';

    this.roles = options['roles'] || [];
    this.value = options['value'] || this.setEmptyValue();
    this.fieldNames = options['fieldNames'] || [];
    const textFullNameFieldName = _.find(this.fieldNames, fieldNameObject => {
      return fieldNameObject['text_full_name'] != undefined;
    });
    if(textFullNameFieldName != null) {
    this.fullNameResponseField = textFullNameFieldName['text_full_name'];
    }
    this.validationMessages = options['validationMessages'] || {required: {
        email: this.getTranslated(options['validation_required_email'], 'Email required'),
        text_full_name: this.getTranslated(options['validation_required_name'], 'Name is required'),
        role: this.getTranslated(options['validation_required_role'],'Select a role'),
        family_name: this.getTranslated(options['validation_required_family_name'], 'Family name is required'),
        given_name: this.getTranslated(options['validation_required_given_name'], 'Given name is required'),
      },
      invalid: { email: this.getTranslated(options['validation_invalid_email'], 'Email format is incorrect')}};
    this.groupFieldNames = ['text_full_name', 'email'];
    this.freeText = options['freeText'] || false;
    this.forceLookupOnly = options['forceLookupOnly'] || false;
    if (this.forceLookupOnly) {
      // override free text as it doesn't make sense
      this.freeText = false;
    }
    this.role = options['role'] ? this.getTranslated(options['role'], options['role']) : null;
    this.username = options['username'] || '';
    this.previousEmail = this.value ? this.value.email : '';

    this.validators = {
      text_full_name: [Validators.required],
      email: [Validators.required, Validators.email]
    };
    if (!this.freeText) {
      this.vocabField = new VocabField(this.options, this.injector);
      this.hasLookup = true;
    }
    if (this.splitNames) {
      this.groupFieldNames.push('family_name');
      this.groupFieldNames.push('given_name');
      this.validators['family_name'] = [Validators.required];
      this.validators['given_name'] = [Validators.required];
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
    if (_.isEmpty(this.value.role)) {
      this.value.role = this.role;
    }

    if (!this.freeText) {
      // this.vocabField.setEmptyValue();
      this.formModel = this.vocabField.createFormModel(this.value, true);
      this.formModel.addControl('username', new FormControl(this.value.username));
      this.formModel.addControl('role', new FormControl(this.value.role));
      this.formModel.addControl('orcid', new FormControl(this.value.orcid));
      if (this.value) {
        this.setValue(this.value);
      }
    } else {
      this.formModel = new FormGroup({text_full_name: new FormControl(this.value.text_full_name || null),
                                   email: new FormControl(this.value.email || null),
                                   role: new FormControl(this.value.role || null),
                                   username: new FormControl(this.value.username || ''),
                                   orcid: new FormControl(this.value.orcid || '')
                                 });
      if (this.splitNames) {
        this.formModel.addControl('family_name', new FormControl(this.value.family_name));
        this.formModel.addControl('given_name', new FormControl(this.value.given_name));
      }
    }
    if (this.required) {
      this.enableValidators();
    } else {
      // TODO: cherry pick validators, like email, etc.
    }
    return this.formModel;
  }

  setValue(value:any, emitEvent:boolean=true, updateTitle:boolean=false) {
    this.setMissingFields(value);
    if (!this.hasInit) {
      this.hasInit = true;
      value.username = _.isUndefined(value.username) ? '' : value.username;
    } else {
      if ( _.isUndefined(value.username) ||  (value.email && value.email != this.previousEmail )) {
        value.username = '';
        this.previousEmail = value.email;
      }
    }
    this.formModel.patchValue(value, {emitEvent: emitEvent});
    this.formModel.markAsTouched();
    this.formModel.markAsDirty();
    if (updateTitle && !this.freeText) {
      this.component.ngCompleter.ctrInput.nativeElement.value = this.vocabField.getTitle(value);
    }
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

  setEmptyValue(emitEvent:boolean = true) {
    this.value = {text_full_name: null, email: null, role: null, username: ''};
    if (this.formModel) {
      _.forOwn(this.formModel.controls, (c, cName)=> {
        c.setValue(null, {emitEvent: emitEvent});
      });
    }
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
      this.formModel.controls[f].updateValueAndValidity({ onlySelf: true, emitEvent: false });
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

  /**
   * This method was created to try to guess the family and given names from a value that's got these 2 merged.
   *
   * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
   * @param  value
   * @return
   */
  public setMissingFields(value: any) {
    if (this.splitNames && (value && (_.isEmpty(value.family_name) || _.isUndefined(value.family_name)))) {
      // guess work begins...
      const names = value.text_full_name.split(' ');
      value['given_name'] = names[0];
      names.splice(0, 1);
      value['family_name'] = names.join(' ');
      value['full_name_family_name_first'] = `${value['family_name']}, ${value['given_name']}`;
    }
    return value;
  }

  public reactEvent(eventName: string, eventData: any, origData: any) {
    if (_.isEmpty(this.componentReactors)) {
      this.setValue(eventData, false, true);
    } else {
      _.each(this.componentReactors, (compReact) => {
        compReact.reactEvent(eventName, eventData, origData, this);
      });
    }
  }
}

@Component({
  selector: 'rb-contributor',
  templateUrl: './field-contributor.component.html',
})
export class ContributorComponent extends SimpleComponent {
  field: ContributorField;
  @Input() isEmbedded: boolean = false;
  @ViewChild('ngCompleter') public ngCompleter: any;
  lastSelected: any;
  emptied: boolean = false;
  blurred: boolean = false;

  public ngOnInit() {
    this.field.componentReactors.push(this);
    this.field.component = this;
  }

  public ngAfterViewInit() {
    if (this.field.editMode && this.ngCompleter) {
      const that = this;
      this.ngCompleter.ctrInput.nativeElement.setAttribute('aria-label', 'Name');
      this.ngCompleter.registerOnChange((v) => {
        that.emptied = _.isEmpty(v);
        if (that.emptied && that.blurred) {
          that.blurred = false;
          console.log(`Forced lookup, clearing data..`)
          this.field.setEmptyValue(true);
          this.lastSelected = null;
        }
      });
    }
  }

  public getGroupClass(fldName:any, wideMode:boolean = false): string {
    let hasError = false;
    hasError = hasError || (this.field.formModel.controls[fldName].hasError('required'));
    if (!hasError && fldName == 'email') {
      hasError = hasError || (this.field.formModel.controls[fldName].hasError('email'));
    }
    const additionalClass = this.field.splitNames ? ' padding-remove' : '';
    return `col-xs-${wideMode ? '3' : '2'} form-group${additionalClass}${hasError ? ' has-error' : ''}`;
  }

  onSelect(selected: any, emitEvent:boolean=true, updateTitle:boolean=false) {
    if (selected) {
      if ( (_.isEmpty(selected.title) || _.isUndefined(selected.title)) && (_.isEmpty(selected.text_full_name) || _.isUndefined(selected.text_full_name))) {
        console.log(`Same or empty selection, returning...`);
        this.lastSelected = null;
        return;
      } else {
        if (selected.title && selected.title == this.field.formModel.value.text_full_name) {
          console.log(`Same or empty selection, returning...`);
          return;
        }
      }
      this.lastSelected = selected;
      let val:any;
      if (!this.field.freeText) {
        if (_.isEmpty(selected.text_full_name)) {
          if (this.field.vocabField.restrictToSelection || selected.originalObject) {
            val = this.field.vocabField.getValue(selected);
          } else {
            val = {text_full_name: selected.title};
          }
        } else if(selected[this.field.fullNameResponseField]) {
          val = this.field.vocabField.getValue(selected);
        } else {
          val = {text_full_name: selected.title};
        }
        if (!_.isEmpty(selected.orcid) && !_.isUndefined(selected.orcid)) {
          val['orcid'] = selected.orcid;
        }
        if (!_.isEmpty(selected.username) && !_.isUndefined(selected.username)) {
          val['username'] = selected.username;
        }

        val.role = this.field.role;
        // console.log(`With selected:`);
        // console.log(JSON.stringify(selected));
        // console.log(`Using val:`);
        // console.log(JSON.stringify(val));
        this.field.setValue(val, emitEvent, updateTitle);
      } else {
        val = this.field.setMissingFields(selected);
        this.field.setValue(val, emitEvent, updateTitle);
      }
    } else {
      console.log(`No selected user.`)
      if (this.field.forceLookupOnly) {
        console.log(`Forced lookup, clearing data..`)
        this.field.setEmptyValue(emitEvent);
        this.lastSelected = null;
      }
    }
  }

  public reactEvent(eventName: string, eventData: any, origData: any, elem:any) {
    console.log(`Contributor component reacting:`);
    console.log(eventData);
    this.onSelect(eventData, false, true);
  }

  public onKeydown(event) {
    if (event && (event.keyCode === KEY_EN || event.keyCode === KEY_TAB )) {
      if (this.lastSelected && this.emptied) {
        const that = this;
        setTimeout(() => {
          that.ngCompleter.ctrInput.nativeElement.value = that.lastSelected.title;
        }, 40);
      } else {
        if (this.emptied && this.field.forceLookupOnly) {
          console.log(`Forced lookup, clearing data..`)
          this.field.setEmptyValue(true);
          this.lastSelected = null;
        }
      }
    } else {
      const val = this.field.vocabField.getValue({text_full_name: this.ngCompleter.ctrInput.nativeElement.value });
      this.field.setValue(val, true, false);
    }
  }

  public onBlur() {
    if (this.field.forceLookupOnly) {
      this.blurred = true;
    }
  }


}
