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
import * as _ from "lodash";
import { FieldBase } from './field-base';
import { EmbeddableComponent, RepeatableComponent } from './field-repeatable.component';
import {Observable} from 'rxjs/Observable';
import { debounceTime } from 'rxjs/operators';
declare var jQuery: any;

/**
 * Text Field Model
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>

 */
export class TextField extends FieldBase<string> {
  type: string;
  maxLength: number;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.type = options['type'] || '';
    this.controlType = 'textbox';
    this.cssClasses = _.isEmpty(this.cssClasses) ? 'form-control' : this.cssClasses;
    // default value from: https://www.w3schools.com/tags/att_input_maxlength.asp
    this.maxLength = _.isUndefined(options['maxLength']) ? 524288 : options['maxLength'] ;
  }

  postInit(value:any) {
    if (_.isEmpty(value)) {
      this.value = this.defaultValue ? this.defaultValue : '';
    } else {
      this.value = value;
    }
  }
}

export class MarkdownTextArea extends FieldBase<string> {
  rows: number;
  cols: number;

  lines: string[];
  enableLivePreview: boolean;
  updateEventSource: any;
  updateSub: any;
  previewData: any;
  previewLabel: string;
  previewDelay: number;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.rows = options['rows'] || 5;
    this.cols = options['cols'] || null;
    this.controlType = 'textarea';
    this.enableLivePreview = _.isEmpty(options['enableLivePreview']) ? true : options['enableLivePreview'];
    this.previewLabel = this.getTranslated(options['previewLabel'], 'Preview');
    this.previewDelay = _.isEmpty(options['previewDelay']) ? 1000 : _.toInteger(options['previewDelay']);
    if (_.isUndefined(this.value)) {
      this.value = "";
    }
    this.cssClasses = _.isEmpty(this.cssClasses) ? 'form-control' : this.cssClasses;
  }

  formatValueForDisplay() {
    this.lines = this.value ? this.value.split("\n") : [];
  }

  public createFormModel(valueElem: any = null): any {
    this.formModel = super.createFormModel(valueElem);
    this.setLivePreview(this.enableLivePreview);
    return this.formModel;
  }

  setLivePreview(flag: boolean = true) {
    this.enableLivePreview = flag;
    if (this.enableLivePreview) {
      this.previewData = this.value;
      if (this.formModel && _.isEmpty(this.updateEventSource)) {
        this.updateEventSource = this.formModel['valueChanges'];
        // start listening 
        this.updateSub = this.updateEventSource.pipe(debounceTime(this.previewDelay)).subscribe((val: any) => {
          this.previewData = this.value;
        });
      }
    } else {
      this.previewData = null;
      if (this.updateEventSource) {
        this.updateSub.unsubscribe();
        this.updateSub = null;
        this.updateEventSource = null;
      }
    }
  }

}

export class TextArea extends FieldBase<string> {
  rows: number;
  cols: number;

  lines: string[];

  constructor(options: any, injector: any) {
    super(options, injector);
    this.rows = options['rows'] || 5;
    this.cols = options['cols'] || null;
    this.controlType = 'textarea';
    this.cssClasses = _.isEmpty(this.cssClasses) ? 'form-control' : this.cssClasses;
  }

  formatValueForDisplay() {
    this.lines = this.value ? this.value.split("\n") : [];
  }
}

