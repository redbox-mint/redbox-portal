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

import { Input, Component, OnInit, Output, EventEmitter } from '@angular/core';
import { SimpleComponent } from './field-simple.component';
import { VocabField } from './field-vocab.component';
import { Container } from './field-simple';
import { FormControl, FormArray, Validators } from '@angular/forms';
import * as _ from "lodash";
import { ChangeDetectorRef } from '@angular/core';
import { ContributorField } from './field-contributor.component';
/**
 * Repeatable Field Container
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
export class RepeatableContainer extends Container {
  addButtonText: string;
  removeButtonText: string;
  skipClone: string[];
  forceClone: any[];
  addButtonTextClass: any;
  removeButtonTextClass: any;
  addButtonClass: any;
  removeButtonClass: any;
  moveUpButtonClass: any;
  moveDownButtonClass: any;
  delegateErrorHandling: boolean;
  /**
   * Optional to set minimum entries required in a repeatable component and validates the value given is non negative 
   * and that maximumEntries >= minimumEntries. If not set defaults to a minimum value of 1 
   */
  minimumEntries: number;
  /**
   * Optional to set maximum entries allowed in a repeatable component and validates the value given is non negative 
   * and that maximumEntries >= minimumEntries. If not set defaults to maximum value of 1000
   */
  maximumEntries: number;
  /**
   * Optional, hide green plus button if set to false. If not present it will default to true, meaning the add button
   * will shown. This property is useful to show a list of values but not allow to add any more entries to the list
   */
  addButtonShow: boolean;
  allowZeroRows: boolean;
  hideWhenZeroRows: boolean;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.hasGroup = true;
    this.addButtonText = options['addButtonText'] || '';
    this.removeButtonText = options['removeButtonText'] || null;
    this.skipClone = options['skipClone'] || [];
    this.forceClone = options['forceClone'] || [];
    this.addButtonTextClass = options['addButtonTextClass'] || 'btn btn-success pull-right';
    this.addButtonClass = options['addButtonClass'] || 'fa fa-plus-circle btn text-20 pull-right btn-success';
    this.removeButtonTextClass = options['removeButtonTextClass'] || 'btn btn-danger pull-right';
    this.removeButtonClass = options['removeButtonClass'] || 'fa fa-minus-circle btn text-20 pull-right btn-danger';
    this.moveUpButtonClass = options['addButtonClass'] || 'fa fa-chevron-circle-up btn text-20 pull-left btn-primary';
    this.moveDownButtonClass = options['addButtonClass'] || 'fa fa-chevron-circle-down btn text-20 pull-left btn-primary';
    this.delegateErrorHandling = !_.isUndefined(options['delegateErrorHandling']) ? options['delegateErrorHandling'] : true;
    this.addButtonShow = !_.isUndefined(options['addButtonShow']) ? options['addButtonShow'] : true;
    this.allowZeroRows = !_.isUndefined(options['allowZeroRows']) ? options['allowZeroRows'] : false;
    this.hideWhenZeroRows = !_.isUndefined(options['hideWhenZeroRows']) ? options['hideWhenZeroRows'] : false;
    this.minimumEntries = (!_.isUndefined(options['minimumEntries']) && options['minimumEntries'] > 0) ? options['minimumEntries'] : 1;
    this.maximumEntries = (!_.isUndefined(options['maximumEntries']) && options['maximumEntries'] > 0) ? options['maximumEntries'] : 1000;
    //Validate that maximumEntries is bigger or equal to minimumEntries
    if(this.maximumEntries < this.minimumEntries) {
      console.debug("minimumEntries "+this.minimumEntries+" cannot be bigger than maximumEntries "+this.maximumEntries
                    +" setting them to equal smallest value within the range given");
      this.minimumEntries = this.maximumEntries;
    }
    //Set the number of rows on first display if minimumEntries option has been set but also take into account
    //that defaultValue option may have been set and don't override if it has been set in the form config
    if(this.minimumEntries > 1 && _.isUndefined(options.defaultValue)) {
      let arrayWithEmptyValues = [];
      let i = 0;
      while ( i < this.minimumEntries) {
        arrayWithEmptyValues.push("");
        i++;
      }
      this.value = arrayWithEmptyValues;
    }
  }

  getInitArrayEntry() {
    let initArrayEntry = null;
    if (this.fields[0].isGroup) {
      // This is a repeatable container, we set the parentField automatically
      this.fields[0].setParentField = true;
      this.fields[0].parentField = this;
      const grp = {};
      const fm = {};
      const fg = this.fields[0].getGroup(grp, fm);
      initArrayEntry = [fg];
    } else {
      initArrayEntry = [this.fields[0].createFormModel()];
    }
    // propagate the event handler in the first entry
    this.fields[0].setupEventHandlers();
    return initArrayEntry;
  }

  getGroup(group: any, fieldMap: any) {
    this.fieldMap = fieldMap;
    fieldMap[this.name] = {field:this};
    if (!this.value || this.value.length == 0) {
      this.formModel = this.required ? new FormArray(this.getInitArrayEntry(), Validators.required) : new FormArray(this.getInitArrayEntry());
    } else {
      let fieldCtr = 0;
      const baseField = this.fields[0];
      const elems = [];
      this.fields = _.map(this.value, (valueElem:any) => {
        let fieldClone = null;
        if (fieldCtr == 0) {
          fieldClone = baseField;
          fieldClone.value = _.isArray(valueElem) ? valueElem[fieldCtr] : valueElem;
        } else {
          fieldClone = this.createNewElem(baseField, _.isArray(valueElem) ? valueElem[fieldCtr] : valueElem);
          fieldClone.value = _.isArray(valueElem) ? valueElem[fieldCtr] : valueElem;
        }
        fieldCtr++;
        elems.push(fieldClone.createFormModel());
        return fieldClone;
      });
      this.formModel = this.required ? new FormArray(elems, Validators.required) : new FormArray(elems);
      _.each(this.fields, f => {
        f.setupEventHandlers();
      });
    }
    fieldMap[this.name].control = this.formModel;
    if (this.groupName) {
      if (group[this.groupName]) {
        group[this.groupName].addControl(this.name, this.formModel);
      } else {
        const fg = {};
        fg[this.name] = this.formModel;
        group[this.groupName] = fg;
      }
    } else {
      group[this.name] = this.formModel;
    }
  }

  createNewElem(baseFieldInst: any, value:any = null) {
    const newOpts = _.cloneDeep(baseFieldInst.options);
    newOpts.value = value;
    const newInst = new baseFieldInst.constructor(newOpts, this.injector);
    _.forEach(this.skipClone, (f: any)=> {
      newInst[f] = null;
    });

    _.forEach(this.forceClone, (f: any) => {
      if (_.isString(f)) {
        newInst[f] = _.cloneDeepWith(baseFieldInst[f], this.getCloneCustomizer(
          {
            skipClone: ['fields', 'fieldMap', 'formModel', 'injector', 'onValueUpdate', 'onValueLoaded', 'translationService', 'utilityService', 'componentReactors'],
            copy: ['fieldMap', 'injector', 'translationService', 'utilityService']
          }
        ));
      } else {
        newInst[f.field] = _.cloneDeepWith(baseFieldInst[f.field], this.getCloneCustomizer(f));
      }
    });

    if (_.isFunction(newInst.postInit)) {
      newInst.postInit(value);
    }
    if (newInst.setParentField) {
      newInst.parentField = this;
    }
    return newInst;
  }

  getCloneCustomizer(cloneOpts:any) {
    const that = this;
    return function(value: any, key: any) {
      if (_.includes(cloneOpts.skipClone, key) ) {
        if (_.includes(cloneOpts.copy, key)) {
          return that[key];
        }
        return false;
      }
    };
  }

  addElem(val:any = null) {
    const newElem = this.createNewElem(this.fields[0], val);
    if (val == null && _.isFunction(newElem.setEmptyValue)) {
      newElem.setEmptyValue();
    }
    const newFormModel = newElem.createFormModel();
    this.formModel.push(newFormModel);
    // Group component event handling: will need to set up event handlers within the new element
    newElem.setupEventHandlers();
    // finally, render in the UI
    newElem['arrayIndex'] = this.fields.length; 
    this.fields.push(newElem);
    return newElem;
  }

  removeElem(index: number) {
    _.remove(this.fields, (val:any, idx: number) => { return idx == index });
    this.formModel.removeAt(index);
  }

  swap(fromIdx, toIdx) {
    let temp = this.fields[toIdx];
    this.fields[toIdx] = this.fields[fromIdx];
    this.fields[fromIdx] = temp;
    temp = this.formModel.at(toIdx);
    this.formModel.setControl(toIdx, this.formModel.at(fromIdx));
    this.formModel.setControl(fromIdx, temp);
  }

  setValueAtElem(index, value:any) {
    this.fields[index].setValue(value, true);
  }

  public triggerValidation() {
    _.forEach(this.fields, (f:any) => {
      f.triggerValidation();
    });
  }

  public reactEvent(eventName: string, eventData: any, origData: any) {
    console.log(`Repeatable container field reacting: ${eventName}`);
    console.log(eventData);
    //delete first and leave only one row that is used as a template for repopulating the list... 
    while(this.fields.length > 1) {
      this.removeElem(this.fields.length - 1);
    }
    _.each(eventData, (entry, idx) => {
      if (idx >= this.formModel.controls.length) {
        this.addElem(entry);
      } else {
        this.setValueAtElem(idx, entry);
      }
    });
    this.formModel.updateValueAndValidity({onlySelf: false, emitEvent: false});
  }

  public removeAllElems() {
    _.each(this.fields, (f, idx) => {
      this.removeElem(idx);
    });
  }

  public reset(data=null, eventConfig=null) {
    this.fields[0].setValue(null);
    if (this.fields.length > 1) {
      for (var i=1; i<this.fields.length; i++) {
        this.removeElem(i);
      }
    }
    return data;
  }

  public setVisibility(data, eventConf:any = {}) {
    let newVisible = this.visible;
    if (_.isArray(this.visibilityCriteria)) {
      // save the value of this data in a map, so we can run complex conditional logic that depends on one or more fields
      if (!_.isEmpty(eventConf) && !_.isEmpty(eventConf.srcName)) {
        this.subscriptionData[eventConf.srcName] = data;
      }
      // only run the function set if we have all the data...
      if (_.size(this.subscriptionData) == _.size(this.visibilityCriteria)) {
        newVisible = true;
        _.each(this.visibilityCriteria, (visibilityCriteria) => {
          const dataEntry = this.subscriptionData[visibilityCriteria.fieldName];
          newVisible = newVisible && this.execVisibilityFn(dataEntry, visibilityCriteria);
        });

      }
    } else
    if (_.isObject(this.visibilityCriteria) && _.get(this.visibilityCriteria, 'type') == 'function') {
      newVisible = this.execVisibilityFn(data, this.visibilityCriteria);
    } else {
      newVisible = _.isEqual(data, this.visibilityCriteria);
    }
    const that = this;
    setTimeout(() => {
      if (!newVisible) {
        if (that.visible) {
          // remove validators
          if (that.formModel) {
            if(that['disableValidators'] != null && typeof(that['disableValidators']) == 'function') {
              that['disableValidators']();
            } else {
              that.formModel.clearValidators();
            }
            that.formModel.updateValueAndValidity();
          }
          for(let field of that.fields) {
            if(field.formModel) {
              if(field['disableValidators'] != null && typeof(field['disableValidators']) == 'function') {
                field['disableValidators']();
              } else {
                field.formModel.clearValidators();
              }
              field.formModel.updateValueAndValidity();
            }
          }
        }
      } else {
        if (!that.visible) {
          // restore validators
          if (that.formModel) {
            if(that['enableValidators'] != null && typeof(that['enableValidators']) == 'function') {
              that['enableValidators']();
            } else {
              that.formModel.setValidators(that.validators);
            }
            that.formModel.updateValueAndValidity();
          }
          for(let field of that.fields) {
            if(field.formModel) {
              if(field['enableValidators'] != null && typeof(field['enableValidators']) == 'function') {
                field['enableValidators']();
              } else {
                field.formModel.setValidators(field.validators);
              }
              field.formModel.updateValueAndValidity();
            }
          }
        }
      }
      that.visible = newVisible;
    });
    if(eventConf.returnData == true) {
      return data;
    }
  }
}

