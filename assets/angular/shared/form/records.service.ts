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

import { Injectable, Inject }       from '@angular/core';
import { TextField } from './field-simple';
import { FieldBase }     from './field-base';
import { BaseService } from '../base-service';
import { Http } from '@angular/http';
import 'rxjs/add/operator/toPromise';
import { FieldControlService } from './field-control.service';
import { Observable } from 'rxjs/Observable';
import * as _ from "lodash-lib";
import { ConfigService } from '../config-service';
/**
 * Plan Client-side services
 *
 *
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 */
@Injectable()
export class RecordsService extends BaseService {

  constructor (@Inject(Http) http: Http, @Inject(FieldControlService) protected fcs: FieldControlService, @Inject(ConfigService) protected configService: ConfigService) {
    super(http, configService);
  }

  getForm(oid: string = null, recordType: string = null, editable: boolean = true) {
    if (_.isEmpty(oid)) {
      oid = null;
    }
    return this.getFormFieldsMeta(recordType, editable, oid).then((form:any) => {
      return this.fcs.getLookupData(form.fieldsMeta).flatMap((fields:any) => {
        form.fieldsMata = fields;
        return Observable.of(form);
      });
    });
  }

  getFormFields(recordType:string, oid: string=null, editable:boolean) {
    console.log("Oid is: " + oid);
    const url = oid ? `${this.brandingAndPortalUrl}/record/form/auto/${oid}?edit=${editable}` : `${this.brandingAndPortalUrl}/record/form/${recordType}?edit=${editable}`;
    console.log("URL is: " + url);
    return this.http.get(url, this.options)
      .toPromise()
      .then((res:any) => this.extractData(res));
  }

  getFormFieldsMeta(recordType:string, editable:boolean, oid:string=null) {
    return this.getFormFields(recordType, oid, editable).then((form:any) => {
      if (form && form.fields) {
        form.fieldsMeta = this.fcs.getFieldsMeta(form.fields);
      } else {
        console.error("Error loading form:" + recordType);
        throw form;
      }
      return form;
    });
  }

  create(record: any) {
    return this.http.post(`${this.brandingAndPortalUrl}/recordmeta/`, record, this.getOptionsClient())
    .toPromise()
    .then((res:any) => this.extractData(res) as RecordActionResult);
  }

  update(oid: string, record: any) {
    return this.http.put(`${this.brandingAndPortalUrl}/recordmeta/${oid}`, record, this.getOptionsClient())
    .toPromise()
    .then((res:any) => this.extractData(res) as RecordActionResult);
  }

  stepTo(oid: string, record: any, targetStep: string) {
    return this.http.post(`${this.brandingAndPortalUrl}/record/workflow/step/${targetStep}/${oid}`, record, this.getOptionsClient())
    .toPromise()
    .then((res:any) => this.extractData(res) as RecordActionResult);
  }

  getDashboardUrl() {
    return `${this.brandingAndPortalUrl}/dashboard`;
  }

  modifyEditors(records, username) {
    return this.http.post(`${this.brandingAndPortalUrl}/record/editors/modify`, {records:records, username:username}, this.getOptionsClient())
    .toPromise()
    .then((res:any) => this.extractData(res) as RecordActionResult);
  }

  search(params: RecordSearchParams) {
    let refinedSearchStr = '';
    if (_.size(params.activeRefiners) > 0) {
      let exactSearchNames = '';
      let exactSearchValues = '';
      let facetSearchNames = '';
      let facetSearchValues = '';
      _.forEach(params.activeRefiners, (refiner: RecordSearchRefiner)=> {
        switch (refiner.type) {
          case "exact":
            exactSearchNames = `${_.isEmpty(exactSearchNames) ? `&exactNames=` : `${exactSearchNames},`}${refiner.name}`;
            exactSearchValues = `${exactSearchValues}&exact_${refiner.name}=${refiner.value}`;
            break;
          case "facet":
            facetSearchNames = `${_.isEmpty(facetSearchNames) ? `&facetNames=` : `${facetSearchNames},`}${refiner.name}`;
            if (!_.isEmpty(refiner.activeValue)) {
              facetSearchValues = `${facetSearchValues}&facet_${refiner.name}=${refiner.activeValue}`;
            }
            break;
        }
      });
      refinedSearchStr = `${exactSearchNames}${exactSearchValues}${facetSearchNames}${facetSearchValues}`;
    }
    return this.http.get(`${this.brandingAndPortalUrl}/record/search/${params.recordType}/?searchStr=${params.basicSearch}${refinedSearchStr}`, this.getOptionsClient())
    .toPromise()
    .then((res:any) => this.extractData(res) as RecordActionResult);
  }

