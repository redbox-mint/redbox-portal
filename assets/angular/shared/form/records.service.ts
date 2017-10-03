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

  getForm(oid: string = null, editable: boolean = true) {
    if (_.isEmpty(oid)) {
      oid = null;
    }
    return this.getFormFieldsMeta(this.config.defaultForm, editable, oid).then((form:any) => {
      return this.fcs.getLookupData(form.fieldsMeta).flatMap((fields:any) => {
        form.fieldsMata = fields;
        return Observable.of(form);
      });
    });
  }

  getFormFields(formName:string, oid: string=null, editable:boolean) {
    const url = oid ? `${this.brandingAndPortalUrl}/record/form/auto/${oid}?edit=${editable}` : `${this.brandingAndPortalUrl}/record/form/${formName}?edit=${editable}`;
    return this.http.get(url, this.options)
      .toPromise()
      .then((res:any) => this.extractData(res));
  }

  getFormFieldsMeta(formName:string, editable:boolean, oid:string=null) {
    return this.getFormFields(formName, oid, editable).then((form:any) => {
      if (form && form.fields) {
        form.fieldsMeta = this.fcs.getFieldsMeta(form.fields);
      } else {
        console.error("Error loading form:" + formName);
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
      _.forEach(params.activeRefiners, (refiner: RecordSearchRefiner)=> {
        switch (refiner.type) {
          case "exact":
            exactSearchNames = `${_.isEmpty(exactSearchNames) ? `&exactNames=` : `${exactSearchNames},`}${refiner.name}`;
            exactSearchValues = `${exactSearchValues}&exact_${refiner.name}=${refiner.value}`;
            break;
        }
      });
      refinedSearchStr = `${exactSearchNames}${exactSearchValues}`;
    }
    return this.http.get(`${this.brandingAndPortalUrl}/record/search/${params.recordType}/?searchStr=${params.basicSearch}${refinedSearchStr}`, this.getOptionsClient())
    .toPromise()
    .then((res:any) => this.extractData(res) as RecordActionResult);
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
  active: boolean;
  typeLabel: string;

  constructor(opts: any = {}) {
    this.name = opts.name;
    this.title = opts.title;
    this.type = opts.type;
    this.value = opts.value;
    this.typeLabel = opts.typeLabel;
  }
}

export class RecordSearchParams {
  recordType: string;
  basicSearch: string;
  activeRefiners: any[];
  refinerConfig: RecordSearchRefiner[];

  constructor(recType: string) {
    this.recordType = recType;
    this.clear();
  }

  clear() {
    this.basicSearch = null;
    _.forEach(this.activeRefiners, refiner => {
      refiner.value = '';
    });
    this.activeRefiners = [];
  }

  getRefinerConfig(name: string) {
    return _.find(this.refinerConfig, (config) => {
      return config.name == name;
    });
  }

  setRefinerConfig(config: RecordSearchRefiner[]) {
    this.refinerConfig = config;
  }

  getHttpQuery(searchUrl: string) {
    let refinerValues = '';
    _.forEach(this.activeRefiners, (refiner:RecordSearchRefiner) => {
      refinerValues = `${refinerValues}&refiner_${refiner.name}=${refiner.value}`;
    });
    return `${searchUrl}?q=${this.basicSearch}&type=${this.recordType}${refinerValues}`;
  }

  getRefinerConfigs() {
    return this.refinerConfig;
  }

  addActiveRefiner(refiner: RecordSearchRefiner) {
    var novelRefiner = true;
    _.forEach(this.activeRefiners, (record:RecordSearchRefiner) => {
      if (record.name === refiner.name) {
        record.value = refiner.value;
        novelRefiner = false;
      }
    });
    if (novelRefiner) {
      this.activeRefiners.push(refiner);
    }
  }

  addActiveRefinerStr(queryStr:string) {
    let refinerValues = {};
    _.forEach(queryStr.split('&'), (q)=> {
      const qObj = q.split('=');
      if (_.startsWith(qObj[0], "refiner_")) {
        const refinerName = qObj[0].split('_')[1];
        refinerValues[refinerName] = qObj[1];
      }
    });
    _.forOwn(refinerValues, (value, name) => {
      var config = this.getRefinerConfig(name);
      config.value = value;
      this.addActiveRefiner(config);
    });
  }

  hasActiveRefiners() {
    return _.size(this.activeRefiners) > 0;
  }

}
