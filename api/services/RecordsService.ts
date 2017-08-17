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

import { Observable } from 'rxjs/Rx';
import services = require('../../typescript/services/CoreService.js');
import {Sails, Model} from "sails";
import * as request from "request-promise";

declare var FormsService, RolesService, UsersService, WorkflowStepsService;
declare var sails: Sails;
declare var _this;

export module Services {
  /**
   * Records related functions...
   *
   * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
   *
   */
  export class Records extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'create',
      'updateMeta',
      'getMeta',
      'hasEditAccess',
      'getOne',
      'search',
      'createBatch'
    ];

    public create(brand, record, formName=sails.config.form.defaultForm): Observable<any> {
      // TODO: validate metadata with the form...
      const options = this.getOptions(sails.config.record.api.create.url);
      options.body = record;
      sails.log.verbose(options);
      return Observable.fromPromise(request[sails.config.record.api.create.method](options));
    }

    public updateMeta(brand, oid, record): Observable<any> {
      // TODO: validate metadata with the form...
      const options = this.getOptions(sails.config.record.api.updateMeta.url, oid);
      options.body = record;
      return Observable.fromPromise(request[sails.config.record.api.updateMeta.method](options));
    }

    public getMeta(oid) {
      const options = this.getOptions(sails.config.record.api.getMeta.url, oid);
      return Observable.fromPromise(request[sails.config.record.api.getMeta.method](options));
    }


    protected getOptions(url, oid=null, packageType=null) {
      if (!_.isEmpty(oid)) {
        url = url.replace('$oid', oid);
      }
      if (!_.isEmpty(packageType)) {
        url = url.replace('$packageType', packageType);
      }
      return {url:url, json:true, headers: {'Authorization': `Bearer ${sails.config.redbox.apiKey}`, 'Content-Type': 'application/json; charset=utf-8'}};
    }

    /**
     * Fine-grained access to the record
     */
    public hasEditAccess(brand, user, record) {
      const isInUserEdit = _.find(record.authorization.edit, username=> {
        return username == user.username;
      });
      if (isInUserEdit !== undefined) {
        return Observable.of(true);
      }
      const isInRoleEdit = _.find(record.authorization.editRoles, roleName => {
        const role = RolesService.getRole(brand, roleName);
        return role && UsersService.hasRole(user, role);
      });
      if (isInRoleEdit !== undefined) {
        return Observable.of(true);
      }
      return WorkflowStepsService.get(brand, record.workflow.stage).flatMap(wfStep => {
        const wfHasRoleEdit = _.find(wfStep.config.authorization.editRoles, roleName => {
          const role = RolesService.getRole(brand, roleName);
          return role && UsersService.hasRole(user, role);
        });
        return Observable.of(wfHasRoleEdit !== undefined);
      });
    }

    public createBatch(type, data, harvestIdFldName) {
      const options = this.getOptions(sails.config.record.api.harvest.url, null, type);
      data = _.map(data, dataItem => {
        return {harvest_id: _.get(dataItem, harvestIdFldName, ''), metadata: {metadata: dataItem, metaMetadata: {type:type}}};
      });
      options.body = {records: data};
      sails.log.verbose(`Sending data:`);
      sails.log.verbose(options.body);
      return Observable.fromPromise(request[sails.config.record.api.harvest.method](options));
    }

    public search(type, searchField, searchStr, returnFields) {
      const url = `${this.getSearchTypeUrl(type, searchField, searchStr)}&start=0&rows=${sails.config.record.export.maxRecords}`;
      sails.log.verbose(`Searching using: ${url}`);
      const options = this.getOptions(url);
      return Observable.fromPromise(request[sails.config.record.api.search.method](options))
              .flatMap(response => {
                const customResp = [];
                _.forEach(response.response.docs, solrdoc => {
                  const customDoc = {};
                  _.forEach(returnFields, retField => {
                    customDoc[retField] = solrdoc[retField][0];
                  });
                  customResp.push(customDoc);
                });
                return Observable.of(customResp);
              });
    }

    public getOne(type) {
      const url = `${this.getSearchTypeUrl(type)}&start=0&rows=1`;
      sails.log.verbose(`Getting one using url: ${url}`);
      const options = this.getOptions(url);
      return Observable.fromPromise(request[sails.config.record.api.search.method](options))
            .flatMap(response => {
              return Observable.of(response.response.docs);
            });
    }

    protected getSearchTypeUrl(type, searchField=null, searchStr=null) {
      const searchParam = searchField ? ` AND ${searchField}:${searchStr}*` : '';
      return `${sails.config.record.api.search.url}?q=metaMetadata_type:${type}${searchParam}&version=2.2&wt=json`;
    }

  }
}
module.exports = new Services.Records().exports();
