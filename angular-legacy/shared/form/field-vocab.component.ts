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
import { Observable, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
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
  public vocabQueryId: string;
  public vocabQueryResultMaxRows: string;
  public queryDelayTimeMs: number;
  public resultArrayProperty: string;
  public unflattenFlag: boolean;
  public exactMatchString: boolean;
  public dontEmitEventOnLoad: boolean;
  public isEmbedded: boolean;
  public groupClass: string;
  public inputClass: string;
  storedEventData: null;
  public storeFreeTextAsString: boolean;
  completerLabelField: string;

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
    this.vocabQueryId = options['vocabQueryId'] ? options['vocabQueryId'] : '';
    this.vocabQueryResultMaxRows = options['vocabQueryResultMaxRows'] ? options['vocabQueryResultMaxRows'] : '50';
    this.queryDelayTimeMs = options['queryDelayTimeMs'] ? options['queryDelayTimeMs'] : 300;
    this.resultArrayProperty = options['resultArrayProperty'] ? options['resultArrayProperty'] : '';
    this.unflattenFlag = _.isUndefined(options['unflattenFlag']) ? false : options['unflattenFlag'];
    this.exactMatchString = _.isUndefined(options['exactMatchString']) ? false : options['exactMatchString'];
    this.dontEmitEventOnLoad = _.isUndefined(options['dontEmitEventOnLoad']) ? false : options['dontEmitEventOnLoad'];
    this.groupClasses = _.isUndefined(options['groupClasses']) ? '' : options['groupClasses'];
    this.cssClasses = _.isUndefined(options['cssClasses']) ? '' : options['cssClasses'];
    this.storeFreeTextAsString = _.isUndefined(options['storeFreeTextAsString']) ? false : options['storeFreeTextAsString'];
    this.completerLabelField = _.isUndefined(options['completerLabelField']) ? null : options['completerLabelField'];
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
        const init = {};
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
    const selected = {};
    if (this.storeLabelOnly || this.storeFreeTextAsString) {
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
      const availableSourceData = this.findAvailableSourceData(this.sourceData);
      // Hack for creating the intended title...
      _.forEach(availableSourceData, (data: any) => {
        data.title = this.getTitle(data);
      });
      this.dataService = this.completerService.local(availableSourceData, this.searchFields, 'title');
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
        this.unflattenFlag,
        this.exactMatchString);
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
    } else if (this.sourceType == "query") {
      const url = this.lookupService.getRedboxLookupServiceUrl(this.vocabQueryId);
      this.dataService = new ReDBoxQueryLookupDataService(
        url,
        this.lookupService.http,
        this.resultArrayProperty,
        this.titleFieldName,
        this.titleFieldArr,
        this.titleFieldDelim,
        this.vocabQueryResultMaxRows,
        this.queryDelayTimeMs,
        this.storeFreeTextAsString,
        this.completerLabelField
      );
    }
  }

  private findAvailableSourceData(sourceData: any): any[] {
    if (!_.isArray(sourceData)) {
      return [];
    }
    return _.filter(sourceData, (option: any) => this.isOptionAvailable(option));
  }

  private isOptionAvailable(option: any): boolean {
    if (!this.isHistoricalOption(option)) {
      return true;
    }
    return this.optionMatchesCurrentValue(option);
  }

  private isHistoricalOption(option: any): boolean {
    return _.get(option, 'historical') === true || _.get(option, 'historicalOnly') === true;
  }

  private optionMatchesCurrentValue(option: any): boolean {
    if (_.isNil(this.value) || _.isEmpty(this.value)) {
      return false;
    }

    const mappedOptionValue = this.getValue(option);
    if (this.currentValueContainsMappedValue(this.value, mappedOptionValue)) {
      return true;
    }

    const optionCandidates = this.collectComparisonValues(option, ['value', 'notation', 'identifier', 'id', 'uri']);
    if (_.isEmpty(optionCandidates)) {
      return false;
    }
    const currentCandidates = this.collectComparisonValues(this.value);
    return _.some(optionCandidates, candidate => _.includes(currentCandidates, candidate));
  }

  private currentValueContainsMappedValue(currentValue: any, mappedValue: any): boolean {
    if (_.isNil(mappedValue) || _.isEmpty(mappedValue) || _.isNil(currentValue) || _.isEmpty(currentValue)) {
      return false;
    }

    if (_.isArray(currentValue)) {
      return _.some(currentValue, (entry: any) => this.currentValueContainsMappedValue(entry, mappedValue));
    }

    if (_.isObject(mappedValue) && !_.isArray(mappedValue)) {
      if (!_.isObject(currentValue) || _.isArray(currentValue)) {
        return false;
      }
      const keys = _.keys(mappedValue).filter((key: string) => !_.isNil(mappedValue[key]) && String(mappedValue[key]).trim() !== '');
      if (_.isEmpty(keys)) {
        return false;
      }
      return _.every(keys, (key: string) => this.compareFieldValue(_.get(currentValue, key), mappedValue[key]));
    }

    return this.compareFieldValue(currentValue, mappedValue);
  }

  private compareFieldValue(current: any, expected: any): boolean {
    if (_.isArray(current)) {
      return _.some(current, (entry: any) => this.compareFieldValue(entry, expected));
    }

    const normalizedCurrent = this.normalizeComparisonValue(current);
    const normalizedExpected = this.normalizeComparisonValue(expected);
    if (_.isNil(normalizedCurrent) || _.isNil(normalizedExpected)) {
      return false;
    }

    return normalizedCurrent === normalizedExpected;
  }

  private collectComparisonValues(value: any, preferredKeys: string[] = []): string[] {
    const result = new Set<string>();
    const visit = (candidate: any): void => {
      if (_.isNil(candidate)) {
        return;
      }
      if (_.isArray(candidate)) {
        _.forEach(candidate, visit);
        return;
      }
      if (_.isObject(candidate)) {
        _.forOwn(candidate, (entryValue: any) => visit(entryValue));
        return;
      }
      const normalized = this.normalizeComparisonValue(candidate);
      if (!_.isNil(normalized)) {
        result.add(normalized);
      }
    };

    if (_.isObject(value) && !_.isArray(value) && !_.isEmpty(preferredKeys)) {
      _.forEach(preferredKeys, (key: string) => {
        const normalized = this.normalizeComparisonValue(_.get(value, key));
        if (!_.isNil(normalized)) {
          result.add(normalized);
        }
      });
    }

    visit(value);
    return Array.from(result);
  }

  private normalizeComparisonValue(value: any): string | null {
    if (_.isNil(value) || _.isObject(value)) {
      return null;
    }
    const normalized = String(value).trim();
    return _.isEmpty(normalized) ? null : normalized;
  }

  public getTitle(data: any): string {
    let title = '';
    if (!data) {
      if (this.storedEventData != null) {
        data = _.clone(this.storedEventData);
        this.storedEventData == null;
      }
    }
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
        // Also, check if the `data.title` already has the first of the delim prefix, skipping if it does to avoid double prefixing (brackets)
        const startDelim = _.get(_.head(this.titleFieldDelim), 'prefix');
        if (data.title && _.startsWith(data.title, startDelim)) {
          title = data.title;
          return title;
        }
        // expecting a delim pair array, 'prefix', 'suffix'
        _.forEach(this.titleFieldArr, (titleFld: string, idx) => {
          const delimPair = this.titleFieldDelim[idx];
          const titleVal = data[titleFld];
          if (titleVal) {
            title = `${title}${_.isEmpty(titleVal) ? '' : delimPair.prefix}${titleVal}${_.isEmpty(titleVal) ? '' : delimPair.suffix}`;
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
        if (this.storeLabelOnly || this.storeFreeTextAsString) {
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
      if (!_.isUndefined(this.component.ngCompleter)) {
        this.component.ngCompleter.ctrInput.nativeElement.value = this.getTitle(value);
      } else {
        this.storedEventData = _.clone(value);
      }
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
      this.validators = objectRequired();
      this.formModel.setValidators(this.validators);
    } else {
      if (_.isFunction(this.validators) && _.isEqual(this.validators, objectRequired())) {
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
      if (_.isFunction(this.validators) && _.isEqual(this.validators, objectRequired())) {
        this.validators = null;
      } else {
        _.remove(this.validators, (v) => {
          return _.isEqual(v, objectRequired());
        });
      }
    }
    if (this.validators) {
      this.formModel.setValidators(this.validators);
    } else {
      this.formModel.clearValidators();
    }
  }

  public setVisibility(data, eventConf: any = {}) {
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
            if (that['disableValidators'] != null && typeof (that['disableValidators']) == 'function') {
              that['disableValidators']();
            } else {
              that.formModel.clearValidators();
            }
            that.formModel.updateValueAndValidity();
            that.storedEventData = _.clone(that.formModel.value)
          }
        }
      } else {
        if (!that.visible) {
          // restore validators
          if (that.formModel) {
            if (that['enableValidators'] != null && typeof (that['enableValidators']) == 'function') {
              that['enableValidators']();
            } else {
              that.formModel.setValidators(that.validators);
            }
            that.formModel.updateValueAndValidity();
            setTimeout(() => {
              that.component.ngCompleter.ctrInput.nativeElement.value = that.getTitle(null);
            });
          }
        }
      }
      that.visible = newVisible;
    });
    if (eventConf.returnData == true) {
      return data;
    }

  }

}

