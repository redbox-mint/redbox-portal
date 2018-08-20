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

import { Input, Component, ViewChild, ViewContainerRef, OnInit, Injector, AfterViewInit, AfterViewChecked, ChangeDetectorRef } from '@angular/core';
import { FieldBase } from './field-base';
import { SelectionField, HtmlRaw, Container, DateTime, AnchorOrButton, SaveButton, CancelButton, TabOrAccordionContainer,ParameterRetrieverField, TabNavButton, Spacer, Toggle } from './field-simple';
import { RecordMetadataRetrieverField } from './record-meta.component';
import { FormGroup, FormControl, FormArray } from '@angular/forms';
import * as _ from "lodash";
import moment from 'moment-es6';
declare var jQuery: any;
declare var window: any;
/**
 * A component base class
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 */
export class SimpleComponent {
  /**
   * Field model
   */
  @Input() public field: FieldBase<any>;
  /**
   * The form group
   */
  @Input() public form: FormGroup;
  /**
   * The field mapping
   */
  @Input() public fieldMap: any;
  /**
   * The index of this field
   */
  @Input() public index: any;
  /**
   * The name of this field
   */
  @Input() public name: any;

  @Input() isEmbedded: boolean = false;
  /**
   * The NG2 root injector
   */
  public injector: Injector;
  /**
   * Toggles help display
   */
  helpShow: boolean;

  /**
   * Optional parentId of this component
   */
  parentId: string;

  /**
   * Loaded flag
   */
  loaded: boolean;

  /**
   * Return the NG2 FormControl or subclass thereof
   * @param  {string = null} name
   * @return {FormControl}
   */
  public getFormControl(name: string = null, ctrlIndex: number = null):FormControl {
    let fc = null;
    if (_.isEmpty(name)) {
      name = this.name;
    }
    if (_.isEmpty(name)) {
      name = this.field.name;
    }
    if (this.fieldMap && this.field) {
      // console.log(name);
      fc = this.field.getControl(name, this.fieldMap);
    }
    if (!_.isNull(ctrlIndex) && !_.isUndefined(ctrlIndex)) {
      if (!_.isNull(fc.controls) && !_.isUndefined(fc.controls)) {
        fc = fc.controls[ctrlIndex];
      }
    } else
    if (this.index != null) {
      fc = fc.controls[this.index];
    }
    if (name != this.field.name && !_.isEmpty(this.field.name) && !_.isUndefined(fc.controls)) {
      fc = fc.controls[this.field.name];
    }
    return fc;
  }
  /**
   * Returns the CSS class
   * @param  {string=null} fldName
   * @return {string}
   */
  public getGroupClass(fldName:string=null): string {
    return `${ this.field.groupClasses } form-group ${this.hasRequiredError() ? 'has-error' : '' }`;
  }
  /**
   * If this field has a 'required' error.
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   * @return {[type]}
   */
  public hasRequiredError():boolean {
    return (this.field.formModel ? this.field.formModel.touched && this.field.formModel.hasError('required') : false);
  }
  /**
   * Convenience method to toggle help mode.
   * @return {[type]}
   */
  public toggleHelp() {
    this.helpShow = !this.helpShow;
  }
  /**
   * Returns label
   * @return {string}
   */
  getRequiredLabelStr():string {
    return this.field.required ? '(*)' : '';
  }
  /**
   * Returns the NG2 root injector
   * @param  {any} token
   * @return {any}
   */
  getFromInjector(token:any): any {
    return this.injector.get(token);
  }
}

export class SelectionComponent extends SimpleComponent {
  field: SelectionField;

  getLabel(val: any): string {
    const opt = _.find(this.field.selectOptions, (opt)=> {
      return opt.value == val;
    });
    if (opt) {
      return opt.label;
    } else {
      return '';
    }
  }
}

@Component({
  selector: 'dropdownfield',
  template: `
  <div [formGroup]='form' *ngIf="field.editMode" [ngClass]="getGroupClass()">
     <label [attr.for]="field.name">
      {{field.label}} {{ getRequiredLabelStr()}}
      <button type="button" class="btn btn-default" *ngIf="field.help" (click)="toggleHelp()" [attr.aria-label]="'help' | translate "><span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button>
     </label><br/>
     <span id="{{ 'helpBlock_' + field.name }}" class="help-block" *ngIf="this.helpShow" [innerHtml]="field.help"></span>
     <select [formControl]="getFormControl()"  [id]="field.name" [ngClass]="field.cssClasses">
        <option *ngFor="let opt of field.selectOptions" [value]="opt.value">{{opt.label}}</option>
     </select>
     <div class="text-danger" *ngIf="getFormControl().hasError('required') && getFormControl().touched && !field.validationMessages?.required">{{field.label}} is required</div>
     <div class="text-danger" *ngIf="getFormControl().hasError('required') && getFormControl().touched && field.validationMessages?.required">{{field.validationMessages.required}}</div>
  </div>
  <div *ngIf="!field.editMode" class="key-value-pair">
    <span class="key" *ngIf="field.label">{{field.label}}</span>
    <span class="value">{{getLabel(field.value)}}</span>
  </div>
  `,
})
export class DropdownFieldComponent extends SelectionComponent {
  static clName = 'DropdownFieldComponent';
}

