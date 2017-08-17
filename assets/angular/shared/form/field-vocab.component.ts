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

import { Input, Component, Injectable , Inject, OnInit, Output, EventEmitter} from '@angular/core';
import { SimpleComponent } from './field-simple.component';
import { FieldBase } from './field-base';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import * as _ from "lodash-lib";
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/toPromise';
import 'rxjs/add/observable/of';
import { Http } from '@angular/http';
import { BaseService } from '../base-service';
import { CompleterService, CompleterData } from 'ng2-completer';
import { ConfigService } from '../config-service';
/**
 * Vocabulary Field
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
export class VocabField extends FieldBase<any> {
  public vocabId: string;
  public sourceData: any;
  public completerService: CompleterService;
  protected dataService: CompleterData;
  public initialValue: any;
  public titleFieldArr: string[];
  public titleFieldDelim: string;
  public searchFields: string;
  public fieldNames: string[];
  public sourceType: string;
  public lookupService: any;

  constructor(options: any) {
    super(options);
    this.hasLookup = true;
    this.vocabId = options['vocabId'] || '';
    this.controlType = 'textbox';
    this.titleFieldArr = options['titleFieldArr'] || [];
    this.searchFields = options['searchFields'] || '';
    this.titleFieldDelim = options['titleFieldDelim'] || ' - ';
    this.fieldNames = options['fieldNames'] || [];
    this.sourceType = options['sourceType'] || 'vocab';
  }

  createFormModel(valueElem: any = undefined) {
    const group = {};
    if (valueElem) {
      this.value = valueElem;
    }
    this.formModel = new FormControl(this.value || '');
    if (this.value) {
      const init = _.cloneDeep(this.value);
      init.title = this.getTitle(this.value);
      this.initialValue = init;
    }
    if (this.required) {
      this.formModel.setValidators([Validators.required]);
    }
    return this.formModel;
  }

  postInit(value: any) {
    if (value) {
      this.value = value;
    } else {
      this.setEmptyValue();
    }
    this.initLookupData();
  }

  setEmptyValue() {
    this.value = null;
    return this.value;
  }

  initLookupData() {
    if (this.sourceType == "vocab") {
      // Hack for creating the intended title...
      _.forEach(this.sourceData, (data: any) => {
        data.title = this.getTitle(data);
      });
      this.dataService = this.completerService.local(this.sourceData, this.searchFields, 'title');
    } else if (this.sourceType == "collection") {
      const url = this.lookupService.getCollectionRootUrl(this.vocabId);
      console.log(`Using: ${url}`);
      // at the moment, multiple titles arrays are not supported
      // TODO: consider replacing with ngx-bootstrap typeahead
      const title = this.titleFieldArr.length == 1 ? this.titleFieldArr[0] : 'title';
      console.log(`Using title: ${title}`);
      this.dataService = this.completerService.remote(url, this.searchFields, title);
    }
  }

  getTitle(data: any): string {
    let title = '';
    _.forEach(this.titleFieldArr, (titleFld: string) => {
      title = `${title}${_.isEmpty(title) ? '' : this.titleFieldDelim}${data[titleFld]}`;
    });
    return title;
  }

  getValue(data: any) {
    const valObj = {};
    _.forEach(this.fieldNames, (fldName: string) => {
      valObj[fldName] = data[fldName];
    });
    return valObj;
  }

}

@Injectable()
export class VocabFieldLookupService extends BaseService {

  constructor (@Inject(Http) http: Http, @Inject(ConfigService) protected configService: ConfigService) {
    super(http, configService);
  }

  getLookupData(field: VocabField) {
    const vocabId  = field.vocabId;
    // only retrieving static data when on vocab mode
    if (field.sourceType == "vocab") {
      const url = `${this.brandingAndPortallUrl}/${this.config.vocabRootUrl}/${vocabId}`;
      return this.http.get(url, this.options)
        .flatMap((res: any) => {
          const data = this.extractData(res);
          field.sourceData = data;
          field.postInit(field.value);
          return Observable.of(field);
        });
    }
    field.postInit(field.value);
    return Observable.of(field);
  }

  getCollectionRootUrl(collectionId: string) {
    return `${this.brandingAndPortallUrl}/${this.config.collectionRootUri}/${collectionId}/?search=`;
  }

  findLookupData(field: VocabField, search: string) {

  }
}

@Component({
  selector: 'rb-vocab',
  template: `
  <div *ngIf="field.editMode && !isEmbedded" [formGroup]='form' [ngClass]="getGroupClass()">
    <label>{{field.label}}</label>
    <ng2-completer [placeholder]="'Select a valid value'" [clearUnselected]="true" (selected)="onSelect($event)" [datasource]="field.dataService" [minSearchLength]="0" [inputClass]="'form-control'" [initialValue]="field.initialValue"></ng2-completer>
    <div class="text-danger" *ngIf="hasRequiredError()">{{field.validationMessages.required}}</div>
  </div>
  <div *ngIf="field.editMode && isEmbedded" [formGroup]='form' [ngClass]="getGroupClass()">
    <div class="input-group">
      <ng2-completer [placeholder]="'Select a valid value'" [clearUnselected]="true" (selected)="onSelect($event)" [datasource]="field.dataService" [minSearchLength]="0" [inputClass]="'form-control'" [initialValue]="field.initialValue"></ng2-completer>
      <span class="input-group-btn">
        <button type='button' *ngIf="removeBtnText" [disabled]="!canRemove" (click)="onRemove($event)" [ngClass]="removeBtnClass" >{{removeBtnText}}</button>
        <button [disabled]="!canRemove" type='button' [ngClass]="removeBtnClass" (click)="onRemove($event)"></button>
      </span>
    </div>
    <div class="text-danger" *ngIf="hasRequiredError()">{{field.validationMessages.required}}</div>
  </div>

  <li *ngIf="!field.editMode" class="key-value-pair">
    <span *ngIf="field.label" class="key">{{field.label}}</span>
    <span class="value">{{field.getTitle(field.value)}}</span>
  </li>
  `,
})
export class VocabFieldComponent extends SimpleComponent {
  field: VocabField;
  @Input() isEmbedded: boolean = false;
  @Input() canRemove: boolean = false;
  @Input() removeBtnText: string = null;
  @Input() removeBtnClass: string = 'btn fa fa-minus-circle btn text-20 pull-left btn btn-danger';
  @Input() index: number;
  @Output() onRemoveBtnClick: EventEmitter<any> = new EventEmitter<any>();

  constructor() {
    super();
  }

  onSelect(selected: any) {
    if (selected) {
      this.field.formModel.setValue(this.field.getValue(selected.originalObject));
    } else {
      this.field.formModel.setValue(null);
    }
  }

  onRemove(event: any) {
    this.onRemoveBtnClick.emit([event, this.index]);
  }
}
