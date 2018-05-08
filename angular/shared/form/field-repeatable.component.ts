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
import * as _ from "lodash-es";
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
  }

  getInitArrayEntry() {
    if (this.fields[0].isGroup) {
      const grp = {};
      const fm = {};
      const fg = this.fields[0].getGroup(grp, fm);
      return [fg];
    }
    return [this.fields[0].createFormModel()];
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
        elems.push(fieldClone.createFormModel(valueElem[fieldCtr]));
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
    newOpts.value = null;
    const newInst = new baseFieldInst.constructor(newOpts, this.injector);
    _.forEach(this.skipClone, (f: any)=> {
      newInst[f] = null;
    });
    _.forEach(this.forceClone, (f: any) => {
      if (_.isString(f)) {
        newInst[f] = _.cloneDeep(baseFieldInst[f]);
      } else {
        newInst[f.field] = _.cloneDeepWith(baseFieldInst[f.field], this.getCloneCustomizer(f));
      }
    });

    if (_.isFunction(newInst.postInit)) {
      newInst.postInit(value);
    }
    return newInst;
  }

  getCloneCustomizer(cloneOpts:any) {
    return function(value: any, key: any) {
      if (_.find(cloneOpts.skipClone, (skippedEntry:any) => { return skippedEntry == key}) ) {
        return false;
      }
    };
  }

  addElem(val:any = null) {
    const newElem = this.createNewElem(this.fields[0], val);
    if (val == null && _.isFunction(newElem.setEmptyValue)) {
      newElem.setEmptyValue();
    }
    this.fields.push(newElem);
    const newFormModel = newElem.createFormModel();
    this.formModel.push(newFormModel);
    return newElem;
  }

  removeElem(index: number) {
    _.remove(this.fields, (val:any, idx: number) => { return idx == index });
    this.formModel.removeAt(index);
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
    // delete first...
    if (this.fields.length > eventData.length) {
      for (let toDelIdx = eventData.length - 1; toDelIdx < this.fields.length; toDelIdx++ ) {
          this.removeElem(toDelIdx);
      }
    }
    _.each(eventData, (entry, idx) => {
      if (idx >= this.formModel.controls.length) {
        this.addElem(entry);
      } else {
        this.setValueAtElem(idx, entry);
      }
    });
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
}

export class RepeatableVocab extends RepeatableContainer {
  fields: VocabField[];

  setValueAtElem(index, value:any) {
    console.log(`Repeatable vocab setting value at: ${index}`);
    console.log(value);
    this.fields[index].component.onSelect(value, false, true);
  }
}

@Component({
  selector: 'repeatable-vocab',
  template: `
  <div *ngIf="field.editMode">
    <div class="row">
      <div class="col-xs-12">
      <label>{{field.label}}
        <button type="button" class="btn btn-default" *ngIf="field.help" (click)="toggleHelp()"><span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button>
      </label>
      <span id="{{ 'helpBlock_' + field.name }}" class="help-block" *ngIf="this.helpShow" [innerHtml]="field.help"></span>
      </div>
    </div>
    <div *ngFor="let fieldElem of field.fields; let i = index;" class="row">
      <span class="col-xs-12">
        <rb-vocab [field]="fieldElem" [form]="form" [fieldMap]="fieldMap" [isEmbedded]="true" [removeBtnText]="field.removeButtonText" [removeBtnClass]="field.removeButtonClass" [canRemove]="field.fields.length > 1" (onRemoveBtnClick)="removeElem($event[0], $event[1])" [index]="i"></rb-vocab>
      </span>
    </div>
    <div class="row">
      <span class="col-xs-11">&nbsp;
      </span>
      <span class="col-xs-1">
        <button *ngIf="field.addButtonText" type='button' (click)="addElem($event)" [ngClass]="field.addButtonTextClass" >{{field.addButtonText}}</button>
        <button *ngIf="!field.addButtonText" type='button' (click)="addElem($event)" [ngClass]="field.addButtonClass"></button>
      </span>
    </div>
  </div>
  <li *ngIf="!field.editMode" class="key-value-pair">
    <span *ngIf="field.label" class="key">{{field.label}}</span>
    <span class="value">
      <ul class="key-value-list">
        <rb-vocab *ngFor="let fieldElem of field.fields; let i = index;" [field]="fieldElem" [form]="form" [fieldMap]="fieldMap"></rb-vocab>
      </ul>
    </span>
  </li>
  `,
})
export class RepeatableVocabComponent extends RepeatableComponent {
  field: RepeatableVocab;

}

export class RepeatableContributor extends RepeatableContainer {
  fields: ContributorField[];

  setValueAtElem(index, value:any) {
    this.fields[index].component.onSelect(value, false, true);
  }
}

@Component({
  selector: 'repeatable-contributor',
  template: `
  <div *ngIf="field.editMode">
    <div *ngFor="let fieldElem of field.fields; let i = index;" class="row">
      <span class="col-xs-10">
        <rb-contributor [field]="fieldElem" [form]="form" [fieldMap]="fieldMap" [isEmbedded]="true"></rb-contributor>
      </span>
      <span class="col-xs-2">
        <button type='button' *ngIf="field.fields.length > 1 && field.removeButtonText" (click)="removeElem($event, i)"  [ngClass]="field.removeButtonTextClass" [ngStyle]="{'margin-top': fieldElem.marginTop}" >{{field.removeButtonText}}</button>
        <button type='button' *ngIf="field.fields.length > 1 && !field.removeButtonText" (click)="removeElem($event, i)" [ngClass]="field.removeButtonClass" [ngStyle]="{'margin-top': fieldElem.marginTop}" ></button>
      </span>
    </div>
    <div class="row">
      <span class="col-xs-12">
        <button *ngIf="field.addButtonText" type='button' (click)="addElem($event)" [ngClass]="field.addButtonTextClass" >{{field.addButtonText}}</button>
        <button *ngIf="!field.addButtonText" type='button' (click)="addElem($event)" [ngClass]="field.addButtonClass" ></button>
      </span>
    </div>
  </div>
  <div  *ngIf="!field.editMode" class="table-responsive">
    <table class="table table-striped table-condensed">
      <thead><th>{{field.fields[0].nameColHdr}}</th><th>{{field.fields[0].emailColHdr}}</th><th>{{field.fields[0].roleColHdr}}</th></thead>
      <tbody>
        <tr *ngFor="let fieldElem of field.fields; let i = index;">
          <td>{{fieldElem.value.name}}</td>
          <td>{{fieldElem.value.email}}</td>
          <td>{{fieldElem.value.role}}</td>
        </tr>
      </tbody>
    </table>
  </div>
  `,
})
export class RepeatableContributorComponent extends RepeatableComponent implements OnInit {
  field: RepeatableContributor;

  ngOnInit() {
    this.field.fields[0].marginTop = '25px';
    this.field.fields[0].componentReactors.push(this);
  }

  addElem(event: any) {
    const newElem:any = this.field.addElem();
    newElem.marginTop = '0px';
    newElem.vocabField.initialValue = null;
    newElem.setupEventHandlers();
    newElem.componentReactors.push(this);
  }

  removeElem(event: any, i: number) {
    this.field.removeElem(i);
    if (i == 0) {
      this.field.fields[0].marginTop = '25px';
      this.field.fields[0]["showHeader"] = true;
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
}