export function objectRequired(): ValidationErrors | null {

  return (control: AbstractControl): { [key: string]: any } | null =>
    (_.isEqual(control.value, {}) || _.isEmpty(control.value))
      ? { 'required': true } : null;


}

class ReDBoxQueryLookupDataService extends Subject<CompleterItem[]> implements CompleterData {
  storedEventData: any = null;
  private searchTerms = new Subject<string>();
  private searchSubscription: Subscription;

  constructor(private url: string,
    private http: Http,
    private arrayProperty: string,
    private compositeTitleName: string,
    private titleFieldArr: string[],
    private titleFieldDelim: string,
    private maxRows: string,
    private queryDelayTimeMs: number = 300,
    private storeFreeTextAsString: boolean = false,
    private completerLabelField: string) {
    super();
    this.searchSubscription = this.searchTerms.pipe(
      debounceTime(this.queryDelayTimeMs), // Wait for a default 300ms of inactivity
    ).subscribe(term => {
      this.performSearch(term);
    });
  }

  public search(term: string): void {
    this.searchTerms.next(term);
  }

  public performSearch(term: string): void {
    const that = this;
    this.http.get(`${this.url}?search=${term}&start=0&rows=${this.maxRows}`).map((res: any, index: number) => {
      const data = res.json();
      const arrayPath = that.arrayProperty;
      let itemArray = [];
      if (_.isUndefined(arrayPath) || _.isEmpty(arrayPath)) {
        itemArray = data;
      } else {
        itemArray = _.get(data, arrayPath);
      }
      // Convert the result to CompleterItem[]
      const matches: (CompleterItem)[] = [];
      _.each(itemArray, item => {
        const completerItem = this.convertToItem(item)
        if (completerItem != null) {
          matches.push(completerItem);
        }
      });

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
    const completerItem = {};
    completerItem[this.compositeTitleName] = this.getTitle(data);
    completerItem['description'] = _.get(data, this.completerLabelField, this.getTitle(data));
    completerItem['originalObject'] = data;
    return completerItem as CompleterItem;
  }

  getTitle(data: any): string {
    let title = '';
    if (data == null) {
      if (this.storedEventData != null) {
        data = _.clone(this.storedEventData);
      }
      this.storedEventData = null;
    }

    if (data) {
      if (_.isString(this.titleFieldDelim)) {
        _.forEach(this.titleFieldArr, (titleFld: string) => {
          const titleVal = _.get(data, titleFld);
          if (titleVal) {
            title = `${title}${_.isEmpty(title) ? '' : this.titleFieldDelim}${titleVal}`;
          }
        });
      } else {
        // Intention is to wrap the title with a prefix and suffix if the underlying value is an object
        // However, the completerItem always converts a string array entry to a object with a 'title' field
        // When the field is storing freely entered text, then there is no need to wrap the title
        if (_.isString(data) || (this.storeFreeTextAsString && _.isObject(data) && _.keys(data).length === 1 && _.isString(_.values(data)[0]))) {
          return _.isString(data) ? data : _.values(data)[0];
        }
        // Also, check if the `data.title` already has the first of the delim prefix, skipping if it does to avoid double prefixing (brackets)
        const startDelim = _.get(_.head(this.titleFieldDelim), 'prefix');
        if (data.title && _.startsWith(data.title, startDelim)) {
          title = data.title;
          return title;
        }
        // expecting a delim pair array, 'prefix', 'suffix'
        _.forEach(this.titleFieldArr, (titleFld: string, idx) => {
          const delimPair: any = this.titleFieldDelim[idx];
          const titleVal = data[titleFld];
          if (titleVal) {
            // The previous code was only adding the suffix to the last field, but not the prefix as shown in the commented line below. If this is intentional, please don't merge this change.
            // title = `${title} ${titleVal}${delimPair.suffix}`;
            title = `${title}${delimPair.prefix}${titleVal}${delimPair.suffix}`;
          }
        });
      }
    }
    return title;
  }
}

class ExternalLookupDataService extends Subject<CompleterItem[]> implements CompleterData {
  storedEventData: any = null;

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
      const data = res.json();
      const itemArray = _.get(data, this.arrayProperty);
      const matches: CompleterItem[] = [];
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
    const completerItem = {};
    completerItem[this.compositeTitleName] = this.getTitle(data);
    completerItem['originalObject'] = data;
    return completerItem as CompleterItem;
  }

  getTitle(data: any): string {
    let title = '';
    if (data == null) {
      if (this.storedEventData != null) {
        data = _.clone(this.storedEventData);
      }
      this.storedEventData = null;
    }

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

  private searchTerms = new Subject<string>();
  private searchSubscription: Subscription;
  searchFields: any[];
  stringWildcard: string = '*';

  constructor(private url: string,
    private http: Http,
    private lookupResponseFields: string[],
    private compositeTitleName: string,
    private titleFieldArr: string[],
    private titleFieldDelim: any[],
    private titleCompleterDescription: string,
    searchFieldStr: any,
    private unflattenFlag: boolean,
    private exactMatchString: boolean) {
    super();
    this.searchFields = searchFieldStr.split(',');

    if (this.exactMatchString) {
      this.stringWildcard = '';
    }

    this.searchSubscription = this.searchTerms.pipe(
      debounceTime(300), // Wait for a default 300ms of inactivity
    ).subscribe(term => {
      this.performSearch(term);
    });

  }

  public search(term: string): void {
    this.searchTerms.next(term);
  }

  public performSearch(term: string): void {
    term = _.trim(luceneEscapeQuery.escape(term));
    let searchString = '';
    if (!_.isEmpty(term)) {
      if (!this.exactMatchString) {
        term = _.toLower(term);
      }
      _.forEach(this.searchFields, (searchFld) => {
        searchString = `${searchString}${_.isEmpty(searchString) ? '' : ' OR '}${searchFld}:${term}${this.stringWildcard}`
      });
    }
    if (!this.exactMatchString || (!_.isEmpty(term) && this.exactMatchString)) {
      const searchUrl = `${this.url}${searchString}&unflatten=${this.unflattenFlag}`;
      this.http.get(`${searchUrl}`).map((res: any, index: number) => {
        // Convert the result to CompleterItem[]
        const data = res.json();
        const matches: CompleterItem[] = _.map(data, (mintDataItem: any) => { return this.convertToItem(mintDataItem); });
        this.next(matches);
      }).subscribe();
    }
  }

  public cancel() {
    // Handle cancel
  }

  public convertToItem(data: any): CompleterItem | null {
    if (!data) {
      return null;
    }
    const item: any = {};
    _.forEach(this.lookupResponseFields, (fieldName) => {
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
    const completerItem = {};
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

  getRedboxLookupServiceUrl(vocabQueryId: string) {
    return `${this.brandingAndPortalUrl}/query/vocab/${vocabQueryId}`;
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
  @Input() disableInput: boolean = false;
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
    const disableEditAfterSelect = this.disableEditAfterSelect && this.field.disableEditAfterSelect;
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
      } else if (this.field.storeFreeTextAsString && (_.isString(selected['originalObject']) || _.keys(selected['originalObject']).length == 1)) {
        // the above condition is true when the field is storing freely entered text
        const title = selected.title || (_.get(selected['originalObject'], 'title') || selected['originalObject']);
        this.field.setValue(this.field.getValue(title), emitEvent, updateTitle);
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
        // Fixed: when previously selected value is modified to a non-match, we need to clear the value
        if (this.field.restrictToSelection) {
          this.field.setEmptyValue(false);
        } else {
          // set whatever value on the searchStr, let the fields decide how to parse the string...
          this.field.setValue(this.field.getValue(this.field.searchStr), emitEvent, updateTitle);
        }
      }
    }
  }

  onKeyup(value: any) {
    const disableEditAfterSelect = this.disableEditAfterSelect && this.field.disableEditAfterSelect;
    if (!disableEditAfterSelect && !this.field.restrictToSelection) {
      if (this.field.storeFreeTextAsString) {
        this.field.formModel.setValue(this.field.searchStr);
      } else {
        this.field.formModel.setValue(this.field.getValue(this.field.searchStr));
      }
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