@Component({
  selector: 'selectionfield',
  template: `
  <div [formGroup]='form' *ngIf="field.editMode && field.visible" class="form-group">
     <span class="label-font">
      {{field.label}} {{ getRequiredLabelStr()}}
      <button type="button" class="btn btn-default" *ngIf="field.help" (click)="toggleHelp()" [attr.aria-label]="'help' | translate "><span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button>
     </span><br/>
     <span id="{{ 'helpBlock_' + field.name }}" class="help-block" *ngIf="this.helpShow" [innerHtml]="field.help"></span>
     <fieldset>
      <legend [hidden]="true"><span></span></legend>
        <span *ngFor="let opt of field.selectOptions">
          <!-- radio type hard-coded otherwise accessor directive will not work! -->
          <input *ngIf="isRadio()" type="radio" name="{{field.name}}" [id]="field.name + '_' + opt.value" [formControl]="getFormControl()" [value]="opt.value" [attr.disabled]="field.readOnly ? '' : null ">
          <input *ngIf="!isRadio()" type="{{field.controlType}}" name="{{field.name}}" [id]="field.name + '_' + opt.value" [value]="opt.value" (change)="onChange(opt, $event)" [attr.selected]="getControlFromOption(opt)" [attr.checked]="getControlFromOption(opt)" [attr.disabled]="field.readOnly ? '' : null ">
          <label for="{{field.name + '_' + opt.value}}" class="radio-label">{{ opt.label }}</label>
          <br/>
        </span>
     </fieldset>
     <div class="text-danger" *ngIf="getFormControl().hasError('required') && getFormControl().touched && !field.validationMessages?.required">{{field.label}} is required</div>
     <div class="text-danger" *ngIf="getFormControl().hasError('required') && getFormControl().touched && field.validationMessages?.required">{{field.validationMessages.required}}</div>
  </div>
  <div *ngIf="!field.editMode" class="key-value-pair">
    <ng-container *ngIf="isRadio()">
      <span *ngIf="field.label" class="key">{{field.label}}</span>
      <span class="value">{{getLabel(field.value)}}</span>
    </ng-container>
    <ng-container *ngIf="!isRadio()">
      <span *ngIf="field.label" class="key">{{field.label}}</span>
      <span class="value" *ngIf="!isValArray()">{{getLabel(field.value)}}</span>
      <ng-container *ngIf="isValArray()">
        <div class="value" *ngFor="let val of field.value">
          {{getLabel(val)}}
        </div>
      </ng-container>
    </ng-container>

  </div>
  `,
})
export class SelectionFieldComponent extends SelectionComponent {
  static clName = 'SelectionFieldComponent';

  isValArray() {
    return _.isArray(this.field.value);
  }

  isRadio() {
    return this.field.controlType == 'radio';
  }

  getControlFromOption(opt: any) {
    const control = _.find(this.getFormControl()['controls'], (ctrl) => {
      return opt.value == ctrl.value;
    });
    return control;
  }

  onChange(opt:any, event:any) {
    let formcontrol:any = this.getFormControl();
    if (event.target.checked) {
      formcontrol.push(new FormControl(opt.value));
    } else {
      let idx = null;
      _.forEach(formcontrol.controls, (ctrl, i) => {
        if (ctrl.value == opt.value) {
          idx = i;
          return false;
        }
      });
      formcontrol.removeAt(idx);
    }
  }
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
            <dmp-field *ngFor="let field of tab.fields" [field]="field" [form]="form" class="form-row" [fieldMap]="fieldMap" [parentId]="tab.id"></dmp-field>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div *ngIf="!field.editMode" [ngClass]="field.accContainerClass">
    <div class="panel-group">
      <a href="#" (click)="expandCollapseAll(); false">Expand/Collapse all</a>
      <div *ngFor="let tab of field.fields" [ngClass]="field.accClass">
        <div class="panel-heading">
          <span class="panel-title tab-header-font">
            <a data-toggle="collapse" href="#{{tab.id}}">
              {{ tab.expandedChar }} {{ tab.label }}
            </a>
          </span>
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
  field: TabOrAccordionContainer;

