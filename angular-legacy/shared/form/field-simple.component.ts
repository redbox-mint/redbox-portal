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

import {
  Input,
  Component,
  ViewChild,
  ViewContainerRef,
  OnInit,
  Injector,
  AfterViewInit,
  AfterViewChecked,
  ChangeDetectorRef
} from '@angular/core';
import {
  FieldBase
} from './field-base';
import {
  SelectionField,
  HtmlRaw,
  Container,
  DateTime,
  AnchorOrButton,
  SaveButton,
  CancelButton,
  TabOrAccordionContainer,
  ParameterRetrieverField,
  TabNavButton,
  Spacer,
  Toggle
} from './field-simple';
import {
  RecordMetadataRetrieverField
} from './record-meta.component';
import {
  FormGroup,
  FormControl,
  FormArray
} from '@angular/forms';
import * as _ from "lodash";
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
  @Input() public field: FieldBase < any > ;
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
  public getFormControl(name: string = null, ctrlIndex: number = null): FormControl {
    let fc = null;
    if (_.isEmpty(name)) {
      name = this.name;
    }
    if (_.isEmpty(name)) {
      name = this.field.name;
    }
    //  check first it's within a group, return directly
    if (!_.isEmpty(this.field.parentField)) {
      fc = this.field.formModel;
    } else {
      try {
        // using the field map, the legacy behaviour
        // TODO: during NG upgrade, review code block below
        if (this.fieldMap && this.field) {
          fc = this.field.getControl(name, this.fieldMap);
        }
        if (!_.isEmpty(fc)) {
          if (!_.isNull(ctrlIndex) && !_.isUndefined(ctrlIndex)) {
            if (!_.isNull(fc.controls) && !_.isUndefined(fc.controls)) {
              fc = fc.controls[ctrlIndex];
            }
          } else if (this.index != null) {
            fc = fc.controls[this.index];
          }
          if (name != this.field.name && !_.isEmpty(this.field.name) && !_.isUndefined(fc.controls)) {
            fc = fc.controls[this.field.name];
          }
        }
      } catch (e) {
        // swallow the error, potential config issue will be dealt later on
      }
      // END TODO
    }
    // check if fc is still null
    if (_.isEmpty(fc)) {
      if (!this.field.hasRuntimeConfigWarning) {
        // since we're no longer caching the FC:
        // only display once so as not to flood the console
        console.warn(`Warning: Unable to retrieve '${name}' formControl. It seems to be nested? Returning 'field.formModel' by default instead of null`);
      }
      this.field.hasRuntimeConfigWarning = true;
      fc = this.field.formModel;
    }
    return fc;
  }

  /**
   * Returns the CSS class
   * @param  {string=null} fldName
   * @return {string}
   */
  public getGroupClass(fldName: string = null): string {
    return `${ this.field.groupClasses } form-group ${this.hasRequiredError() ? 'has-error' : '' }`;
  }
  /**
   * If this field has a 'required' error.
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   * @return {[type]}
   */
  public hasRequiredError(): boolean {
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
  getRequiredLabelStr(): string {
    return this.field.required ? this.field.requiredFieldIndicator : '';
  }
  /**
   * Returns the NG2 root injector
   * @param  {any} token
   * @return {any}
   */
  getFromInjector(token: any): any {
    return this.injector.get(token);
  }
}

export class SelectionComponent extends SimpleComponent {
  field: SelectionField;

  getLabel(val: any): string {
    if (_.isEmpty(val)) {
      return '';
    }
    const opt = _.find(this.field.selectOptions, (opt) => {
      return opt.value == val;
    });
    if (opt) {
      return opt.label;
    } else {
      return '';
    }
  }

  isOptionAvailable(val: any, opt:any): boolean {

    let historicalOnly = _.get(opt, 'historicalOnly');

    //If the field has no value selected all historical only options are hidden
    if (_.isEmpty(val) && historicalOnly) {
      return false;

    } else if(!_.isEmpty(val) && historicalOnly) {

      //If the field has a historical only value selected then that particualr
      //historical only option becomes available
      let currValMatchHistOnlyValue = false;
      for(let currentOption of this.field.selectOptions) {
        let histOnly = _.get(currentOption, 'historicalOnly');
        //handle dropdown and radio
        if(!_.isArray(val)) {
          if(histOnly && currentOption.value == val) {
            currValMatchHistOnlyValue = true;
            break;
          }
        } else {
          //handle checkbox
          for(let v of val) {
            if(histOnly && v == currentOption.value) {
              currValMatchHistOnlyValue = true;
              break;
            }
          }
        }
      }

      if(currValMatchHistOnlyValue) {
        return true;
      } else {
        return false;
      }

    } else {
      //If it's not historical only then the option is always available
      return true;
    }
  }

