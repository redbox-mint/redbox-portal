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

import { Input, Component, ViewChild, ViewContainerRef, OnInit } from '@angular/core';
import { FieldBase } from './field-base';
import { DateTime, AnchorOrButton, TextArea, TextField } from './field-simple';
import { FormGroup } from '@angular/forms';
import * as _ from "lodash-lib";
import moment from 'moment-es6';
declare var jQuery: any;
/**
 * Simple Component classes
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
export class SimpleComponent {
  @Input() public field: FieldBase<any>;
  @Input() public form: FormGroup;
  @Input() public fieldMap: any;

  public getFormControl() {
    if (this.fieldMap && this.field) {
      return this.fieldMap[this.field.name].control;
    }
    return null;
  }

  public getGroupClass(fldName:string=null): string {
    return `form-group ${this.hasRequiredError() ? 'has-error' : '' }`;
  }

  public hasRequiredError() {
    return this.field.formModel.touched && this.field.formModel.hasError('required');
  }
}

@Component({
  selector: 'textfield',
  template: `
  <div *ngIf="field.editMode" [formGroup]='form' [ngClass]="getGroupClass()" >
    <label [attr.for]="field.name">{{field.label}}</label><br/>
    <input [formControl]="fieldMap[field.name].control"  [id]="field.name" [type]="field.type" [readonly]="field.readOnly" class="form-control">
    <div class="text-danger" *ngIf="fieldMap[field.name].control.hasError('required') && fieldMap[field.name].control.touched">{{field.label}} is required</div>
  </div>
  <div *ngIf="!field.editMode" class="key-value-pair">
    <span class="key" *ngIf="field.label">{{field.label}}</span>
    <span class="value">{{field.value}}</span>
  </div>
  `,
})
export class TextFieldComponent extends SimpleComponent {}

@Component({
  selector: 'text-area',
  template: `
  <div *ngIf="field.editMode" [formGroup]='form' class="form-group">
    <label [attr.for]="field.name">{{field.label}}</label><br/>
    <textarea [formControl]="fieldMap[field.name].control"  [attr.rows]="field.rows" [attr.cols]="field.cols" [id]="field.name" class="form-control">{{field.value}}</textarea>
    <div class="text-danger" *ngIf="fieldMap[field.name].control.hasError('required') && fieldMap[field.name].control.touched">{{field.label}} is required</div>
  </div>
  <li *ngIf="!field.editMode" class="key-value-pair">
    <span class="key" *ngIf="field.label">{{field.label}}</span>
    <span *ngFor="let line of field.lines">
      {{line}}
      <br/>
    </span>
    <br/>
  </li>
  `,
})
export class TextAreaComponent extends SimpleComponent implements OnInit {
  field: TextArea;
  ngOnInit() {
    if (!this.field.editMode) {
      this.field.formatValueForDisplay();
    }
  }
}

@Component({
  selector: 'dropdownfield',
  template: `
  <div [formGroup]='form'>
     <label [attr.for]="field.name">{{field.label}}</label>
     <select [formControl]="fieldMap[field.name].control"  [id]="field.name" >
        <option *ngFor="let opt of field.options" [value]="opt.key">{{opt.value}}</option>
     </select>
     <div class="text-danger" *ngIf="fieldMap[field.name].control.hasError('required') && fieldMap[field.name].control.touched">{{field.label}} is required</div>
  </div>
  `,
})
export class DropdownFieldComponent extends SimpleComponent {

}
/****************************************************************************
Container components
*****************************************************************************/
@Component({
  selector: 'tabcontainer',
  template: `
  <div *ngIf="field.editMode" class="row" style="min-height:300px;">
    <div [ngClass]="field.cssClasses">
      <div [ngClass]="field.tabNavContainerClass">
        <ul [ngClass]="field.tabNavClass">
          <li *ngFor="let tab of field.fields" [ngClass]="{'active': tab.active}"><a href="#{{tab.id}}" data-toggle="tab" role="tab">{{tab.label}}</a></li>
        </ul>
      </div>
      <div [ngClass]="field.tabContentContainerClass">
        <div [ngClass]="field.tabContentClass">
      <!--
      Inlined the tab definition instead of creating it's own component otherwise Bootstrap refuses to toggle the panes
      Likely because of the extra DOM node (component selector) that it doesn't know what to do.
      TODO: remove inlining, or perhaps consider a 3rd-party NG2 tab component
      -->
          <div *ngFor="let tab of field.fields" [ngClass]="{'tab-pane': true, 'fade': true, 'active': tab.active==true, 'in': tab.active==true}" id="{{tab.id}}">
            <dmp-field *ngFor="let field of tab.fields" [field]="field" [form]="form" class="form-row" [fieldMap]="fieldMap"></dmp-field>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div *ngIf="!field.editMode" [ngClass]="field.accContainerClass">
    <div class="panel-group">
      <div *ngFor="let tab of field.fields" [ngClass]="field.accClass">
        <div class="panel-heading">
          <h4 class="panel-title">
            <a data-toggle="collapse" href="#{{tab.id}}">{{tab.label}}</a>
          </h4>
        </div>
        <div id="{{tab.id}}" class="panel-collapse collapse">
          <div class="panel-body">
            <ul class="key-value-list">
              <dmp-field *ngFor="let field of tab.fields" [field]="field" [form]="form" class="form-row" [fieldMap]="fieldMap"></dmp-field>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
  `
})
export class TabOrAccordionContainerComponent extends SimpleComponent {

}
// Break in case of an emergency....
@Component({
  selector: 'htmlraw',
  template: `
  <ng-content></ng-content>
  `,
})
export class HtmlRawComponent extends SimpleComponent {

}
// For creating text blocks with help sections?
@Component({
  selector: 'text-block',
  template: `
  <div [ngSwitch]="field.type">
    <h1 *ngSwitchCase="'h1'" [ngClass]="field.cssClasses">{{field.value}}</h1>
    <h2 *ngSwitchCase="'h2'" [ngClass]="field.cssClasses">{{field.value}}</h2>
    <h3 *ngSwitchCase="'h3'" [ngClass]="field.cssClasses">{{field.value}}</h3>
    <h4 *ngSwitchCase="'h4'" [ngClass]="field.cssClasses">{{field.value}}</h4>
    <span *ngSwitchCase="'span'" [ngClass]="field.cssClasses">{{field.value}}</span>
    <p *ngSwitchDefault [ngClass]="field.cssClasses">{{field.value}}</p>
  </div>
  `,
})
export class TextBlockComponent extends SimpleComponent {
  field: TextField;
}