@Component({
  selector: 'textfield',
  template: `
  <div *ngIf="field.editMode && field.visible" [ngClass]="getGroupClass()">
    <div *ngIf="!isEmbedded" >
      <label [attr.for]="field.name">
       <span [outerHTML]="field.label"></span><span class="form-field-required-indicator" [innerHTML]="getRequiredLabelStr()"></span>
        <button type="button" class="btn btn-default" *ngIf="field.help" (click)="toggleHelp()" [attr.aria-label]="'help' | translate "><span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button>
      </label>
        <span id="{{ 'helpBlock_' + field.name }}" class="help-block" *ngIf="this.helpShow" [innerHtml]="field.help"></span>
      <input [formGroup]='form' [formControl]="getFormControl()"  [id]="field.name" [type]="field.type" [readonly]="field.readOnly" [ngClass]="field.cssClasses" [attr.aria-label]="''" [attr.maxlength]="field.maxLength" >
    </div>
    <div *ngIf="isEmbedded" class="input-group padding-bottom-15">
      <input [formControl]="getFormControl(name, index)"  [id]="field.name" [type]="field.type" [readonly]="field.readOnly" [ngClass]="field.cssClasses" [attr.aria-labelledby]="name" [attr.maxlength]="field.maxLength">
      <span class="input-group-btn">
        <button type='button' *ngIf="removeBtnText" [disabled]="!canRemove" (click)="onRemove($event)" [ngClass]="removeBtnClass" >{{removeBtnText}}</button>
        <button [disabled]="!canRemove" type='button' [ngClass]="removeBtnClass" (click)="onRemove($event)" [attr.aria-label]="'remove-button-label' | translate"></button>
      </span>
    </div>
    <div *ngIf="field.required && (field.label || (field.validationMessages && field.validationMessages.required))" [style.visibility]="getFormControl() && getFormControl().hasError('required') && getFormControl().touched ? 'inherit':'hidden'">
      <div class="text-danger" *ngIf="!field.validationMessages?.required">{{field.label}} is required</div>
      <div class="text-danger" *ngIf="field.validationMessages?.required">{{field.validationMessages.required}}</div>
    </div>
  </div>
  <div *ngIf="!field.editMode && field.visible" class="key-value-pair">
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
  <ng-container *ngIf="field.visible">
  <div *ngIf="field.editMode">
    <div class="row">
      <div class="col-xs-12">
      <span class="label-font" [id]="field.name">
       <span [outerHTML]="field.label"></span><span class="form-field-required-indicator" [innerHTML]="getRequiredLabelStr()"></span>
        <button type="button" class="btn btn-default" *ngIf="field.help" (click)="toggleHelp()" [attr.aria-label]="'help' | translate "><span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button>
      </span>
      <span id="{{ 'helpBlock_' + field.name }}" class="help-block" *ngIf="this.helpShow" [innerHtml]="field.help"></span>
      </div>
    </div>
    <div *ngFor="let fieldElem of field.fields; let i = index;" class="row">
      <span class="col-xs-12">
        <textfield [name]="field.name" [field]="fieldElem" [form]="form" [fieldMap]="fieldMap" [isEmbedded]="true" [removeBtnText]="field.removeButtonText" [removeBtnClass]="field.removeButtonClass" [canRemove]="field.fields.length > field.minimumEntries" (onRemoveBtnClick)="removeElem($event[0], $event[1])" [index]="i"></textfield>
      </span>
    </div>
    <div class="row">
      <div class="col-xs-12" *ngIf="field.required && !field.delegateErrorHandling && (field.label || (field.validationMessages && field.validationMessages.required))" [style.visibility]="getFormControl() && hasRequiredError() && getFormControl().touched ? 'inherit':'hidden'">
        <div class="text-danger" *ngIf="!field.validationMessages?.required">{{field.label}} is required</div>
        <div class="text-danger" *ngIf="field.validationMessages?.required">{{field.validationMessages.required}}</div>
      </div>
    </div>
    <div class="row">
      <span *ngIf="field.addButtonShow" class="col-xs-12">
        <button *ngIf="field.addButtonText" type='button' [disabled]="field.fields.length >= field.maximumEntries" (click)="addElem($event)" [ngClass]="field.addButtonTextClass" >{{field.addButtonText}}</button>
        <button *ngIf="!field.addButtonText" type='button' [disabled]="field.fields.length >= field.maximumEntries" (click)="addElem($event)" [ngClass]="field.addButtonClass" [attr.aria-label]="'add-button-label' | translate"></button>
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
  </ng-container>
  `,
})
export class RepeatableTextfieldComponent extends RepeatableComponent {
  static clName = 'RepeatableTextfieldComponent';


  ngOnInit() {
  }

  addElem(event: any) {
    const newElem = this.field.addElem();
  }

  removeElem(event: any, i: number) {
    this.field.removeElem(i);
  }
}