  findAvailableOptions(val: any): any[] {

    let availableOptions: any[] = [];

    for(let option of this.field.selectOptions) {

      if(this.isOptionAvailable(val, option)) {
        availableOptions.push(option);
      }
    }

    return availableOptions;
  }
}

@Component({
  selector: 'dropdownfield',
  template: `
  <div [formGroup]='form' *ngIf="field.editMode && field.visible" [ngClass]="getGroupClass()">
     <label [attr.for]="field.name">
     <span [outerHTML]="field.label"></span><span class="form-field-required-indicator" [innerHTML]="getRequiredLabelStr()"></span>
      <button type="button" class="btn btn-default" *ngIf="field.help" (click)="toggleHelp()" [attr.aria-label]="'help' | translate "><span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button>
     </label><br/>
     <span id="{{ 'helpBlock_' + field.name }}" class="help-block" *ngIf="this.helpShow" [innerHtml]="field.help"></span>
     <select [compareWith]="field.compare" [formControl]="getFormControl()"  [id]="field.name" [ngClass]="field.cssClasses">
        <ng-template [ngIf]="!field.storeValueAndLabel">
          <option *ngFor="let opt of findAvailableOptions(field.value)" [value]="opt.value">
              {{opt.label}}
          </option>
        </ng-template>
        <ng-template [ngIf]="field.storeValueAndLabel">
          <option *ngFor="let opt of findAvailableOptions(field.value)" [ngValue]="opt">
              {{opt.label}}
          </option>
        </ng-template>
     </select>
     <div class="text-danger" *ngIf="getFormControl() && getFormControl().hasError('required') && getFormControl().touched && !field.validationMessages?.required">{{field.label}} is required</div>
     <div class="text-danger" *ngIf="getFormControl() && getFormControl().hasError('required') && getFormControl().touched && field.validationMessages?.required">{{field.validationMessages.required}}</div>
  </div>
  <div *ngIf="!field.editMode && field.visible" class="key-value-pair">
    <span class="key" *ngIf="field.label">{{field.label}}</span>
    <ng-template [ngIf]="!field.storeValueAndLabel">
    <span *ngIf="!field.valueIsLink" class="value">{{getLabel(field.value)}}</span>
    <a *ngIf="field.valueIsLink" href="{{field.value}}" target="_blank" rel="noopener noreferrer" class="value">{{getLabel(field.value)}}</a>
    </ng-template>
    <ng-template [ngIf]="field.storeValueAndLabel && field.value.value != ''">
    <span class="value">{{getLabel(field.value.value)}}</span>
    </ng-template>
  </div>
  `,
})
export class DropdownFieldComponent extends SelectionComponent {
  static clName = 'DropdownFieldComponent';
}