export class EmbeddableComponent extends SimpleComponent {
  @Input() canRemove: boolean = false;
  @Input() removeBtnText: string = null;
  @Input() removeBtnClass: string = 'btn fa fa-minus-circle btn text-20 pull-left btn btn-danger';
  @Input() index: number;
  @Output() onRemoveBtnClick: EventEmitter<any> = new EventEmitter<any>();

  onRemove(event: any) {
    this.onRemoveBtnClick.emit([event, this.index]);
  }

  public getGroupClass(fldName:string=null): string {
    let baseClass = 'form-group';
    if (this.isEmbedded) {
      baseClass = '';
    }
    return `${baseClass} ${this.hasRequiredError() ? 'has-error' : '' } ${this.field.groupClasses}`;
  }
  
}

export class RepeatableComponent extends SimpleComponent {
  field: RepeatableContainer;

  addElem(event: any) {
    this.field.addElem();
  }

  removeElem(event: any, i: number) {
    this.field.removeElem(i);
  }

  hasRequiredError() {
    let hasError = false;
    _.each(this.field.formModel.controls, (c) => {
      if (c.hasError('required')) {
        hasError = true;
        return false;
      }
    });
    return hasError;
  }
}

export class RepeatableVocab extends RepeatableContainer {
  fields: VocabField[];