  constructor(private changeRef: ChangeDetectorRef) {
    super();
  }

  ngAfterViewInit() {
    let that = this;
    _.each(this.field.fields, tab => {
        tab['expandedChar'] = '+';
        jQuery(`#${tab.id}`).on('shown.bs.collapse', ()=> {
          tab["expandedChar"] = '-';
          that.changeRef.detectChanges();
          that.field.onAccordionCollapseExpand.emit({shown:true, tabId: tab.id});
        });
        jQuery(`#${tab.id}`).on('hidden.bs.collapse', ()=> {
          tab["expandedChar"] = '+';
          that.changeRef.detectChanges();
          that.field.onAccordionCollapseExpand.emit({shown:false, tabId: tab.id});
        });
    });

    if(!this.field.editMode && this.field.expandAccordionsOnOpen) {
      this.field.allExpanded = false;
      this.expandCollapseAll();
    }
  }

  expandCollapseAll() {
    if(this.field.allExpanded) {
      _.each(this.field.fields, tab => {
          jQuery(`#${tab.id}`).collapse('hide');
      });
      this.field.allExpanded = false;
    } else {
      _.each(this.field.fields, tab => {
          jQuery(`#${tab.id}`).collapse('show');
      });
      this.field.allExpanded = true;
    }
    return false;
  }
}

@Component({
  selector: 'buttonbarcontainer',
  template: `
    <div *ngIf="field.editMode" class="form-row">
      <div class="pull-right col-md-10">
      <dmp-field *ngFor="let field1 of field.fields" [field]="field1" [form]="form" class="form-row" [fieldMap]="fieldMap"></dmp-field>
    </div>
  `
})
export class ButtonBarContainerComponent extends SimpleComponent {

}

// Break in case of an emergency....
@Component({
  selector: 'htmlraw',
  template: `
  <span *ngIf="field.visible" [innerHtml]="field.value"></span>
  `,
})
export class HtmlRawComponent extends SimpleComponent {
  field: HtmlRaw;

}
// For creating text blocks with help sections?
@Component({
  selector: 'text-block',
  template: `
  <div *ngIf="field.visible" [ngSwitch]="field.type">
    <span *ngSwitchCase="'h1'" [ngClass]="field.cssClasses">{{field.value}}</span>
    <span *ngSwitchCase="'h2'" [ngClass]="field.cssClasses">{{field.value}}</span>
    <span *ngSwitchCase="'h3'" [ngClass]="field.cssClasses">{{field.value}}</span>
    <span *ngSwitchCase="'h4'" [ngClass]="field.cssClasses">{{field.value}}</span>
    <span *ngSwitchCase="'h5'" [ngClass]="field.cssClasses">{{field.value}}</span>
    <span *ngSwitchCase="'h6'" [ngClass]="field.cssClasses">{{field.value}}</span>
    <hr *ngSwitchCase="'hr'" [ngClass]="field.cssClasses">
    <span *ngSwitchCase="'span'" [ngClass]="field.cssClasses">{{field.value}}</span>
    <p *ngSwitchDefault [ngClass]="field.cssClasses">{{field.value}}</p>
  </div>
  `,
})
export class TextBlockComponent extends SimpleComponent {
  field: Container;
  static clName = 'TextBlockComponent';
}