@Component({
  selector: 'selectionfield',
  template: `
  <div [formGroup]='getFormGroup()' *ngIf="field.editMode && field.visible" class="form-group">
     <span class="label-font">
     <span [outerHTML]="field.label"></span><span class="form-field-required-indicator" [innerHTML]="getRequiredLabelStr()"></span>
      <button type="button" class="btn btn-default" *ngIf="field.help" (click)="toggleHelp()" [attr.aria-label]="'help' | translate "><span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button>
     </span><br/>
     <span id="{{ 'helpBlock_' + field.name }}" class="help-block" *ngIf="this.helpShow" [innerHtml]="field.help"></span>
     <fieldset [ngClass]="field.fieldSetCssClasses">
      
        <div *ngFor="let opt of findAvailableOptions(field.value)" [ngClass]="field.controlGroupCssClasses">
          <!-- radio type hard-coded otherwise accessor directive will not work! -->
          <!-- the ID and associated label->for property is now delegated to a Fn rather than inline-templated here, to make it optional, e.g. if it is nested -->
          <input *ngIf="isRadio()" type="radio" [id]="getInputId(opt)" [formControlName]="field.name" [value]="opt.value" [attr.disabled]="field.readOnly ? '' : null " [ngClass]="field.controlInputCssClasses">
          <input *ngIf="!isRadio()" type="{{field.controlType}}" name="{{field.name}}" [id]="getInputId(opt)" [value]="opt.value" (change)="onChange(opt, $event)" [ngClass]="field.controlInputCssClasses" [attr.selected]="getCheckedFromOption(opt)" [checked]="getCheckedFromOption(opt)" [attr.disabled]="field.readOnly ? '' : null ">
          <label [attr.for]="getInputId(opt)" class="radio-label" [ngClass]="field.controlLabelCssClasses" [innerHtml]="opt.label"></label>
          
        </div>
     </fieldset>
     <div class="text-danger" *ngIf="hasRequiredError() && !field.validationMessages?.required">{{field.label}} is required</div>
     <div class="text-danger" *ngIf="hasRequiredError() && field.validationMessages?.required">{{field.validationMessages.required}}</div>
  </div>
  <div *ngIf="!field.editMode && field.visible" class="key-value-pair">
    <ng-container *ngIf="isRadio()">
      <span *ngIf="field.label" [innerHtml]="field.label" class="key"></span>
      <span class="value" [innerHtml]="getLabel(field.value)"></span>
    </ng-container>
    <ng-container *ngIf="!isRadio()">
      <span *ngIf="field.label" [innerHtml]="field.label" class="key"></span>
      <span class="value" *ngIf="!isValArray()" [innerHtml]="getLabel(field.value)"></span>
      <ng-container *ngIf="isValArray()">
        <div class="value" *ngFor="let val of field.value" [innerHtml]="getLabel(val)">
        </div>
      </ng-container>
    </ng-container>

  </div>
  <div *ngIf="field.editMode" class="modal fade" tabindex="-1" role="dialog" aria-labelledby="selectionComponent" aria-hidden="true" id="{{ 'modal_' + field.name }}">
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h4 class="modal-title">{{field.confirmChangesLabel}}</h4>
          <p>{{field.confirmChangesParagraphLabel}}</p>
          <p *ngFor="let f of defer.fields">
            <strong>{{f.label}}</strong><br/>
            {{f.valueLabel}}
          </p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-default" (click)="confirmChange(true)">Yes</button>
          <button type="button" class="btn btn-primary" (click)="confirmChange(false)">No</button>
        </div>
      </div>
    </div>
  </div>
  `,
})
export class SelectionFieldComponent extends SelectionComponent {
  static clName = 'SelectionFieldComponent';
  fg: any;
  defer: any = {};
  defered: boolean = false;
  confirmChanges: boolean = true;
  /**
   * Allows radio buttons and checkboxes to use a custom form group. Useful when radio buttons are nested within repeatables.
   *
   * @returns the FormGroup for this selection field
   */
  getFormGroup() {
    if (_.isEmpty(this.fg)) {
      if (!_.isEmpty(this.field.useFormGroup)) {
        this.fg = _.get(this.field, this.field.useFormGroup);
        if (_.isEmpty(this.fg)) {
          console.warn(`Radio button '${this.field.name}' has custom form group: '${this.field.useFormGroup}', but path resolved to an empty value. Failing softly by defaulting to 'this.form'. If you are still in active form configuration development, please check if 'useFormGroup' path is valid.`);
          this.fg = this.form;
        }
      } else {
        this.fg = this.form;
      }
    }
    return this.fg;
  }

  isValArray() {
    return _.isArray(this.field.value) || this.field.controlType == 'checkbox';
  }

  isRadio() {
    return this.field.controlType == 'radio';
  }

  getControlFromOption(opt: any) {
    const fc = this.field.formModel;
    let control = _.find(fc['controls'], (ctrl) => {
      return opt.value == ctrl.value;
    });
    return control;
  }

  getCheckedFromOption(opt: any) {
    let control = this.getControlFromOption(opt);
    const checked = !_.isUndefined(control);
    return checked;
  }