  constructor(options: any, injector: any) {
    super(options, injector);
    this.clName = 'RepeatableVocab';
  }

  setValueAtElem(index, value:any) {
    console.log(`Repeatable vocab setting value at: ${index}`);
    console.log(value);
    let selected = {};
    selected['originalObject'] = value;
    this.fields[index].component.onSelect(selected, false, true);
  }
}

@Component({
  selector: 'repeatable-vocab',
  template: `
  <div *ngIf="field.editMode && field.visible">
    <div *ngIf="field.hideWhenZeroRows?field.fields.length >0 : true" class="row">
      <div class="col-xs-12">
      <label [attr.for]="field.name">{{field.label}}
        <button type="button" class="btn btn-default" *ngIf="field.help" (click)="toggleHelp()" [attr.aria-label]="'help' | translate "><span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button>
      </label>
      <span id="{{ 'helpBlock_' + field.name }}" class="help-block" *ngIf="this.helpShow" [innerHtml]="field.help"></span>
      </div>
    </div>
    <div *ngFor="let fieldElem of field.fields; let i = index;" class="row">
      <span class="col-xs-12 no-horizontal-padding">
        <rb-vocab [name]="field.name" [field]="fieldElem" [form]="form" [fieldMap]="fieldMap" [isEmbedded]="true" [removeBtnText]="field.removeButtonText" [removeBtnClass]="field.removeButtonClass" [canRemove]="field.allowZeroRows? true: field.fields.length > 1" (onRemoveBtnClick)="removeElem($event[0], $event[1])" [index]="i"></rb-vocab>
      </span>
    </div>
    <div class="row">
      <span class="col-xs-11">&nbsp;
      </span>
      <span class="col-xs-1">
       <ng-container *ngIf="field.addButtonShow">
         <button *ngIf="field.addButtonText" type='button' [disabled]="field.fields.length >= field.maximumEntries" (click)="addElem($event)" [ngClass]="field.addButtonTextClass" >{{field.addButtonText}}</button>
          <button *ngIf="!field.addButtonText" type='button' [disabled]="field.fields.length >= field.maximumEntries" (click)="addElem($event)" [ngClass]="field.addButtonClass" [attr.aria-label]="'add-button-label' | translate"></button>
        </ng-container>
      </span>
    </div>
  </div>
  <li *ngIf="!field.editMode && field.visible" class="key-value-pair">
   <ng-container *ngIf="field.hideWhenZeroRows ?field.fields.length >0 : true">
    <span *ngIf="field.label" class="key">{{field.label}}</span>
    <span class="value">
      <ul class="key-value-list">
        <rb-vocab *ngFor="let fieldElem of field.fields; let i = index;" [field]="fieldElem" [form]="form" [fieldMap]="fieldMap"></rb-vocab>
      </ul>
    </span>
    </ng-container>
  </li>
  `,
})
export class RepeatableVocabComponent extends RepeatableComponent {
  field: RepeatableVocab;
  static clName = 'RepeatableVocabComponent';

}

