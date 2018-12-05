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
import { Output, EventEmitter } from '@angular/core';
import { FieldBase } from './field-base';
import { FormControl, FormGroup, FormArray, Validators } from '@angular/forms';
import * as _ from "lodash";
import moment from 'moment-es6';

export class NotInFormField extends FieldBase<any> {
  constructor(options: any, injector: any) {
    super(options, injector);
  }

  public createFormModel(valueElem:any = null): any {
  }

  public getGroup(group: any, fieldMap: any) : any {
    this.fieldMap = fieldMap;
    _.set(fieldMap, `${this.getFullFieldName()}.field`, this);
  }

  public reactEvent(eventName: string, eventData: any, origData: any) {

  }
}

export class SelectionField extends FieldBase<any>  {
  selectOptions: any[] = [];
  storeValueAndLabel:boolean = false;

  constructor(options: any, injector: any) {
    super(options, injector);


    // this.options = options['options'] || [];
    this.selectOptions = _.map(options['options'] || [], (option)=> {
      option['label'] = this.getTranslated(option['label'], option['label']);
      option['value'] = this.getTranslated(option['value'], option['value']);
      return option;
    });

    if (options['storeValueAndLabel']) {
      this.storeValueAndLabel = true;
      if(options['value'] == undefined) {
        let emptyOptions = _.find(this.selectOptions, selectOption => {
          return selectOption.value == "";
        });
          if(emptyOptions != null) {
            this.value = emptyOptions;
          }
      }
    }
  }


  createFormModel() {
    if (this.controlType == 'checkbox') {
      const fgDef = [];

      _.map(this.selectOptions, (opt)=>{
        const hasValue = _.find(this.value, (val) => {
          return val == opt.value;
        });
        if (hasValue) {
          fgDef.push(new FormControl(opt.value));
        }
      });
      // const fg = new FormArray(fgDef);
      // return fg;
      return new FormArray(fgDef);
    } else {
      // const model = super.createFormModel();
      // console.log(`Created form model:`);
      // console.log(model);
      // return model;
      return super.createFormModel();
    }
  }

  nextOption() {
    if (this.controlType == 'radio') {
      let nextIdx = 0;
      const opt = _.find(this.selectOptions, (opt, idx)=> {
        const match = opt.value == this.value;
        if (match) {
          nextIdx = ++idx;
        }
        return match;
      });
      if (nextIdx >= this.selectOptions.length) {
        nextIdx = 0;
      }
      const value = this.selectOptions[nextIdx].value;
      this.setValue(value);
    }
    return this.value;
  }
}

export class Container extends FieldBase<any> {
  content: string;
  fields: FieldBase<any>[];
  active: boolean;
  type: string;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.controlType = 'div';
    this.content = options['content'] || '';
    this.active = options['active'] || false;
    this.type = options['type'] || '';
    this.isGroup = true;
    this.hasControl = _.isUndefined(this.groupName);
    if (_.isEmpty(this.cssClasses) && _.startsWith(this.type, 'h')) {
      this.cssClasses = [`${this.type}-header`];
    }

  }

  public getGroup(group: any, fieldMap: any) : any {
    this.fieldMap = fieldMap;
    _.set(fieldMap, `${this.getFullFieldName()}.field`, this);
    group[this.name] =  this.required ? new FormGroup({}, Validators.required) : new FormGroup({});
    _.each(this.fields, (field) => {
      field.getGroup(group, fieldMap);
    });
    return group[this.name];
  }

  public createFormModel(valueElem:any=null): any {
    const grp = {};
    _.each(this.fields, (field) => {
      let fldVal = null;
      if (this.value) {
        fldVal = _.get(this.value, field.name);
      }
      field.value = fldVal;
      grp[field.name] = field.createFormModel(fldVal);
    });
    this.formModel = this.required ? new FormGroup(grp, Validators.required) : new FormGroup(grp);
    return this.formModel;
  }

  public setValue(value:any, emitEvent:boolean=true) {
    this.value = value;
    _.forOwn(value, (val, key) => {
      const fld = _.find(this.fields, (fldItem) => {
        return fldItem.name == key;
      });
      fld.setValue(val, emitEvent);
    });
    // this.formModel.setValue(value, { onlySelf: true, emitEvent: emitEvent });
  }

}

