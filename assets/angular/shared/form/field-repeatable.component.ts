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
import { Container } from './field-simple';
import { FormArray } from '@angular/forms';
import { ContributorComponent, ContributorField } from './field-contributor.component';
import * as _ from "lodash-lib";
import { ChangeDetectorRef } from '@angular/core';

/**
 * Repeatable Field Container
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
export class RepeatableContainer extends Container {
  addButtonText: string;
  removeButtonText: string;
  control: any;
  skipClone: string[];
  forceClone: string[];
  addButtonTextClass: any;
  removeButtonTextClass: any;
  addButtonClass: any;
  removeButtonClass: any;

  constructor(options: any) {
    super(options);
    this.hasGroup = true;
    this.addButtonText = options['addButtonText'] || '';
    this.removeButtonText = options['removeButtonText'] || null;
    this.skipClone = options['skipClone'] || [];
    this.forceClone = options['forceClone'] || [];
    this.addButtonTextClass = options['addButtonTextClass'] || 'btn btn-success pull-right';
    this.addButtonClass = options['addButtonClass'] || 'fa fa-plus-circle pull-right btn text-30 btn-success';
    this.removeButtonTextClass = options['removeButtonTextClass'] || 'btn btn-danger pull-left';
    this.removeButtonClass = options['removeButtonClass'] || 'fa fa-minus-circle btn text-20 pull-left btn-danger';

  }

  getInitArrayEntry() {
    return [this.fields[0].createFormModel()];
  }

  getGroup(group: any, fieldMap: any) {
    fieldMap[this.name] = {field:this};
    if (!this.value || this.value.length == 0) {
      this.control = new FormArray(this.getInitArrayEntry());
    } else {
      let fieldCtr = 0;
      const baseField = this.fields[0];
      this.fields = _.map(this.value, (valueElem:any) => {
        let fieldClone = null;
        if (fieldCtr == 0) {
          fieldClone = baseField;
        } else {
          fieldClone = this.createNewElem(baseField);
        }
        if (_.isFunction(fieldClone.postInit)) {
          fieldClone.postInit(valueElem);
        }
        fieldCtr++;
        return fieldClone;
      });
      const elems = _.map(this.fields, (field:any) => {
        return field.createFormModel();
      });
      this.control = new FormArray(elems);
    }
    fieldMap[this.name].control = this.control;
    if (this.groupName) {
      if (group[this.groupName]) {
        group[this.groupName].addControl(this.name, this.control);
      } else {
        const fg = {};
        fg[this.name] = this.control;
        group[this.groupName] = fg;
      }
    } else {
      group[this.name] = this.control;
    }
  }

  createNewElem(baseFieldInst: any) {
    const newInst = new baseFieldInst.constructor(baseFieldInst.options);
    _.forEach(this.skipClone, (f: any)=> {
      newInst[f] = null;
    });
    _.forEach(this.forceClone, (f: any) => {
      newInst[f] = _.cloneDeep(baseFieldInst[f]);
    });
    newInst.postInit(null);
    return newInst;
  }

  addElem() {
    const newElem = this.createNewElem(this.fields[0]);
    this.fields.push(newElem);
    this.control.push(newElem.createFormModel());
    return newElem;
  }

  removeElem(index: number) {
    _.remove(this.fields, (val:any, idx: number) => { return idx == index });
    this.control.removeAt(index);
  }

  public triggerValidation() {
    _.forEach(this.fields, (f:any) => {
      f.triggerValidation();
    });
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

@Component({
  selector: 'repeatable',
  template: `
  <div *ngIf="field.editMode">
    <div class="row">
      <label class="col-md-12">{{field.label}}</label>
    </div>
    <div *ngFor="let fieldElem of field.fields; let i = index;" class="row">
      <span class="col-xs-12">
        <rb-vocab [field]="fieldElem" [form]="form" [fieldMap]="fieldMap" [isEmbedded]="true" [removeBtnText]="field.removeButtonText" [removeBtnClass]="field.removeButtonClass" [canRemove]="field.fields.length > 1" (onRemoveBtnClick)="removeElem($event[0], $event[1])" [index]="i"></rb-vocab>
      </span>
    </div>
    <div class="row">
      <span class="col-xs-12">
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
}

export class RepeatableContributor extends RepeatableContainer {
  fields: ContributorField[];
}

@Component({
  selector: 'repeatable',
  template: `
  <div *ngIf="field.editMode">
    <div *ngFor="let fieldElem of field.fields; let i = index;" class="row">
      <span class="col-xs-10">
        <rb-contributor [field]="fieldElem" [form]="form" [fieldMap]="fieldMap"></rb-contributor>
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
    let fieldElem: {}
    this.field.fields[0].marginTop = '25px';
  }

  addElem(event: any) {
    const newElem = this.field.addElem();
    newElem.marginTop = '0px';
  }

  removeElem(event: any, i: number) {
    this.field.removeElem(i);
    if (i == 0) {
      this.field.fields[0].marginTop = '25px';
      this.field.fields[0].showHeader = true;
    }
  }
}