  onChange(opt: any, event: any, defered) {
    defered = defered || !_.isUndefined(defered);
    let formcontrol: any = this.field.formModel;
    if (event.target.checked) {
      if(_.isObject(formcontrol.push)) {
        formcontrol.push(new FormControl(opt.value));
      } else if(this.isRadio()) {
        // modifies defers the changes on radio
        if(opt['modifies'] && !defered) {
          this.modifies(opt, event, defered);
        } else {
          defered = true;
        }
      }
    } else {
      if(opt['modifies'] && !defered) {
        this.modifies(opt, event, defered);
      }
      if(!defered) {
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
    if(this.field.publish && this.confirmChanges) {
      if(this.field.publish.onItemSelect) {
        this.field.onItemSelect.emit({value: opt['publishTag'], checked: event.target.checked, defered: defered});
      }
      if(this.field.publish.onValueUpdate) {
        this.field.onValueUpdate.emit({value: opt['publishTag'], checked: event.target.checked, defered: defered});
      }
    }
  }

  modifies(opt, event, defered) {
    this.confirmChanges = true;
    const fieldName = this.field['name'];
    let fields = this.fieldMap;
    this.defer['fields'] = new Array();
    _.each(opt['modifies'], e => {
      const contval = this.fieldMap[e].control.value;
      //this.fieldMap[e].control.getRawValue();
      if(!_.isEmpty(contval) || contval === true) {
        jQuery(`#modal_${fieldName}`).modal({backdrop: 'static', keyboard: false, show: true});
        this.defer['opt'] = opt;
        this.defer['event'] = event;
        this.defer['fields'].push(this.field.getFieldDisplay(this.fieldMap[e]));
        this.confirmChanges = false;
      }
    });
    if(this.confirmChanges) {
      this.defer = {};
      this.onChange(opt, event, true);
    }
  }

  confirmChange(doConfirm) {
    const fieldName = this.field['name'];
    jQuery(`#modal_${fieldName}`).modal('hide');
    this.confirmChanges = doConfirm;
    const defer = this.defer;
    if(this.isRadio()) {
      // modifies is not available for radio
      defer.event.target.checked = doConfirm;
      if(!doConfirm) {
        const revert = this.defer['opt']['revert']
        this.field.setValue(revert);
        defer.opt = _.find(this.field.options.options, {value: revert});
      }
    } else {
      defer.event.target.checked = !doConfirm;
    }
    this.defer = {};
    this.onChange(defer.opt, defer.event, true);
  }

  getInputId(opt) {
    let id = null;
    if (!this.field.disableOptionLabelsFor) {
      id = `${this.field.name}_${opt.value}`;
    }
    return id;
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
          <li *ngFor="let tab of field.fields"><a href="#{{tab.id}}" [ngClass]="{'active': tab.active}" data-bs-toggle="tab" role="tab">{{tab.label}}</a></li>
        </ul>
      </div>
      <div [ngClass]="field.tabContentContainerClass">
        <div [ngClass]="field.tabContentClass">
      <!--
      Inlined the tab definition instead of creating it's own component otherwise Bootstrap refuses to toggle the panes
      Likely because of the extra DOM node (component selector) that it doesn't know what to do.
      TODO: remove inlining, or perhaps consider a 3rd-party NG2 tab component
      -->
        <ng-container *ngFor="let tab of field.fields" >
          <div *ngIf="tab.visible" [ngClass]="{'tab-pane': true, 'fade': true, 'active': tab.active==true, 'in': tab.active==true}" id="{{tab.id}}">
            <dmp-field *ngFor="let field of tab.fields" [field]="field" [form]="form" class="form-row" [fieldMap]="fieldMap" [parentId]="tab.id"></dmp-field>
          </div>
        </ng-container>
        </div>
      </div>
    </div>
  </div>
  <div *ngIf="!field.editMode" [ngClass]="field.accContainerClass">
    <div class="panel-group">
      <a href="#" class="main-expand-collapse" (click)="expandCollapseAll(); false">Expand/Collapse all</a>
      <div *ngFor="let tab of field.fields" [ngClass]="field.accClass">
        <ng-container *ngIf="tab.visible">
          <div class="panel-heading">
            <span class="panel-title tab-header-font">
              <a data-bs-toggle="collapse" href="#{{tab.id}}">
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
        </ng-container>
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
      jQuery(`#${tab.id}`).on('shown.bs.collapse', () => {
        tab["expandedChar"] = '-';
        that.changeRef.detectChanges();
        that.field.onAccordionCollapseExpand.emit({
          shown: true,
          tabId: tab.id
        });
      });
      jQuery(`#${tab.id}`).on('hidden.bs.collapse', () => {
        tab["expandedChar"] = '+';
        that.changeRef.detectChanges();
        that.field.onAccordionCollapseExpand.emit({
          shown: false,
          tabId: tab.id
        });
      });
    });

    if (!this.field.editMode && this.field.expandAccordionsOnOpen) {
      this.field.allExpanded = false;
      this.expandCollapseAll();
    }
  }