export class TabOrAccordionContainer extends Container {

  @Output() onTabChange: EventEmitter<any> = new EventEmitter<any>();
  public onAccordionCollapseExpand: EventEmitter<any> = new EventEmitter<any>();

  tabNavContainerClass: any;
  tabNavClass: any;
  tabContentContainerClass: any;
  tabContentClass: any;
  accContainerClass: any;
  accClass: any;
  expandAccordionsOnOpen:boolean = false;
  allExpanded:boolean = false;

  constructor(options: any, injector: any) {
    super(options, injector);
    // defaults to nav-pills, nav-stacked, nav size col-md-2, tab content col-md-10
    this.tabNavContainerClass = options['tabNavContainerClass'] || 'col-md-2';
    this.tabNavClass = options['tabNavClass'] || 'nav nav-pills nav-stacked';
    this.tabContentContainerClass = options['tabContentContainerClass'] || 'col-md-10';
    this.tabContentClass = options['tabContentClass'] || 'tab-content';
    this.accContainerClass = options['accContainerClass'] || 'col-md-12';
    this.accClass = options['accClass'] || 'panel panel-default';
    this.expandAccordionsOnOpen = options['expandAccordionsOnOpen'] || false;
  }
}

export class ButtonBarContainer extends Container {

  constructor(options: any, injector: any) {
    super(options, injector);
  }
}


export class DateTime extends FieldBase<any> {
  datePickerOpts: any;
  timePickerOpts: any;
  hasClearButton: boolean;
  valueFormat: string;
  displayFormat: string;
  adjustStartRange: boolean;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.datePickerOpts = options['datePickerOpts'] || false;
    this.timePickerOpts = options['timePickerOpts'] || false;
    this.hasClearButton = options['hasClearButton'] || false;
    this.valueFormat = options['valueFormat'] || 'YYYY-MM-DD';
    this.displayFormat = options['displayFormat'] || 'YYYY-MM-DD';
    this.controlType = 'datetime';
    this.value = this.value ? this.parseToDate(this.value) : this.value;
    this.adjustStartRange = !_.isUndefined(options['adjustStartRange']) ? options['adjustStartRange'] : false;
  }

  formatValue(value: any) {
    // assume local date
    console.log(`Formatting value: ${value}`)
    return value ? moment(value).local().format(this.valueFormat) : value;
  }

  parseToDate(value: any) {
    return moment(value, this.valueFormat).local().toDate();
  }

  formatValueForDisplay() {
    const locale = window.navigator.language; // commented out, no support for below IE 11: window.navigator.userLanguage || window.navigator.language;
    return this.value ? moment(this.value).locale(locale).format(this.displayFormat) : '';
  }

  public reactEvent(eventName: string, eventData: any, origData: any) {
    if (this.adjustStartRange) {
      const thisDate = moment(eventData);
      const prevStartDate = moment(this.formModel.value);
      if (!prevStartDate.isValid() || thisDate.isAfter(prevStartDate)) {
        this.formModel.setValue(eventData);
      }
      const newOpts = _.cloneDeep(this.datePickerOpts);
      newOpts.startDate = eventData;
      this.datePickerOpts = newOpts;
    }
  }
}



export class SaveButton extends NotInFormField {
  label: string;
  redirectLocation: string;
  closeOnSave: boolean;
  buttonClass: string;
  targetStep: string;
  additionalData: any;
  confirmationMessage: string;
  confirmationTitle: string;
  cancelButtonMessage: string;
  confirmButtonMessage: string;
  isDelete: boolean;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.label = this.getTranslated(options['label'], 'Save');
    this.closeOnSave = options['closeOnSave'] || false;
    this.redirectLocation = options['redirectLocation'] || false;
    this.cssClasses = options['cssClasses'] || "btn-primary";
    this.targetStep = options['targetStep'] || null;
    this.additionalData = options['additionalData'] || null;
    this.confirmationMessage = options['confirmationMessage'] ? this.getTranslated(options['confirmationMessage'], null) : null;
    this.confirmationTitle = options['confirmationTitle'] ? this.getTranslated(options['confirmationTitle'], null) : null;
    this.cancelButtonMessage = options['cancelButtonMessage'] ? this.getTranslated(options['cancelButtonMessage'], null ) : null;
    this.confirmButtonMessage = options['confirmButtonMessage'] ? this.getTranslated(options['confirmButtonMessage'], null) : null;
    this.isDelete = options['isDelete'];
  }
}

