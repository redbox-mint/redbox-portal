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
import { Input, Component, OnInit, Inject, Injector } from '@angular/core';
import { SimpleComponent } from './field-simple.component';
import { FieldBase } from './field-base';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import * as _ from "lodash";
import { RecordsService } from './records.service';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/zip';
import { fromPromise } from 'rxjs/observable/fromPromise';
import {DomSanitizer} from '@angular/platform-browser';



/**
 * Related Objects for a particular record.
 *
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
export class RelatedObjectDataField extends FieldBase<any> {

  showHeader: boolean;
  validators: any;
  enabledValidators: boolean;
  relatedObjects: object[];
  accessDeniedObjects: object[];
  failedObjects: object[];
  hasInit: boolean;
  recordsService: RecordsService;
  columns: object[];
  ignoreEmptyTitle: boolean;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.relatedObjects = [];
    this.accessDeniedObjects = [];
    this.failedObjects = [];
    this.columns = options['columns'] || [];

    var relatedObjects = this.relatedObjects;
    this.value = options['value'] || this.setEmptyValue();
    this.recordsService = this.getFromInjector(RecordsService);
    this.ignoreEmptyTitle = _.isUndefined(options['ignoreEmptyTitle']) ? false : options['ignoreEmptyTitle'];
  }

/**
* Loading the metadata for each related object in the array
*/
  asyncLoadData() {
    let getRecordMetaObs = [];
    var that = this;
    const portalPath = this.recordsService.getBrandingAndPortalUrl;

    _.forEach(this.value, (item: any) => {
      getRecordMetaObs.push(fromPromise(this.recordsService.getRecordMeta(item.id)).flatMap(meta => {
        const customFields = {oid: item.id, portalPath: portalPath};
        // we add a property called 'oid' so the item can be 'linked' in the UI
        if (!meta) {
          that.failedObjects.push(customFields);
        } else {
          _.merge(meta, customFields);
          if (meta['status'] == "Access Denied") {
            that.accessDeniedObjects.push(meta);
          } else if (meta['title'] || that.ignoreEmptyTitle) {
            that.relatedObjects.push(meta);
          } else {
            that.failedObjects.push(meta);
          }
        }
        return Observable.of(null);
      }));
    });
    if ( getRecordMetaObs.length > 0 ) {
      return Observable.zip(...getRecordMetaObs);
    } else {
      return Observable.of(null);
    }
  }

  refreshRelatedObjectData() {
    this.failedObjects = []
    this.accessDeniedObjects  = []
    this.relatedObjects  = []
    let observables:Observable<any> = this.asyncLoadData();
    observables.subscribe(result => { });
  }

  createFormModel(valueElem: any = undefined): any {
    if (valueElem) {
      this.value = valueElem;
    }

    this.formModel = new FormControl(this.value || []);

    if (this.value) {
      this.setValue(this.value);
    }

    return this.formModel;
  }

  setValue(value: any) {
    this.value = value;
    this.formModel.patchValue(value, { emitEvent: false });
    this.formModel.markAsTouched();
  }

  setEmptyValue() {
    this.value = [];
    return this.value;
  }

  getPropertyValue(item: any, columnConf: any) {
    let val = '';
    if (_.isArray(columnConf.property)) {
      _.each(columnConf.property, (propName) => {
        if (_.isString(item)) {
          val = item;
        } else {
          val = _.get(item, propName);
          if (!_.isEmpty(val)) {
            return false;
          }
        }
      });
    } else {
      val = _.get(item, columnConf.property);
    }
    return val;
  }

  getPropertyLabel(item: any, columnConf: any) {
    const val = this.getPropertyValue(item, columnConf);
    return this.getTranslated(_.get(val,'label',null), _.get(val,'label',''));
  }

  isMultiValue(item: any, columnConf: any) {
    return _.isArray(this.getPropertyValue(item, columnConf));
  }

  getContext(item: any, columConf: any) {
    return {item: item, column: columConf};
  }
}

declare var aotMode
// Setting the template url to a constant rather than directly in the component as the latter breaks document generation
let rbRelatedObjectDataTemplate = './field-relatedobjectdata.html';
if (typeof aotMode == 'undefined') {
  rbRelatedObjectDataTemplate = '../angular/shared/form/field-relatedobjectdata.html';
}

/**
* Component to display information from related objects within ReDBox
*
*
*
*
*/
@Component({
  selector: 'rb-relatedobjectdata',
  templateUrl: './field-relatedobjectdata.html'
})
export class RelatedObjectDataComponent extends SimpleComponent {
  field: RelatedObjectDataField;

  constructor(private sanitizer: DomSanitizer) {
    super();
  }

  sanitizeUrl(url:string){
    return this.sanitizer.bypassSecurityTrustUrl(url);
  }
}