export class RepeatableContributor extends RepeatableContainer {
  fields: ContributorField[];
  canSort: boolean;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.canSort = _.isUndefined(options['canSort']) ? false : options['canSort'];
  }

  setValueAtElem(index, value:any) {
    // error thrown when on view mode, only set when on edit mode...
    if (this.editMode) {
      this.fields[index].component.onSelect(value, false, true);
    }
  }

  addElem(val:any = null) {
    this.fields[0].setMissingFields(val);
    return super.addElem(val);
  }

  public setVisibility(data, eventConf:any = {}) {
    let newVisible = this.visible;
    if (_.isArray(this.visibilityCriteria)) {
      // save the value of this data in a map, so we can run complex conditional logic that depends on one or more fields
      if (!_.isEmpty(eventConf) && !_.isEmpty(eventConf.srcName)) {
        this.subscriptionData[eventConf.srcName] = data;
      }
      // only run the function set if we have all the data...
      if (_.size(this.subscriptionData) == _.size(this.visibilityCriteria)) {
        newVisible = true;
        _.each(this.visibilityCriteria, (visibilityCriteria) => {
          const dataEntry = this.subscriptionData[visibilityCriteria.fieldName];
          newVisible = newVisible && this.execVisibilityFn(dataEntry, visibilityCriteria);
        });

      }
    } else
    if (_.isObject(this.visibilityCriteria) && _.get(this.visibilityCriteria, 'type') == 'function') {
      newVisible = this.execVisibilityFn(data, this.visibilityCriteria);
    } else {
      newVisible = _.isEqual(data, this.visibilityCriteria);
    }
    const that = this;
    setTimeout(() => {
      if (!newVisible) {
        if (that.visible) {
          // remove validators
          if (that.formModel) {
            if(that['disableValidators'] != null && typeof(that['disableValidators']) == 'function') {
              that['disableValidators']();
            } else {
              that.formModel.clearValidators();
            }
            that.formModel.updateValueAndValidity();
          }
          for(let field of that.fields) {
            if(field.formModel) {
              if(field['disableValidators'] != null && typeof(field['disableValidators']) == 'function') {
                field['disableValidators']();
              } else {
                field.formModel.clearValidators();
              }
              field.formModel.updateValueAndValidity();
            }
          }
        }
      } else {
        if (!that.visible) {
          // restore validators
          if (that.formModel) {
            if(that['enableValidators'] != null && typeof(that['enableValidators']) == 'function') {
              that['enableValidators']();
            } else {
              that.formModel.setValidators(that.validators);
            }
            that.formModel.updateValueAndValidity();
          }
          for(let field of that.fields) {
            if(field.formModel) {
              if(field['enableValidators'] != null && typeof(field['enableValidators']) == 'function') {
                field['enableValidators']();
              } else {
                field.formModel.setValidators(field.validators);
              }
              setTimeout(() => {
                field.setValue(field.formModel.value,false,true)
              });
              field.formModel.updateValueAndValidity();
            }
          }
        }
      }
      that.visible = newVisible;
    });
    if(eventConf.returnData == true) {
      return data;
    }
  }
  
}