  getType(name: string) {
    return this.http.get(`${this.brandingAndPortalUrl}/record/type/${name}`, this.getOptionsClient())
    .toPromise()
    .then((res:any) => this.extractData(res));
  }
}

export class RecordActionResult {
  success:boolean;
  oid: string;
  message: string;
}

export class RecordSearchRefiner {
  name: string;
  title: string;
  type: string;
  value: any;
  alwaysActive: boolean;
  typeLabel: string;
  activeValue: any;

  constructor(opts: any = {}) {
    this.name = opts.name;
    this.title = opts.title;
    this.type = opts.type;
    this.value = opts.value;
    this.typeLabel = opts.typeLabel;
    this.alwaysActive = opts.alwaysActive;
  }

  setCurrentValue(value: any) {
    if (this.type == "facet") {
      this.activeValue = value;
    } else {
      this.value = value;
    }
  }
}

export class RecordSearchParams {
  recordType: string;
  basicSearch: string;
  activeRefiners: any[];
  refinerConfig: RecordSearchRefiner[];

  constructor(recType: string) {
    this.recordType = recType;
    this.activeRefiners = [];
    this.clear();
  }

  clear() {
    this.basicSearch = null;
    _.remove(this.activeRefiners, refiner => {
      refiner.value = null;
      refiner.activeValue = null;
      return !refiner.alwaysActive;
    });
  }

  getRefinerConfig(name: string) {
    return _.find(this.refinerConfig, (config) => {
      return config.name == name;
    });
  }

  setRefinerConfig(config: RecordSearchRefiner[]) {
    this.refinerConfig = config;
    // parse through and activate those set as active...
    _.forEach(this.refinerConfig, (refinerConfig) => {
      if (refinerConfig.alwaysActive) {
        this.addActiveRefiner(refinerConfig);
      }
    });
  }

  getHttpQuery(searchUrl: string) {
    let refinerValues = '';
    _.forEach(this.activeRefiners, (refiner:RecordSearchRefiner) => {
      if (refiner.type == "facet") {
        refinerValues = `${refinerValues}&refiner|${refiner.name}=${_.isEmpty(refiner.activeValue) ? '' : refiner.activeValue}`;
      } else {
        refinerValues = `${refinerValues}&refiner|${refiner.name}=${_.isEmpty(refiner.value) ? '' : refiner.value}`;
      }
    });
    return `${searchUrl}?q=${this.basicSearch}&type=${this.recordType}${refinerValues}`;
  }

  getRefinerConfigs() {
    return this.refinerConfig;
  }

  addActiveRefiner(refiner: RecordSearchRefiner) {
    const existingRefiner = _.find(this.activeRefiners, (activeRefiner:RecordSearchRefiner) => {
      return activeRefiner.name == refiner.name;
    });
    if (existingRefiner) {
      existingRefiner.value = refiner.value;
    } else {
      this.activeRefiners.push(refiner);
    }
  }

  parseQueryStr(queryStr:string) {
    queryStr = decodeURI(queryStr);
    let refinerValues = {};
    _.forEach(queryStr.split('&'), (q)=> {
      const qObj = q.split('=');
      if (_.startsWith(qObj[0], "q")) {
        this.basicSearch = qObj[1];
      }
      if (_.startsWith(qObj[0], "refiner|")) {
        const refinerName = qObj[0].split('|')[1];
        refinerValues[refinerName] = qObj[1];
      }
    });
    _.forOwn(refinerValues, (value, name) => {
      const config = this.getRefinerConfig(name);
      config.setCurrentValue(value);
      this.addActiveRefiner(config);
    });
  }

  hasActiveRefiners() {
    let hasActive = false;
    _.forEach(this.activeRefiners, (refiner: RecordSearchRefiner) => {
      if (!hasActive && (!_.isEmpty(refiner.value))) {
        hasActive = true;
      }
    });
    return hasActive;
  }

  setFacetValues(facets: any) {
    _.forEach(facets, (facet: any) => {
      const refiner = _.find(this.activeRefiners, (refinerConfig: RecordSearchRefiner) => {
        return refinerConfig.name == facet.name;
      });
      if (refiner) {
        refiner.value = facet.values;
      }
    });
  }

}
