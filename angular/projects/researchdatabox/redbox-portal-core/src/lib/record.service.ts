// Copyright (c) 2023 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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

import { map, firstValueFrom } from 'rxjs';
import { Injectable, Inject } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from './config.service';
import { UtilityService } from './utility.service';
import { LoggerService } from './logger.service';
import { HttpClientService } from './httpClient.service';
import * as _ from 'lodash';
import { merge as _merge } from 'lodash-es';

export interface RecordTypeConf {
  name: string;
}
/**
 * Record Service
 * 
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 */
@Injectable()
export class RecordService extends HttpClientService {
  private requestOptions:any = null as any;

  constructor( 
    @Inject(HttpClient) protected override http: HttpClient, 
    @Inject(APP_BASE_HREF) public override rootContext: string,
    @Inject(UtilityService) protected override utilService: UtilityService,
    @Inject(ConfigService) protected override configService: ConfigService,
    @Inject(LoggerService) private loggerService: LoggerService
  ) {
    super(http, rootContext, utilService, configService);
    this.requestOptions = {responseType: 'json', observe: 'body'};
  }

  public override async waitForInit(): Promise<any> {
    await super.waitForInit();
    this.enableCsrfHeader();
    this.loggerService.debug('waitForInit RecordService');
    _merge(this.requestOptions, {context: this.httpContext})
    return this;
  }

  public async getWorkflowSteps(name: string) {
    let url = `${this.brandingAndPortalUrl}/record/wfSteps/${name}`;
    const result$ = this.http.get(url).pipe(map(res => res));
    let result = await firstValueFrom(result$);
    return result; 
  }

  private getDocMetadata(doc: any) {
    let metadata: any = {};
    for(var key in doc){
      if(key.indexOf('authorization_') != 0 && key.indexOf('metaMetadata_') != 0) {
        metadata[key] = doc[key];
      }
      if(key == 'authorization_editRoles') {
        metadata[key] = doc[key];
      }
    }
    return metadata;
  }

  public async getRelatedRecords(oid: string) {
    
    let url = `${this.brandingAndPortalUrl}/record/${oid}/relatedRecords`;
    const result$ = this.http.get(url).pipe(map(res => res));
    let relatedRecords = await firstValueFrom(result$);
    
    let response: any = {};
    let items = [];
    let childOrTreeLevel2: any = _.get(relatedRecords, 'processedRelationships');

    for(let childNameStr of childOrTreeLevel2) {
      let childArr = _.get(relatedRecords,'relatedObjects.'+childNameStr);
      
      if(!_.isUndefined(childArr) && _.isArray(childArr)) {
        for (let child of childArr) {
          let item: any = {};
          item["oid"] = child["redboxOid"];
          item["title"] = child["metadata"]["title"];
          item["metadata"]= this.getDocMetadata(child);
          item["dateCreated"] =  child["dateCreated"];
          item["dateModified"] = child["lastSaveDate"];
          //TODO double check that this is needed or not
          // item["hasEditAccess"] = RecordsService.hasEditAccess(brand, user, roles, doc);
          items.push(item);
        }
      }
    }

    response["items"] = items;
    return response;
  }

  public async getRecords(recordType:string,state:string,pageNumber:number,packageType:string='', sort:string='', filterFields:string='', filterString:string='', filterMode:string='') {
    let rows = 10;
    let start = (pageNumber-1) * rows;
    recordType = (!_.isEmpty(recordType) && !_.isUndefined(recordType)) ? `recordType=${recordType}` : '';
    packageType = (!_.isEmpty(packageType) && !_.isUndefined(packageType)) ? `packageType=${packageType}` : '';
    sort = (!_.isEmpty(sort) && !_.isUndefined(sort)) ? `&sort=${sort}` : '';
    state = (!_.isEmpty(state) && !_.isUndefined(state)) ? `&state=${state}` : '';
    filterFields = (!_.isEmpty(filterFields) && !_.isUndefined(filterFields)) ? `&filterFields=${filterFields}` : '';
    filterString = (!_.isEmpty(filterString) && !_.isUndefined(filterString)) ? `&filter=${filterString}` : '';
    filterMode = (!_.isEmpty(filterMode) && !_.isUndefined(filterMode)) ? `&filterMode=${filterMode}` : '';
    let url = `${this.brandingAndPortalUrl}/listRecords?${recordType}${packageType}${state}${sort}${filterFields}${filterString}${filterMode}&start=${start}&rows=${rows}`;
    const result$ = this.http.get(url).pipe(map(res => res));
    let result = await firstValueFrom(result$);
    return result;
  }

  //TODO not used anymore by new dashboard dicuss if still needs implementation here?
  public async getAllTypes() {
    let url = `${this.brandingAndPortalUrl}/record/type`;
    const result$ = this.http.get(url).pipe(map(res => res));
    let result = await firstValueFrom(result$);
    return result;
  }

  public async getDashboardType(dashboardType:string) {
    let url = `${this.brandingAndPortalUrl}/dashboard/type/${dashboardType}`;
    const result$ = this.http.get(url).pipe(map(res => res));
    let result = await firstValueFrom(result$);
    return result;
  }

  public async getAllDashboardTypes() {
    let url = `${this.brandingAndPortalUrl}/dashboard/type`;
    const result$ = this.http.get(url).pipe(map(res => res));
    let result = await firstValueFrom(result$);
    return result;
  }

}
