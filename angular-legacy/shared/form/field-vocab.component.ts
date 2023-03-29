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

import { Input, Component, Injectable, Inject, OnInit, Output, EventEmitter, ElementRef, ViewChild } from '@angular/core';
import { SimpleComponent } from './field-simple.component';
import { FieldBase } from './field-base';
import { FormGroup, FormControl, Validators, ValidatorFn, AbstractControl, ValidationErrors } from '@angular/forms';
import * as _ from "lodash";
import { Observable } from 'rxjs';
import { Subject } from "rxjs/Subject";
import 'rxjs/add/operator/toPromise';
import 'rxjs/add/observable/of';
import 'rxjs/add/operator/map'
import { Http } from '@angular/http';
import { BaseService } from '../base-service';
import { CompleterService, CompleterData, CompleterItem } from 'ng2-completer';
import { ConfigService } from '../config-service';
import * as luceneEscapeQuery from "lucene-escape-query";
import { TranslationService } from '../translation-service';
/**
 * Vocabulary Field
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
export class VocabField extends FieldBase<any> {
  public searchStr: any;
  public vocabId: string;
  public sourceData: any;
  public completerService: CompleterService;
  public dataService: CompleterData;
  public initialValue: any;
  public titleFieldName: string;
  public titleFieldArr: string[];
  public titleFieldDelim: any;
  public titleCompleterDescription: string;
  public searchFields: string;
  public fieldNames: any[];
  public sourceType: string;
  public lookupService: any;
  public placeHolder: string;
  public disableEditAfterSelect: boolean;
  public stringLabelToField: string;
  public component: any;
  public restrictToSelection: boolean;
  public storeLabelOnly: boolean;
  public provider: string;
  public resultArrayProperty: string;
  public unflattenFlag: boolean;
  public dontEmitEventOnLoad: boolean;
  public isEmbedded: boolean;
  public groupClass: string;
  public inputClass: string;

  @Output() onItemSelect: EventEmitter<any> = new EventEmitter<any>();

  constructor(options: any, injector: any) {
    super(options, injector);
    this.clName = 'VocabField';
    this.hasLookup = true;
    this.vocabId = options['vocabId'] || '';
    this.controlType = 'textbox';
    this.titleFieldName = options['titleFieldName'] || 'title';
    this.titleFieldArr = options['titleFieldArr'] || [];
    this.searchFields = options['searchFields'] || '';
    this.titleFieldDelim = options['titleFieldDelim'] || ' - ';
    this.titleCompleterDescription = options['titleCompleterDescription'] || '';
    this.fieldNames = options['fieldNames'] || [];
    this.sourceType = options['sourceType'] || 'vocab';
    this.placeHolder = options['placeHolder'] || 'Select a valid value';
    this.placeHolder = this.translationService.t(this.placeHolder);
    this.disableEditAfterSelect = options['disableEditAfterSelect'] == undefined ? true : options['disableEditAfterSelect'];
    this.stringLabelToField = options['stringLabelToField'] ? options['stringLabelToField'] : 'dc_title';
    this.restrictToSelection = _.isUndefined(options['restrictToSelection']) ? (_.isUndefined(options['forceLookupOnly']) ? false : options['forceLookupOnly']) : options['restrictToSelection'];
    this.storeLabelOnly = options['storeLabelOnly'] ? options['storeLabelOnly'] : false;
    this.provider = options['provider'] ? options['provider'] : '';
    this.resultArrayProperty = options['resultArrayProperty'] ? options['resultArrayProperty'] : '';
    this.unflattenFlag = _.isUndefined(options['unflattenFlag']) ? false : options['unflattenFlag'];
    this.dontEmitEventOnLoad = _.isUndefined(options['dontEmitEventOnLoad']) ? false : options['dontEmitEventOnLoad'];
    this.groupClasses = _.isUndefined(options['groupClasses']) ? '' : options['groupClasses'];
    this.cssClasses = _.isUndefined(options['cssClasses']) ? '' : options['cssClasses'];
  }

  createFormModel(valueElem: any = undefined, createFormGroup: boolean = false) {
    if (valueElem) {
      this.value = valueElem;
    }
    if (createFormGroup) {
      const flds = {};
      _.forEach(this.fieldNames, fld => {
        _.forOwn(fld, (srcFld, targetFld) => {
          flds[targetFld] = new FormControl(this.value[targetFld] || '');
        });
      });
      this.formModel = new FormGroup(flds);
    } else {
      this.formModel = new FormControl(this.value || '');
    }
    if (this.value) {
      if (!_.isString(this.value)) {
        const init = _.cloneDeep(this.value);
        init.title = this.getTitle(this.value);
        this.initialValue = init;
      } else {
        let init = {};
        init['title'] = this.value;
        init[this.stringLabelToField] = this.value;
        this.initialValue = init;
      }

    }

    if (this.required) {
      this.formModel.setValidators([objectRequired()]);
    }
    return this.formModel;
  }

  public reactEvent(eventName: string, eventData: any, origData: any) {
    let selected = {};
    if (this.storeLabelOnly) {
      selected['title'] = eventData; 
    }
    selected['originalObject'] = eventData;
    this.component.onSelect(selected, false, true);
    super.reactEvent(eventName, eventData, origData);
  }

  postInit(value: any) {
    if (value) {
      this.value = value;
    } else {
      this.setEmptyValue();
    }
    this.initLookupData();
  }

  setEmptyValue(updateTitle: boolean = false) {
    this.value = null;
    if (this.formModel) {
      this.formModel.setValue(null, { emitEvent: true });
    }
    if (updateTitle && this.component && this.component.ngCompleter) {
      this.component.ngCompleter.ctrInput.nativeElement.value = null;
    }
    return this.value;
  }

  setLookupServices(completerService: any, lookupService: any) {
    this.completerService = completerService;
    this.lookupService = lookupService;
  }

  initLookupData() {
    if (this.sourceType == "vocab") {
      // Hack for creating the intended title...
      _.forEach(this.sourceData, (data: any) => {
        data.title = this.getTitle(data);
      });
      this.dataService = this.completerService.local(this.sourceData, this.searchFields, 'title');
    } else if (this.sourceType == "collection" || this.sourceType == "user") {
      let url = this.lookupService.getCollectionRootUrl(this.vocabId);
      if (this.sourceType == "user") {
        url = this.lookupService.getUserLookupUrl();
      }
      console.log(`Using: ${url}`);
      // at the moment, multiple titles arrays are not supported
      // TODO: consider replacing with ngx-bootstrap typeahead
      const title = this.titleFieldArr.length == 1 ? this.titleFieldArr[0] : 'title';
      console.log(`Using title: ${title}`);
      this.dataService = this.completerService.remote(url, this.searchFields, title);
    } else if (this.sourceType == "mint") {
      const url = this.lookupService.getMintRootUrl(this.vocabId);
      console.log(`Using: ${url}`);

      this.dataService = new MintLookupDataService(
        url,
        this.lookupService.http,
        this.fieldNames,
        this.titleFieldName,
        this.titleFieldArr,
        this.titleFieldDelim,
        this.titleCompleterDescription,
        this.searchFields,
        this.unflattenFlag);
    } else if (this.sourceType == "external") {
      const url = this.lookupService.getExternalServiceUrl(this.provider);
      this.dataService = new ExternalLookupDataService(
        url,
        this.lookupService.http,
        this.resultArrayProperty,
        this.titleFieldName,
        this.titleFieldArr,
        this.titleFieldDelim
      );
    }

  }

  public getTitle(data: any): string {
    let title = '';
    if (data) {
      if (_.isString(data)) {
        return data;
      }
      if (_.isString(this.titleFieldDelim)) {
        _.forEach(this.titleFieldArr, (titleFld: string) => {
          const titleVal = data[titleFld];
          if (titleVal) {
            title = `${title}${_.isEmpty(title) ? '' : this.titleFieldDelim}${titleVal}`;
          }
        });
      } else {
        // expecting a delim pair array, 'prefix', 'suffix'
        _.forEach(this.titleFieldArr, (titleFld: string, idx) => {
          const delimPair = this.titleFieldDelim[idx];
          const titleVal = data[titleFld];
          if (titleVal) {
            title = `${title}${_.isEmpty(title) ? '' : delimPair.prefix}${titleVal}${_.isEmpty(title) ? '' : delimPair.suffix}`;
          }
        });
      }
    }
    return title;
  }

  public getValue(data: any) {
    const valObj = {};
    if (!_.isUndefined(data) && !_.isEmpty(data)) {
      if (_.isString(data)) {
        console.log(`Data is string...`)
        if (this.storeLabelOnly) {
          return data;
        } else {
          valObj[this.stringLabelToField] = data;
        }
        return valObj;
      }

      _.forEach(this.fieldNames, (fldName: any) => {
        if (data.originalObject) {
          this.getFieldValuePair(fldName, data.originalObject, valObj)
        } else {
          this.getFieldValuePair(fldName, data, valObj)
        }
      });

    }
    return valObj;
  }

  public getFieldValuePair(fldName: any, data: any, valObj: any) {
    if (_.isString(fldName)) {
      valObj[fldName] = _.get(data, fldName);
    } else {
      // expects a value pair
      _.forOwn(fldName, (srcFld, targetFld) => {
        if (_.get(data, srcFld)) {
          valObj[targetFld] = _.get(data, srcFld);
        } else {
          valObj[targetFld] = _.get(data, targetFld);
        }
      });
    }
  }

  public setValue(value: any, emitEvent: boolean = true, updateTitle: boolean = true) {
    this.formModel.setValue(value, { emitEvent: emitEvent });
    if (updateTitle) {
      this.component.ngCompleter.ctrInput.nativeElement.value = this.getTitle(value);
    }
  }

  relationshipLookup(searchTerm, lowerTerm, searchFields) {
    const url = this.lookupService.getMintRootUrl(this.vocabId);
    console.log(`Using: ${url}`);
    const mlu = new MintRelationshipLookup(url, this.lookupService.http, searchFields);
    return mlu.search(searchTerm, lowerTerm);
  }


  setRequiredAndClearValueOnFalse(flag) {
    this.required = flag;
    if (flag) {
      this.validators =objectRequired();
      this.formModel.setValidators(this.validators);
    } else {
      if (_.isFunction(this.validators) && _.isEqual(this.validators,objectRequired())) {
        this.validators = null;
      }
      this.formModel.clearValidators();
      this.formModel.setValue(null);
      this.value = null;
    }
  }

  setRequired(flag) {
    this.required = flag;
    if (flag) {
      this.validators = objectRequired();
    } else {
      if (_.isFunction(this.validators) && _.isEqual(this.validators,objectRequired())) {
        this.validators = null;
      } else {
        _.remove(this.validators, (v) => {
          return _.isEqual(v,objectRequired());
        });
      }
    }
    if (this.validators) {
      this.formModel.setValidators(this.validators);
    } else {
      this.formModel.clearValidators();
    }
  }

}

export function objectRequired(): ValidationErrors|null {
  
  return (control: AbstractControl): { [key: string]: any } | null =>  
  (_.isEqual(control.value, {}) || _.isEmpty(control.value)) 
            ? {'required': true} : null;
            
  
}


class ExternalLookupDataService extends Subject<CompleterItem[]> implements CompleterData {

  constructor(private url: string,
    private http: Http,
    private arrayProperty: string,
    private compositeTitleName: string,
    private titleFieldArr: string[],
    private titleFieldDelim: string) {
    super();
  }

  public search(term: string): void {

    this.http.post(this.url, { options: { query: term } }).map((res: any, index: number) => {
      // Convert the result to CompleterItem[]
      let data = res.json();
      let itemArray = _.get(data, this.arrayProperty);
      let matches: CompleterItem[] = [];
      _.each(itemArray, item => {
        matches.push(this.convertToItem(item));
      })

      this.next(matches);
    }).subscribe();
  }

  public cancel() {
    // Handle cancel
  }

  public convertToItem(data: any): CompleterItem | null {
    if (!data) {
      return null;
    }
    let completerItem = {};
    completerItem[this.compositeTitleName] = this.getTitle(data);
    completerItem['originalObject'] = data;
    return completerItem as CompleterItem;
  }

  getTitle(data: any): string {
    let title = '';
    if (data) {
      if (_.isString(this.titleFieldDelim)) {
        _.forEach(this.titleFieldArr, (titleFld: string) => {
          const titleVal = _.get(data, titleFld);
          if (titleVal) {
            title = `${title}${_.isEmpty(title) ? '' : this.titleFieldDelim}${titleVal}`;
          }
        });
      } else {
        // // expecting a delim pair array, 'prefix', 'suffix'
        // _.forEach(this.titleFieldArr, (titleFld: string, idx) => {
        //   const delimPair = this.titleFieldDelim[idx];
        //   const titleVal = data[titleFld];
        //   if (titleVal) {
        //     title = `${title} ${titleVal}`;
        //   }
        // });
      }
    }
    return title;
  }

}
class MintLookupDataService extends Subject<CompleterItem[]> implements CompleterData {

  searchFields: any[];

  constructor(private url: string,
    private http: Http,
    private fields: string[],
    private compositeTitleName: string,
    private titleFieldArr: string[],
    private titleFieldDelim: any[],
    private titleCompleterDescription: string,
    searchFieldStr: any,
    private unflattenFlag: boolean) {
    super();
    this.searchFields = searchFieldStr.split(',');
  }

  public search(term: string): void {
    term = _.trim(luceneEscapeQuery.escape(term));
    let searchString = '';
    if (!_.isEmpty(term)) {
      term = _.toLower(term);
      _.forEach(this.searchFields, (searchFld) => {
        searchString = `${searchString}${_.isEmpty(searchString) ? '' : ' OR '}${searchFld}:${term}*`
      });
    }
    const searchUrl = `${this.url}${searchString}&unflatten=${this.unflattenFlag}`;
    this.http.get(`${searchUrl}`).map((res: any, index: number) => {
      // Convert the result to CompleterItem[]
      let data = res.json();
      let matches: CompleterItem[] = _.map(data, (mintDataItem: any) => { return this.convertToItem(mintDataItem); });
      this.next(matches);
    }).subscribe();
  }

  public cancel() {
    // Handle cancel
  }

  public convertToItem(data: any): CompleterItem | null {
    if (!data) {
      return null;
    }
    const item: any = {};
    _.forEach(this.fields, (fieldName) => {
      if (_.isString(fieldName)) {
        item[fieldName] = data[fieldName];
      } else {
        // expects a value pair
        _.forOwn(fieldName, (srcFld, targetFld) => {
          if (_.get(data, srcFld)) {
            item[srcFld] = _.get(data, srcFld);
          } else {
            item[targetFld] = _.get(data, targetFld);
          }
        });
      }
    });
    // build the title,
    let completerItem = {};
    completerItem[this.compositeTitleName] = this.getTitle(data);
    completerItem['description'] = this.getCompleterDescription(data);
    completerItem['originalObject'] = item;
    return completerItem as CompleterItem;
  }

  getCompleterDescription(data: any): string {
    let description = '';
    const fieldDesc = this.titleCompleterDescription;
    if (data) {
      if (_.isString(fieldDesc)) {
        const ele = data[fieldDesc];
        description = _.toString(_.head(ele)) || '';
      } else if (_.isArray(fieldDesc)) {
        // enable descriptions to be built as an array
        _.forEach(fieldDesc, (fDesc: any) => {
          description = `${description}${_.isEmpty(description) ? '' : this.titleFieldDelim}${data[fDesc]}`
        });
      }
    }
    return description;
  }

  getTitle(data: any): string {
    let title = '';
    if (data) {
      if (_.isString(this.titleFieldDelim)) {
        _.forEach(this.titleFieldArr, (titleFld: string) => {
          const titleVal = data[titleFld];
          if (titleVal) {
            title = `${title}${_.isEmpty(title) ? '' : this.titleFieldDelim}${data[titleFld]}`;
          }
        });
      } else {
        // expecting a delim pair array, 'prefix', 'suffix'
        _.forEach(this.titleFieldArr, (titleFld: string, idx) => {
          const delimPair = this.titleFieldDelim[idx];
          const titleVal = data[titleFld];
          if (titleVal) {
            title = `${title} ${titleVal}${delimPair.suffix}`;
          }
        });
      }
    }
    return title;
  }
}

@Injectable()
export class VocabFieldLookupService extends BaseService {

  constructor(@Inject(Http) http: Http, @Inject(ConfigService) protected configService: ConfigService) {
    super(http, configService);
  }

  getLookupData(field: VocabField) {
    const vocabId = field.vocabId;
    // only retrieving static data when on vocab mode
    if (field.sourceType == "vocab") {
      const url = `${this.brandingAndPortalUrl}/${this.config.vocabRootUrl}/${vocabId}`;
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
    return `${this.brandingAndPortalUrl}/${this.config.collectionRootUri}/${collectionId}/?search=`;
  }

  getUserLookupUrl(searchSource: string = '') {
    return `${this.brandingAndPortalUrl}/${this.config.userRootUri}/?source=${searchSource}&name=`;
  }

  findLookupData(field: VocabField, search: string) {

  }

  getMintRootUrl(source: string) {
    return `${this.brandingAndPortalUrl}/${this.config.mintRootUri}/${source}/?search=`;
  }

  getExternalServiceUrl(provider: string) {
    return `${this.brandingAndPortalUrl}/external/vocab/${provider}`;
  }


}

@Component({
  selector: 'rb-vocab',
  template: `
  <ng-container *ngIf="field.visible">
  <div *ngIf="field.editMode && !isEmbedded" [formGroup]='form' [ngClass]="getGroupClass()">
    <label [attr.for]="field.name" *ngIf="field.label">
     <span [outerHTML]="field.label"></span><span class="form-field-required-indicator" [innerHTML]="getRequiredLabelStr()"></span>
      <button type="button" class="btn btn-default" *ngIf="field.help" (click)="toggleHelp()" [attr.aria-label]="'help' | translate "><span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button>
    </label>
    <span id="{{ 'helpBlock_' + field.name }}" class="help-block" *ngIf="this.helpShow" [innerHtml]="field.help">{{field.help}}</span>
    <ng2-completer #ngCompleter  (keyup)="onKeyup($event)" [inputId]="field.name" [(ngModel)]="field.searchStr" [ngModelOptions]="{standalone: true}" [disableInput]="disableInput" [placeholder]="field.placeHolder" [clearUnselected]="getClearUnselected()" (selected)="onSelect($event)" [datasource]="field.dataService" [minSearchLength]="0" [inputClass]="'form-control ' + field.cssClasses" [initialValue]="field.initialValue"></ng2-completer>
    <div class="text-danger" *ngIf="hasRequiredError()">{{field.validationMessages.required}}</div>
  </div>
  <div *ngIf="field.editMode && isEmbedded" [formGroup]='form' [ngClass]="getGroupClass()">
    <div class="row">
      <span id="{{ 'helpBlock_' + field.name }}" class="help-block" *ngIf="this.helpShow" [innerHtml]="field.help">{{field.help}}</span>
      <div class="col-xs-11 padding-remove">
        <ng2-completer #ngCompleter  (keyup)="onKeyup($event)" [inputId]="name" [(ngModel)]="field.searchStr" [ngModelOptions]="{standalone: true}" [disableInput]="disableInput" [placeholder]="field.placeHolder" [clearUnselected]="getClearUnselected()" (selected)="onSelect($event)" [datasource]="field.dataService" [minSearchLength]="0" [inputClass]="'form-control '" [initialValue]="field.initialValue"></ng2-completer>
      </div>
      <div class="col-xs-1 padding-remove">
        <button type='button' *ngIf="removeBtnText" [disabled]="!canRemove" (click)="onRemove($event)" [ngClass]="removeBtnClass" >{{removeBtnText}}</button>
        <button [disabled]="!canRemove" type='button' [ngClass]="removeBtnClass" (click)="onRemove($event)" [attr.aria-label]="'remove-button-label' | translate"></button>
      </div>
    </div>
    <div class="row">
      <div class="col-xs-12 text-danger" *ngIf="hasRequiredError()">{{field.validationMessages.required}}</div>
    </div>
  </div>

  <li *ngIf="!field.editMode" class="key-value-pair">
    <span *ngIf="field.label" class="key">{{field.label}}</span>
    <span class="value">{{getTitle()}}</span>
  </li>
  </ng-container>
  `,
})
export class VocabFieldComponent extends SimpleComponent {
  @Input() field: VocabField;
  @Input() isEmbedded: boolean = false;
  @Input() canRemove: boolean = false;
  @Input() removeBtnText: string = null;
  @Input() removeBtnClass: string = 'fa fa-minus-circle btn text-20 pull-right btn-danger';
  @Input() index: number;
  @Input() disableEditAfterSelect: boolean = true;
  @Output() onRemoveBtnClick: EventEmitter<any> = new EventEmitter<any>();
  disableInput: boolean;
  @ViewChild('ngCompleter') public ngCompleter: ElementRef;

  constructor() {
    super();
  }

  ngOnInit() {
    this.field.component = this;
    if (_.isEmpty(this.field.value) || _.isNull(this.field.value) || _.isUndefined(this.field.value)) {
      this.loaded = true;
    }

  }

  public getGroupClass(fldName: string = null): string {
    if (this.isEmbedded) {
      return `col-xs-12 form-group ${this.hasRequiredError() ? 'has-error' : ''}`;
    } else {
      if (!_.isEmpty(this.field.groupClasses)) {
        return this.field.groupClasses
      }
      return '';
    }
  }



  onSelect(selected: any, emitEvent: boolean = true, updateTitle: boolean = false) {
    console.log(`On select:`);
    console.log(selected);
    let disableEditAfterSelect = this.disableEditAfterSelect && this.field.disableEditAfterSelect;
    if (selected) {
      if (this.loaded) {
        this.field.onItemSelect.emit(selected['originalObject']);
      } else {
        if (this.field.dontEmitEventOnLoad) {
          emitEvent = false;
        }
        // set the flag after initial call
        this.loaded = true;
      }
      if (this.field.storeLabelOnly) {
        this.field.setValue(this.field.getValue(selected.title), emitEvent, updateTitle);
      } else {
        this.field.setValue(this.field.getValue(selected['originalObject']), emitEvent, updateTitle);
      }
      if (disableEditAfterSelect)
        this.disableInput = true;
    } else {
      if (disableEditAfterSelect) {
        // means user can't edit, so no worries!
        this.field.setValue(null, emitEvent, updateTitle);
      } else {
        // set whatever value on the searchStr, let the fields decide how to parse the string...
        this.field.setValue(this.field.getValue(this.field.searchStr), emitEvent, updateTitle);
      }
    }
  }

  onKeyup(value: any) {
    let disableEditAfterSelect = this.disableEditAfterSelect && this.field.disableEditAfterSelect;
    if (!disableEditAfterSelect && !this.field.restrictToSelection) {
      this.field.formModel.setValue(this.field.getValue(this.field.searchStr));
    }

  }

  onRemove(event: any) {
    this.onRemoveBtnClick.emit([event, this.index]);
  }

  getTitle() {
    return this.field && _.isFunction(this.field.getTitle) ? this.field.getTitle(this.field.value) : '';
  }

  getClearUnselected() {
    if (this.field.restrictToSelection) {
      return true;
    } else {
      return this.disableEditAfterSelect && this.field.disableEditAfterSelect;
    }
  }
}

export class MintRelationshipLookup {

  searchFieldStr: string;
  http: Http;

  constructor(private url: string, http: Http, searchFieldStr: string) {
    this.http = http;
    this.searchFieldStr = searchFieldStr;
  }

  search(term, lower) {
    term = _.trim(luceneEscapeQuery.escape(term));
    let searchString = '';
    if (!_.isEmpty(term)) {
      if (lower) term = _.toLower(term);
      if (_.isEmpty(this.searchFieldStr)) {
        searchString = term;
      } else {
        _.forEach(this.searchFieldStr.split(','), (searchFld) => {
          searchString = `${searchString}${_.isEmpty(searchString) ? '' : ' OR '}${searchFld}:${term}`
        });
      }
    }
    const searchUrl = `${this.url}${searchString}`;
    return this.http.get(`${searchUrl}`);
  }
}