  expandCollapseAll() {
    if (this.field.allExpanded) {
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
  <span *ngIf="field.visible" [innerHtml]="field.value" [ngClass]="field.cssClasses"></span>
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
    <span *ngSwitchCase="'h1'" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
    <span *ngSwitchCase="'h2'" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
    <span *ngSwitchCase="'h3'" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
    <span *ngSwitchCase="'h4'" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
    <span *ngSwitchCase="'h5'" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
    <span *ngSwitchCase="'h6'" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
    <hr *ngSwitchCase="'hr'" [ngClass]="field.cssClasses">
    <span *ngSwitchCase="'span'" [ngClass]="field.cssClasses">{{field.label == null? '' : field.label + ': '}}{{field.value == null? '' : field.value}}</span>
    <p *ngSwitchDefault [ngClass]="field.cssClasses" [innerHtml]="field.value == null? '' : field.value"></p>
    <button type="button" class="btn btn-default" *ngIf="field.editMode && field.help" (click)="toggleHelp()" [attr.aria-label]="'help' | translate "><span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button>
  </div>
  <div class="row" *ngIf="field.editMode && this.helpShow">
      <span id="{{ 'helpBlock_' + field.name }}" class="col-xs-12 help-block" [innerHtml]="field.help"></span>
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
 *| disableValidation   | Set if you want to manually disable the validation of the form | No       | false   |
 *| clickedValue        | Set if you want a save button to have a specific value         | No       | ''      |
 */
@Component({
  selector: 'save-button',
  template: `
    <ng-container *ngIf="field.visible">
      <button type="button" (click)="onClick($event)" class="btn" [ngClass]="field.cssClasses" [disabled]="(!fieldMap._rootComp.needsSave || fieldMap._rootComp.isSaving()) && !field.isSubmissionButton">{{field.label}}</button>
      <div *ngIf="field.confirmationMessage" class="modal fade" id="{{ field.name }}_confirmation" tabindex="-1" role="dialog" >
        <div class="modal-dialog" role="document">
          <div class="modal-content">
            <div class="modal-header">
              <button type="button" class="close" data-bs-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
              <h4 class="modal-title" id="{{ field.name }}_confirmation_label" [innerHtml]="field.confirmationTitle"></h4>
            </div>
            <div class="modal-body" [innerHtml]="field.confirmationMessage"></div>
            <div class="modal-footer">
              <button (click)="hideConfirmDlg()" type="button" class="btn btn-default" data-bs-dismiss="modal" [innerHtml]="field.cancelButtonMessage"></button>
              <button (click)="doAction()" type="button" class="btn btn-primary" [innerHtml]="field.confirmButtonMessage"></button>
            </div>
          </div>
        </div>
      </div>
    </ng-container>
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
      this.field.setValue(this.field.clickedValue);
      // passing the field's disableValidation setting from the form definition
      successObs = this.field.targetStep ?
        this.fieldMap._rootComp.onSubmit(this.field.targetStep, this.field.disableValidation, this.field.additionalData) :
        this.fieldMap._rootComp.onSubmit(null, this.field.disableValidation, this.field.additionalData);
    }
    successObs.subscribe(status => {
      if (status) {
        if (this.field.closeOnSave == true) {
          let location = this.field.redirectLocation;
          if (this.field.redirectLocation.indexOf('@oid') != -1) {
            let oid = this.field.fieldMap._rootComp.oid;
            location = this.field.redirectLocation.replace("@oid", oid)
          }
          window.location.href = location;
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
    <button type="button" class="btn btn-warning" [disabled]="fieldMap._rootComp.isSaving()" (click)="cancel()">{{field.label}}</button>
    <div *ngIf="field.confirmationMessage" class="modal fade" id="{{ field.name }}_confirmation" tabindex="-1" role="dialog" >
      <div class="modal-dialog" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <button type="button" class="close" data-bs-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
            <h4 class="modal-title" id="{{ field.name }}_confirmation_label" [innerHtml]="field.confirmationTitle"></h4>
          </div>
          <div class="modal-body" [innerHtml]="field.confirmationMessage"></div>
          <div class="modal-footer">
            <button (click)="hideConfirmDlg()" type="button" class="btn btn-default" data-bs-dismiss="modal" [innerHtml]="field.cancelButtonMessage"></button>
            <button (click)="doAction()" type="button" class="btn btn-primary" [innerHtml]="field.confirmButtonMessage"></button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class CancelButtonComponent extends SimpleComponent {
  public field: CancelButton;

  showConfirmDlg() {
    jQuery(`#${this.field.name}_confirmation`).modal('show');
  }

  hideConfirmDlg() {
    jQuery(`#${this.field.name}_confirmation`).modal('hide');
  }

  public cancel() {
    if (this.field.confirmationMessage != null && this.fieldMap._rootComp.needsSave) {
      this.showConfirmDlg();
    } else {
      this.doAction();
    }
  }

  public doAction() {
    this.fieldMap._rootComp.onCancel();
  }
}


@Component({
  selector: 'anchor-button',
  template: `
  <button *ngIf="field.controlType=='button' && field.visible" type="{{field.type}}" [ngClass]="field.cssClasses" (click)="onClick($event)" [disabled]="isDisabled()">{{field.label}}</button>
  <a *ngIf="field.controlType=='anchor' && field.visible && field.skip!==field.visible" href='{{field.value}}' [ngClass]="field.cssClasses" ><span *ngIf="field.showPencil" class="glyphicon glyphicon-pencil">&nbsp;</span>{{field.label}}</a>
  <a *ngIf="field.controlType=='htmlAnchor' && field.visible" href='{{field.value}}' [ngClass]="field.cssClasses" [innerHtml]="field.anchorHtml"></a>
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
    <span *ngIf="field.endDisplayMode == 'disabled'">
    <button type='button'[ngClass]='field.cssClasses' [disabled]="!field.getTabId(-1)" (click)="stepToTab(-1)" >{{field.prevLabel}}</button>
    <button type='button'[ngClass]='field.cssClasses' [disabled]="!field.getTabId(1)" (click)="stepToTab(1)" >{{field.nextLabel}}</button>
    </span>
    <span *ngIf="field.endDisplayMode == 'hidden'">
    <button type='button'[ngClass]='field.cssClasses' [style.display]="!field.getTabId(-1)?'none':'inherit'" (click)="stepToTab(-1)" >{{field.prevLabel}}</button>
    <button type='button'[ngClass]='field.cssClasses' [style.display]="!field.getTabId(1)?'none':'inherit'" (click)="stepToTab(1)" >{{field.nextLabel}}</button>
    </span>
  `,
})
export class TabNavButtonComponent extends SimpleComponent {
  public field: TabNavButton;

  constructor(private changeRef: ChangeDetectorRef) {
    super();
  }

  ngOnInit() {
    this.field.getTabs();
    jQuery('a[data-bs-toggle="tab"]').on('shown.bs.tab', (e) => {
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

  getUrlParameter(param: string) {
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
  <li *ngIf="isVisible()" class="key-value-pair padding-bottom-10">
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
      _.forEach(value, (v: any) => {
        let tVal = '';
        _.forEach(this.field.onChange.control.subFields, (subField: string) => {
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
  <ng-container *ngIf="field.visible">
  <div *ngIf="field.editMode" [formGroup]='form' class="form-group">
    <span class="label-font">
     <span [outerHTML]="field.label"></span><span class="form-field-required-indicator" [innerHTML]="getRequiredLabelStr()"></span>
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

  </ng-container>
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
    if (paramValue) {
      this.field.publishParameterValue(paramValue);
    }
  }

  getUrlParameter(param: string) {
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