/**
* #### Save Button Component.
*
* Calls the form framework's save function to create or update the record.
*
* #### Usage
* ```
*     {
*          class: "SaveButton",
*          definition: {
*            label: 'Save & Close',
*            closeOnSave: true,
*            redirectLocation: '/@branding/@portal/dashboard'
*          }
*        }
* ```
*
*| Property Name       | Description                                                    | Required | Default |
*|---------------------|----------------------------------------------------------------|----------|---------|
*| label               | The text to display on the button                              | Yes      |         |
*| closeOnSave         | Flag to leave the page on successful save                      | No       | false   |
*| redirectLocation    | The location to redirect to if closeOnSave flag is set to true | No       |         |
*/
@Component({
  selector: 'save-button',
  template: `
    <button type="button" (click)="onClick($event)" class="btn" [ngClass]="field.cssClasses" [disabled]="!fieldMap._rootComp.needsSave || fieldMap._rootComp.isSaving()">{{field.label}}</button>
    <div *ngIf="field.confirmationMessage" class="modal fade" id="{{ field.name }}_confirmation" tabindex="-1" role="dialog" >
      <div class="modal-dialog" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
            <h4 class="modal-title" id="{{ field.name }}_confirmation_label" [innerHtml]="field.confirmationTitle"></h4>
          </div>
          <div class="modal-body" [innerHtml]="field.confirmationMessage"></div>
          <div class="modal-footer">
            <button (click)="hideConfirmDlg()" type="button" class="btn btn-default" data-dismiss="modal" [innerHtml]="field.cancelButtonMessage"></button>
            <button (click)="doAction()" type="button" class="btn btn-primary" [innerHtml]="field.confirmButtonMessage"></button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class SaveButtonComponent extends SimpleComponent {
  public field: SaveButton;

  public onClick(event: any) {
    if (this.field.confirmationMessage) {
      this.showConfirmDlg();
      return;
    }
    this.doAction();
  }

  showConfirmDlg() {
    jQuery(`#${this.field.name}_confirmation`).modal('show');
  }

  hideConfirmDlg() {
    jQuery(`#${this.field.name}_confirmation`).modal('hide');
  }

  public doAction() {
    var successObs = null;
    if (this.field.isDelete) {
      successObs = this.fieldMap._rootComp.delete();
    } else {
      successObs = this.field.targetStep ?
      this.fieldMap._rootComp.onSubmit(this.field.targetStep, false, this.field.additionalData)
      : this.fieldMap._rootComp.onSubmit(null, false, this.field.additionalData);
    }
    successObs.subscribe( status =>  {
      if (status) {
        if (this.field.closeOnSave == true) {
          window.location.href= this.field.redirectLocation;
        }
      }
      if (this.field.confirmationMessage) {
        this.hideConfirmDlg();
      }
    });

  }
}

/**
* # Cancel Button Component
*
* #### Button designed to
*  @param  {CancelButton} cancelButton
*   @return {FormControl}
*/
@Component({
  selector: 'cancel-button',
  template: `
    <button type="button" class="btn btn-warning" [disabled]="fieldMap._rootComp.isSaving()" (click)="fieldMap._rootComp.onCancel()">{{field.label}}</button>
  `,
})
export class CancelButtonComponent extends SimpleComponent {
  public field: CancelButton;

}


@Component({
  selector: 'anchor-button',
  template: `
  <button *ngIf="field.controlType=='button'" type="{{field.type}}" [ngClass]="field.cssClasses" (click)="onClick($event)" [disabled]="isDisabled()">{{field.label}}</button>
  <a *ngIf="field.controlType=='anchor'" href='{{field.value}}' [ngClass]="field.cssClasses" ><span *ngIf="field.showPencil" class="glyphicon glyphicon-pencil">&nbsp;</span>{{field.label}}</a>
  <a *ngIf="field.controlType=='htmlAnchor'" href='{{field.value}}' [ngClass]="field.cssClasses" [innerHtml]="field.anchorHtml"></a>
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
  selector: 'tab-nav-button',
  template: `
    <button type='button'[ngClass]='field.cssClasses' [disabled]="!field.getTabId(-1)" (click)="stepToTab(-1)" >{{field.prevLabel}}</button>
    <button type='button'[ngClass]='field.cssClasses' [disabled]="!field.getTabId(1)" (click)="stepToTab(1)" >{{field.nextLabel}}</button>
  `,
})
export class TabNavButtonComponent extends SimpleComponent {
  public field: TabNavButton;

  constructor(private changeRef: ChangeDetectorRef) {
    super();
  }

  ngOnInit() {
    this.field.getTabs();
    jQuery('a[data-toggle="tab"]').on('shown.bs.tab', (e) => {
      const tabId = e.target.href.split('#')[1];
      this.field.currentTab = tabId;
      this.changeRef.detectChanges();
    })
  }

  ngAfterViewInit() {
    const focusTabId = this.getUrlParameter('focusTabId');
    if (!_.isEmpty(focusTabId)) {
      this.fieldMap._rootComp.gotoTab(focusTabId);
    }
  }

  public stepToTab(step: number) {
    const tabId = this.field.getTabId(step);
    if (tabId) {
      this.fieldMap._rootComp.gotoTab(tabId);
    } else {
      console.log(`Invalid tab: ${tabId}`);
    }
  }

  getUrlParameter(param:string) {
    var pageURL = decodeURIComponent(window.location.search.substring(1)),
        urlVariables = pageURL.split('&'),
        parameterName,
        i;

    for (i = 0; i < urlVariables.length; i++) {
        parameterName = urlVariables[i].split('=');

        if (parameterName[0] === param) {
            return parameterName[1] === undefined ? null : parameterName[1];
        }
    }
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
    <input type="hidden" name="{{field.name}}" [formControl]="getFormControl()" />
  </div>
  `,
})
export class HiddenValueComponent extends SimpleComponent {