export class CancelButton extends FieldBase<string> {
  label: string;
  constructor(options: any, injector: any) {
    super(options, injector);
    this.label =  this.getTranslated(options['label'], 'Cancel');
  }
}

export class TabNavButton extends FieldBase<string> {
  prevLabel: string;
  nextLabel: string;
  currentTab: string;
  tabs: string[] = [];
  targetTabContainerId: string;
  endDisplayMode: string;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.prevLabel = this.getTranslated(options.prevLabel, 'Previous');
    this.nextLabel = this.getTranslated(options.nextLabel, 'Next');
    this.targetTabContainerId = options.targetTabContainerId;
    this.endDisplayMode = options.endDisplayMode == 'hidden' ? 'hidden': 'disabled';
  }

  public getTabs() {
    const targetContainerTab = this.getTargetTab(this.fieldMap._rootComp.formDef.fields);
    if (targetContainerTab) {
      _.each(targetContainerTab.definition.fields, (tab) => {
        this.tabs.push(tab.definition.id);
      });
      this.currentTab = this.tabs[0];
    } else {
      console.log(`Target Container Tab not found: ${this.targetTabContainerId}`);
    }
  }

  protected getTargetTab(fields: any[]) {
    const targetTab = _.find(fields, (f:any) => {
      if (f.definition && f.definition.id == this.targetTabContainerId) {
        return true;
      }
      if (f.definition && f.definition.fields) {
        return this.getTargetTab(f.definition.fields);
      }
    });
    return targetTab;
  }

  public getCurrentTabIdx() {
    return _.findIndex(this.tabs, (curTab: any) => { return curTab == this.currentTab });
  }

  public getTabId(step:number) {
    const curTabIdx = this.getCurrentTabIdx();
    const tabIdx = curTabIdx + step;
    if (tabIdx >= 0 && tabIdx < this.tabs.length) {
      return this.tabs[tabIdx];
    }
    return null;
  }

}

export class AnchorOrButton extends FieldBase<string> {
  onClick_RootFn: any;
  type: string;
  isDisabledFn: any;
  showPencil: boolean;
  anchorHtml: string;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.onClick_RootFn = options['onClick_RootFn'] || null;
    this.isDisabledFn = options['isDisabledFn'] || null;
    this.type = options['type'] || 'button';
    this.controlType = options['controlType'] || 'button';
    this.hasControl = false;
    this.showPencil = options['showPencil'] || false;
    this.anchorHtml = options['anchorHtml'] || '';
  }
}

export class HiddenValue extends FieldBase<string> {
  constructor(options: any, injector: any) {
    super(options, injector);
    this.controlType = 'hidden';
  }
}

export class LinkValue extends FieldBase<string> {
  target: string;
  constructor(options: any, injector: any) {
    super(options, injector);
    this.controlType = 'link';
    this.target = options.target || '_blank';
  }
}


export class ParameterRetrieverField extends FieldBase<string> {
  parameterName: string;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.parameterName = options.parameterName || '';
  }

  public publishParameterValue(value: string) {
    this.onValueUpdate.emit(value);
  }

}

export class Spacer extends NotInFormField {
  width: string;
  height: string;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.width = options.width;
    this.height = options.height;
  }
}

export class Toggle extends FieldBase<boolean> {
  type: string;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.type = options['type'] || 'checkbox';
    this.value = options['value'] || false;
  }
}

export class HtmlRaw extends NotInFormField {

  public getGroup(group: any, fieldMap: any) : any {
    super.getGroup(group, fieldMap);
    this.value = this.replaceValWithConfig(this.value);
  }
}