@Component({
  selector: 'repeatable-contributor',
  template: `
  <ng-container *ngIf="field.visible">
  <div *ngIf="field.editMode">
    <div class="row" *ngIf="field.fields[0].label">
      <div class="col-xs-12">
        <span class="label-font">
          {{field.fields[0].label}} {{getRequiredLabelStr()}}
          <button type="button" class="btn btn-default" *ngIf="field.fields[0].help" (click)="toggleHelp()" [attr.aria-label]="'help' | translate "><span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button>
        </span>
      </div>
    </div>
    <div class="row"  *ngIf="this.helpShow">
      <span id="{{ 'helpBlock_' + field.name }}" class="col-xs-12 help-block" [innerHtml]="field.fields[0].help"></span>
    </div>
    <div *ngFor="let fieldElem of field.fields; let i = index;" class="row">
      <span class="col-xs-10">
        <rb-contributor [field]="fieldElem" [form]="form" [fieldMap]="fieldMap" [isEmbedded]="true"></rb-contributor>
      </span>
      <span class="col-xs-2">
        <button type='button' *ngIf="field.fields.length > 1 && field.canSort"  (click)="moveUp($event, i)" [ngClass]="field.moveUpButtonClass" [ngStyle]="{'margin-top': fieldElem.marginTop}" [attr.aria-label]="'move-up-button' | translate"></button>
        <button type='button' *ngIf="field.fields.length > 1 && field.canSort"  (click)="moveDown($event, i)" [ngClass]="field.moveDownButtonClass" [ngStyle]="{'margin-top': fieldElem.marginTop}" [attr.aria-label]="'move-down-button' | translate"></button>
        <button type='button' *ngIf="field.fields.length > 1 && field.removeButtonText" (click)="removeElem($event, i)"  [ngClass]="field.removeButtonTextClass" [ngStyle]="{'margin-top': fieldElem.marginTop}" >{{field.removeButtonText}}</button>
        <button type='button' *ngIf="field.fields.length > 1 && !field.removeButtonText" (click)="removeElem($event, i)" [ngClass]="field.removeButtonClass" [ngStyle]="{'margin-top': fieldElem.marginTop}" [attr.aria-label]="'remove-button-label' | translate" ></button>
      </span>
    </div>
    <div class="row">
      <span class="col-xs-12">
        <button *ngIf="field.addButtonText" type='button' (click)="addElem($event)" [ngClass]="field.addButtonTextClass" >{{field.addButtonText}}</button>
        <button *ngIf="!field.addButtonText" type='button' (click)="addElem($event)" [ngClass]="field.addButtonClass" [attr.aria-label]="'add-button-label' | translate" ></button>
      </span>
    </div>
  </div>
  <ng-container  *ngIf="!field.editMode">
    <div class="view-contributor">
      <div *ngIf="field.fields[0].label" class="row">
        <div class="col-xs-12 key-value-pair"><span class="key">{{field.fields[0].label}}</span></div>
      </div>
      <div class="row view-contributor">
        <div *ngIf="field.fields[0].showTitle" class="col-xs-1 label-font">{{field.fields[0].titleColHdr}}</div>
        <div class="col-xs-3 label-font">{{field.fields[0].nameColHdr}}</div>
        <div [attr.class]="field.fields[0].showRole? 'label-font col-xs-3':'label-font col-xs-4'" class="">{{field.fields[0].emailColHdr}}</div>
        <div class="label-font" [attr.class]="field.fields[0].showRole? 'label-font col-xs-3':'hidden'" >{{field.fields[0].roleColHdr}}</div>
        <div *ngIf="field.fields[0].showOrcid" class="col-xs-2 label-font">{{field.fields[0].orcidColHdr}}</div>
      </div>
      <div class="row view-contributor" *ngFor="let fieldElem of field.fields; let i = index;">
        <div *ngIf="fieldElem.showTitle" class="col-xs-1">{{fieldElem.value.honorific}}</div>
        <div class="col-xs-3">{{fieldElem.value.text_full_name}}</div>
        <div [attr.class]="field.fields[0].showRole? 'col-xs-3':'col-xs-4'">{{fieldElem.value.email}}</div>
        <div [attr.class]="field.fields[0].showRole? 'col-xs-3':'hidden'">{{fieldElem.value.role}}</div>
        <div *ngIf="field.fields[0].showOrcid" class="col-xs-2">{{fieldElem.value.orcid}}</div>
      </div>
    </div>
  </ng-container>
  </ng-container>
  `,
})
export class RepeatableContributorComponent extends RepeatableComponent implements OnInit {
  field: RepeatableContributor;

