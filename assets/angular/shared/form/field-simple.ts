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

import { FieldBase } from './field-base';
import { FormControl } from '@angular/forms';
import * as _ from "lodash-lib";
import moment from 'moment-es6';
/**
 * Text Field Model
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>

 */
export class TextField extends FieldBase<string> {
  type: string;

  constructor(options: any) {
    super(options);
    this.type = options['type'] || '';
    this.controlType = 'textbox';
  }
}

export class TextArea extends FieldBase<string> {
  rows: number;
  cols: number;

  lines: string[];

  constructor(options: any) {
    super(options);
    this.rows = options['rows'] || 5;
    this.cols = options['cols'] || null;
    this.controlType = 'textarea';
  }

  formatValueForDisplay() {
    this.lines = this.value ? this.value.split("\n") : [];
  }
}
/**
Ordinary dropdown field
*/
export class DropdownField extends FieldBase<string> {
  options: {key: string, value: string}[] = [];

  constructor(options: any) {
    super(options);
    this.options = options['options'] || [];
    this.controlType = 'dropdown';
  }
}

export class Container extends FieldBase<string> {
  content: string;
  fields: FieldBase<any>[];
  active: boolean;
  type: string;

  constructor(options: any) {
    super(options);
    this.controlType = 'div';
    this.content = options['content'] || '';
    this.active = options['active'] || false;
    this.type = options['type'] || '';
    this.hasControl = false;
  }
}

export class TabOrAccordionContainer extends Container {
  tabNavContainerClass: any;
  tabNavClass: any;
  tabContentContainerClass: any;
  tabContentClass: any;
  accContainerClass: any;
  accClass: any;

  constructor(options: any) {
    super(options);
    // defaults to nav-pills, nav-stacked, nav size col-md-2, tab content col-md-10
    this.tabNavContainerClass = options['tabNavContainerClass'] || 'col-md-2';
    this.tabNavClass = options['tabNavClass'] || 'nav nav-pills nav-stacked';
    this.tabContentContainerClass = options['tabContentContainerClass'] || 'col-md-10';
    this.tabContentClass = options['tabContentClass'] || 'tab-content';
    this.accContainerClass = options['accContainerClass'] || 'col-md-12';
    this.accClass = options['accClass'] || 'panel panel-default';
  }
}

export class DateTime extends FieldBase<any> {
  datePickerOpts: any;
  timePickerOpts: any;
  onChange: any; // e.g. { 'setStartDate': ['name of pickers']}
  hasClearButton: boolean;
  valueFormat: string;
  displayFormat: string;

  constructor(options: any) {
    super(options);
    this.datePickerOpts = options['datePickerOpts'] || false;
    this.timePickerOpts = options['timePickerOpts'] || false;
    this.onChange = options['onChange'] || null;
    this.hasClearButton = options['hasClearButton'] || false;
    this.valueFormat = options['valueFormat'] || 'YYYY-MM-DD';
    this.displayFormat = options['displayFormat'] || 'YYYY-MM-DD';
    this.controlType = 'datetime';
    this.value = this.value ? this.parseToDate(this.value) : this.value;
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
}

export class AnchorOrButton extends FieldBase<string> {
  onClick_RootFn: any;
  type: string;
  isDisabledFn: any;
  showPencil: boolean;

  constructor(options: any) {
    super(options);
    this.onClick_RootFn = options['onClick_RootFn'] || null;
    this.isDisabledFn = options['isDisabledFn'] || null;
    this.type = options['type'] || 'button';
    this.controlType = options['controlType'] || 'button';
    this.hasControl = false;
    this.showPencil = options['showPencil'] || false;
  }
}

export class HiddenValue extends FieldBase<string> {
  constructor(options: any) {
    super(options);
    this.controlType = 'hidden';
  }
}

export class LinkValue extends FieldBase<string> {
  target: string;
  constructor(options: any) {
    super(options);
    this.controlType = 'link';
    this.target = options.target || '_blank';
  }
}