  handleChange(value: any, source: string) {
    console.log(`Hidden Value change: ${source}`);
    console.log(value);
    let targetVal = null;
    if (_.isArray(value)) {
      targetVal = [];
      _.forEach(value, (v:any)=> {
        let tVal = '';
        _.forEach(this.field.onChange.control.subFields, (subField:string) => {
          tVal = `${_.isEmpty(tVal) ? tVal : `${tVal}${this.field.onChange.control.delim}`}${v[subField]}`;
        });
        targetVal.push(tVal);
      });
    }
    this.getFormControl().setValue(targetVal, this.field.onChange.updateConf);
    console.log(`Form now has value:`);
    console.log(this.form.value);
  }


}

/**
Wrapped: https://github.com/nkalinov/ng2-datetime
Based on: https://bootstrap-datepicker.readthedocs.io/en/stable/
*/
@Component({
  selector: 'date-time',
  template: `
  <div *ngIf="field.editMode" [formGroup]='form' class="form-group">
    <span class="label-font">
      {{field.label}} {{ getRequiredLabelStr()}}
      <button type="button" class="btn btn-default" *ngIf="field.help" (click)="toggleHelp()" [attr.aria-label]="'help' | translate "><span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button>
    </span><br/>
    <span id="{{ 'helpBlock_' + field.name }}" class="help-block" *ngIf="this.helpShow" [innerHtml]="field.help"></span>
    <datetime #dateTime [formControl]="getFormControl()" [timepicker]="field.timePickerOpts" [datepicker]="field.datePickerOpts" [hasClearButton]="field.hasClearButton"></datetime>
    <div *ngIf="field.required" [style.visibility]="getFormControl() && getFormControl().hasError('required') && getFormControl().touched ? 'inherit':'hidden'">
      <div class="text-danger" *ngIf="!field.validationMessages?.required">{{field.label}} is required</div>
      <div class="text-danger" *ngIf="field.validationMessages?.required">{{field.validationMessages.required}}</div>
    </div>
  </div>
  <li *ngIf="!field.editMode" class="key-value-pair">
    <span class="key" *ngIf="field.label">{{field.label}}</span>
    <span class="value">{{field.formatValueForDisplay()}}</span>
  </li>
  `
})
export class DateTimeComponent extends SimpleComponent {
  /**
   * The field model
   */
  public field: DateTime;

  @ViewChild('dateTime') public dateTime: any;

  ngAfterViewInit() {
    if (this.field.editMode) {
      jQuery(`#${this.dateTime.idDatePicker}`).attr('aria-label', this.field.label);
    }
  }
  /**
   * Component method that formats the value, delegates to field.
   */
  formatValue() {
    return this.field.formatValue(this.getFormControl().value);
  }

}

@Component({
  selector: 'parameter-retriever',
  template: `
  <div>

  </div>
  `,
})
export class ParameterRetrieverComponent extends SimpleComponent implements AfterViewInit {
  field: ParameterRetrieverField;

  ngAfterViewInit() {
    const paramValue = this.getUrlParameter(this.field.parameterName);
    if(paramValue){
      this.field.publishParameterValue(paramValue);
    }
  }

  getUrlParameter(param:string) {
    var pageURL = decodeURIComponent(window.location.search.substring(1)),
        urlVariables = pageURL.split('&'),
        parameterName,
        i;

    for (i = 0; i < urlVariables.length; i++) {
        parameterName = urlVariables[i].split('=');

        if (parameterName[0] === param) {
            return parameterName[1] === undefined ? true : parameterName[1];
        }
    }
}
}

@Component({
  selector: 'spacer',
  template: `
  <span [style.display]="'inline-block'" [style.width]="field.width" [style.height]="field.height">&nbsp;</span>
  `,
})
export class SpacerComponent extends SimpleComponent {
  field: Spacer;

}

@Component({
  selector: 'toggle',
  template: `
    <div *ngIf="field.type == 'checkbox'" [formGroup]='form'>
      <input type="checkbox" name="{{field.name}}" [id]="field.name" [formControl]="getFormControl()" [attr.disabled]="field.editMode ? null : ''" >
      <label for="{{ field.name }}" class="radio-label">{{ field.label }} <button *ngIf="field.editMode && field.help" type="button" class="btn btn-default" (click)="toggleHelp()" [attr.aria-label]="'help' | translate "><span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button></label>
      <span id="{{ 'helpBlock_' + field.name }}" class="help-block" *ngIf="this.helpShow" [innerHtml]="field.help"></span>
    </div>
  `
})
export class ToggleComponent extends SimpleComponent {
  field: Toggle;

}