  ngOnInit() {
    this.field.fields[0]['showHeader'] = false;
    this.field.fields[0].marginTop = this.field.fields[0].baseMarginTop;
    this.field.fields[0].componentReactors.push(this);
  }

  addElem(event: any) {
    const newElem:any = this.field.addElem();
    newElem.marginTop = '0px';
    if (!_.isUndefined(newElem.vocabField)) {
      newElem.vocabField.initialValue = null;
    }
    newElem.setupEventHandlers();
    newElem.showHeader = false;
    newElem.componentReactors.push(this);
  }

  removeElem(event: any, i: number) {
    this.field.removeElem(i);
    if (i == 0) {
      this.field.fields[0].marginTop = this.field.fields[0].baseMarginTop;
    }
  }

  public reactEvent(eventName: string, eventData: any, origData: any, elem:any) {
    if (this.field.fields.length > 0) {
      elem.marginTop = '0px';
      elem.vocabField.initialValue = eventData;
      elem.setupEventHandlers();
      elem.componentReactors.push(this);
    }
  }

  public moveUp(event: any, i:number) {
    const newIdx = i - 1;
    if (newIdx >= 0) {
      this.field.swap(i, newIdx);
      if (newIdx == 0) {
        this.field.fields[i].marginTop = '';
        this.field.fields[newIdx].marginTop = this.field.fields[newIdx].baseMarginTop;
      }
    }
  }

  public moveDown(event: any, i:number) {
    const newIdx = i + 1;
    if (newIdx < this.field.fields.length) {
      this.field.swap(i, newIdx);
      if (i == 0) {
        this.field.fields[i].marginTop = this.field.fields[i].baseMarginTop;
        this.field.fields[newIdx].marginTop = '';
      }
    }
  }
}
