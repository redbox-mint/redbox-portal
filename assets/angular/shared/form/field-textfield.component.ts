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
import * as _ from "lodash-lib";
import { TextField } from './field-simple';
import { EmbeddableComponent, RepeatableComponent } from './field-repeatable.component';

declare var jQuery: any;

@Component({
  selector: 'textfield',
  template: `
  <div *ngIf="field.editMode" [ngClass]="getGroupClass()">
    <div *ngIf="!isEmbedded" >
      <label [attr.for]="field.name">
        {{field.label}} {{ getRequiredLabelStr() }}
        <button type="button" class="btn btn-default" *ngIf="field.help" (click)="toggleHelp()"><span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button>
        <span id="{{ 'helpBlock_' + field.name }}" class="help-block" *ngIf="this.helpShow" [innerHtml]="field.help"></span>
      </label>
      <input [formGroup]='form' [formControl]="getFormControl()"  [id]="field.name" [type]="field.type" [readonly]="field.readOnly" [ngClass]="field.cssClasses" [attr.aria-describedby]="field.help ? 'helpBlock_' + field.name : null">
    </div>
    <div *ngIf="isEmbedded" class="input-group padding-bottom-15">
      <input [formControl]="getFormControl(name, index)"  [id]="field.name" [type]="field.type" [readonly]="field.readOnly" [ngClass]="field.cssClasses" [attr.aria-describedby]="field.help ? 'helpBlock_' + field.name : null">
      <span class="input-group-btn">
        <button type='button' *ngIf="removeBtnText" [disabled]="!canRemove" (click)="onRemove($event)" [ngClass]="removeBtnClass" >{{removeBtnText}}</button>
        <button [disabled]="!canRemove" type='button' [ngClass]="removeBtnClass" (click)="onRemove($event)"></button>
      </span>
    </div>
    <div *ngIf="field.required" [style.visibility]="getFormControl() && getFormControl().hasError('required') && getFormControl().touched ? 'inherit':'hidden'">
      <div class="text-danger" *ngIf="!field.validationMessages?.required">{{field.label}} is required</div>
      <div class="text-danger" *ngIf="field.validationMessages?.required">{{field.validationMessages.required}}</div>
    </div>
  </div>
  <div *ngIf="!field.editMode" class="key-value-pair">
    <span class="key" *ngIf="field.label">{{field.label}}</span>
    <span class="value">{{field.value}}</span>
  </div>
  `,
})
export class TextFieldComponent extends EmbeddableComponent {

}

@Component({
  selector: 'repeatable-textfield',
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
        <textfield [name]="field.name" [field]="fieldElem" [form]="form" [fieldMap]="fieldMap" [isEmbedded]="true" [removeBtnText]="field.removeButtonText" [removeBtnClass]="field.removeButtonClass" [canRemove]="field.fields.length > 1" (onRemoveBtnClick)="removeElem($event[0], $event[1])" [index]="i"></textfield>
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
        <textfield *ngFor="let fieldElem of field.fields; let i = index;"  [field]="fieldElem" [form]="form" [fieldMap]="fieldMap"></textfield>
      </ul>
    </span>
  </li>
  `,
})
export class RepeatableTextfieldComponent extends RepeatableComponent {

  ngOnInit() {
  }

  addElem(event: any) {
    const newElem = this.field.addElem();
  }

  removeElem(event: any, i: number) {
    this.field.removeElem(i);
  }
}