/**
Wrapped: https://github.com/nkalinov/ng2-datetime
Based on: https://bootstrap-datepicker.readthedocs.io/en/stable/
*/
@Component({
  selector: 'date-time',
  template: `
  <div *ngIf="field.editMode" [formGroup]='form' class="form-group">
    <label [attr.for]="field.name">{{field.label}}</label><br/>
    <datetime #dateTime [formControl]="fieldMap[field.name].control" [timepicker]="field.timePickerOpts" [datepicker]="field.datePickerOpts" [hasClearButton]="field.hasClearButton"></datetime>
  </div>
  <li *ngIf="!field.editMode" class="key-value-pair">
    <span class="key" *ngIf="field.label">{{field.label}}</span>
    <span class="value">{{field.formatValueForDisplay()}}</span>
  </li>
  `
})
export class DateTimeComponent extends SimpleComponent implements OnInit {
  public field: DateTime;
  @ViewChild('dateTime', {read: ViewContainerRef}) dateTimeView: ViewContainerRef;

  ngOnInit() {
    this.getFormControl().valueChanges.subscribe((date:any) => {
      this.handleChange(date);
    });
  }

  updateStartDate(newVal: any) {
    const thisDate = moment(newVal);
    const prevStartDate = moment(this.getFormControl().value);
    if (!prevStartDate.isValid() || thisDate.isAfter(prevStartDate)) {
      this.getFormControl().setValue(newVal);
    }
    const newOpts = _.cloneDeep(this.field.datePickerOpts);
    newOpts.startDate = newVal;
    this.field.datePickerOpts = newOpts;
  }

  handleChange(newVal: Date) {
    if (this.field.onChange) {
      _.forEach(this.field.onChange.setStartDate, (targetField: any) => {
        this.fieldMap[targetField].instance.updateStartDate(newVal);
      });
    }
  }

  formatValue() {
    return this.field.formatValue(this.fieldMap[this.field.name].control.value);
  }

}

@Component({
  selector: 'anchor-button',
  template: `
  <button *ngIf="field.controlType=='button'" type="{{field.type}}" [ngClass]="field.cssClasses" (click)="onClick($event)" [disabled]="isDisabled()">{{field.label}}</button>
  <a *ngIf="field.controlType=='anchor'" href='{{field.value}}' [ngClass]="field.cssClasses" ><span *ngIf="field.showPencil" class="glyphicon glyphicon-pencil">&nbsp;</span>{{field.label}}</a>
  `,
})
export class AnchorOrButtonComponent extends SimpleComponent {
  public field: AnchorOrButton;

  public onClick(event: any) {
    this.fieldMap._rootComp[this.field.onClick_RootFn]();
  }

  public isDisabled() {
    if (this.field.isDisabledFn) {
      return this.fieldMap._rootComp[this.field.isDisabledFn]();
    }
    return false;
  }
}

@Component({
  selector: 'link-value',
  template: `
  <li *ngIf="!field.editMode && isVisible()" class="key-value-pair padding-bottom-10">
    <span class="key" *ngIf="field.label">{{field.label}}</span>
    <span class="value"><a href='{{field.value}}' target="field.target">{{field.value}}</a></span>
  </li>
  `,
})
export class LinkValueComponent extends SimpleComponent {
  isVisible() {
    return !_.isEmpty(this.field.value);
  }
}

@Component({
  selector: 'hidden-field',
  template: `
  <div [formGroup]='form'>
    <input type="hidden" [formControl]="fieldMap[field.name].control" />
  </div>
  `,
})
export class HiddenValueComponent extends SimpleComponent {
}