/**
 * Component
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 */
@Component({
  selector: 'text-area',
  template: `
  <div *ngIf="field.editMode && field.visible" [formGroup]='form' [ngClass]="getGroupClass()">
    <label [attr.for]="field.name">
     <span [outerHTML]="field.label"></span><span class="form-field-required-indicator" [innerHTML]="getRequiredLabelStr()"></span>
      <button type="button" class="btn btn-default" *ngIf="field.help" (click)="toggleHelp()" [attr.aria-label]="'help' | translate "><span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button>
    </label>
    <!-- Normal version -->
    <ng-container *ngIf="!field.isEmbedded">
      <ng-container *ngIf="this.helpShow">
        <br/>
        <span id="{{ 'helpBlock_' + field.name }}" class="help-block" [innerHtml]="field.help"></span>
      </ng-container>
      <textarea [formControl]="getFormControl()"  [attr.rows]="field.rows" [attr.cols]="field.cols" [id]="field.name" [ngClass]="field.cssClasses" >{{field.value}}</textarea>
    </ng-container>
    <!-- Embedded version -->
    <div *ngIf="isEmbedded" class="input-group padding-bottom-15">
      <textarea [formControl]="getFormControl(name, index)"  [attr.rows]="field.rows" [attr.cols]="field.cols" [id]="field.name" [ngClass]="field.cssClasses">{{field.value}}</textarea>
    </div>
    <!-- Validation messages -->
    <div *ngIf="field.required" [style.visibility]="getFormControl() && getFormControl().hasError('required') && getFormControl().touched ? 'inherit':'hidden'">
      <div class="text-danger" *ngIf="getFormControl().hasError('required') && getFormControl().touched && !field.validationMessages?.required">{{field.label}} is required</div>
      <div class="text-danger" *ngIf="getFormControl().hasError('required') && getFormControl().touched && field.validationMessages?.required">{{field.validationMessages.required}}</div>
    </div>
  </div>
  <li *ngIf="!field.editMode && field.visible" class="key-value-pair">
    <span class="key" *ngIf="field.label">{{field.label}}</span>
    <span *ngFor="let line of field.lines">
      {{line}}
      <br/>
    </span>

  </li>
  `
})
export class TextAreaComponent extends EmbeddableComponent implements OnInit {
  field: TextArea;

  ngOnInit() {
    if (!this.field.editMode) {
      this.field.formatValueForDisplay();
    }
  }
}

@Component({
  selector: 'markdown-text-area',
  template: `
  <div *ngIf="field.editMode && field.visible" [formGroup]='form' class="form-group">
    <label [attr.for]="field.name">
     <span [outerHTML]="field.label"></span><span class="form-field-required-indicator" [innerHTML]="getRequiredLabelStr()"></span>
      <button type="button" class="btn btn-default" *ngIf="field.help" (click)="toggleHelp()" [attr.aria-label]="'help' | translate "><span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button>
    </label><br/>
    <span id="{{ 'helpBlock_' + field.name }}" class="help-block" *ngIf="this.helpShow" [innerHtml]="field.help"></span>
    <textarea [formControl]="getFormControl()"  [attr.rows]="field.rows" [attr.cols]="field.cols" [id]="field.name" [ngClass]="field.cssClasses" [(ngModel)]="field.value"></textarea>
    <ng-container *ngIf="field.previewData">
      <div style='font-weight:bold' [innerHtml]="field.previewLabel"></div>
      <markdown [data]="field.previewData"></markdown>
    </ng-container>
    <div class="text-danger" *ngIf="getFormControl().hasError('required') && getFormControl().touched && !field.validationMessages?.required">{{field.label}} is required</div>
    <div class="text-danger" *ngIf="getFormControl().hasError('required') && getFormControl().touched && field.validationMessages?.required">{{field.validationMessages.required}}</div>
  </div>
  <li *ngIf="!field.editMode && field.visible" class="key-value-pair">
    <span class="key" *ngIf="field.label">{{field.label}}</span>
    <markdown *ngIf="field.value" [data]="field.value"></markdown>
    <br/>
  </li>
  `
})
export class MarkdownTextAreaComponent extends EmbeddableComponent implements OnInit {
  field: MarkdownTextArea;

  ngOnInit() {
    if (!this.field.editMode) {
      this.field.formatValueForDisplay();
    } else {
      this.field.componentReactors.push(this);
    }
  }

  public reactEvent(eventName: string, eventData: any, origData: any, elem:any) {
    this.field.previewData = this.field.value;
  }
}
