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

import { Injectable, Inject } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from './config.service';
import { UtilityService } from './utility.service';
import { LoggerService } from './logger.service';
import { HttpClientService } from './httpClient.service';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';
import * as _ from 'lodash';

/**
 * Record Service
 * 
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 */
@Injectable()
export class RecordService extends HttpClientService {

  constructor( 
    @Inject(HttpClient) protected override http: HttpClient, 
    @Inject(APP_BASE_HREF) public override rootContext: string,
    @Inject(UtilityService) protected override utilService: UtilityService,
    @Inject(ConfigService) protected override configService: ConfigService,
    @Inject(LoggerService) private loggerService: LoggerService
  ) {
    super(http, rootContext, utilService, configService);
  }

  public override async waitForInit(): Promise<any> {
    await super.waitForInit();
    this.enableCsrfHeader();
    this.loggerService.debug('waitForInit RecordService');
    return this;
  }
  
  // protected getOptions(headersObj: any) {
  //   let headers = new Headers(headersObj);
  //   return new RequestOptions({ headers: headers });
  // }

  // protected getOptionsClient(headersObj: any = {}) {
  //   headersObj['X-Source'] = 'jsclient';
  //   headersObj['Content-Type'] = 'application/json;charset=utf-8';
  //   headersObj['X-CSRF-Token'] = this.config.csrfToken;

  //   return this.getOptions(headersObj);
  // }

  // protected extractData(res: any, parentField: any = null) {
  //   let body = res;
  //   if (parentField) {
  //       console.log(body);
  //       return _.get(body, parentField) || {};
  //   } else {
  //       return body || {};
  //   }
  // }

  public async getWorkflowSteps(name: string) {
    let url = `${this.brandingAndPortalUrl}/record/wfSteps/${name}`;
    const result$ = this.http.get(url).pipe(map(res => res));
    let result = await firstValueFrom(result$);
    //console.log(result);
    //return this.extractData(result, '0');
    return result; 
    // return this.http.get(`${this.brandingAndPortalUrl}/record/wfSteps/${name}`, this.getOptionsClient())
    // .toPromise()
    // .then((res:any) => this.extractData(res));
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

  public async getRelatedRecords(oid: string, rawJson: boolean = false){
    let url = `${this.brandingAndPortalUrl}/record/${oid}/relatedRecords`;
    const result$ = this.http.get(url).pipe(map(res => res));
    let relatedRecords = await firstValueFrom(result$);
    if(rawJson) {
      return relatedRecords;
    } else {
      console.log(relatedRecords);
      // let totalItems = 1;
      // let startIndex = 0;
      // let noItems = 1;
      // let pageNumber = (startIndex / noItems) + 1;

      let response: any = {};
      // response["totalItems"] = totalItems;
      // response["currentPage"] = pageNumber;
      // response["noItems"] = noItems;

      let items = [];

      // let parentOrTreeLevel1: string = 'rdmp';
      let childOrTreeLevel2: any = _.get(relatedRecords, 'processedRelationships');

      console.log(childOrTreeLevel2);

      // let parentArr = _.get(relatedRecords, 'relatedObjects.'+parentOrTreeLevel1);
      // if(_.isArray(parentArr)) {
      //   let item: any = {};
      //   let parent = parentArr[0];
      //   item["oid"] = parent["redboxOid"];
      //   item["title"] = parent["metadata"]["title"];
      //   item["metadata"]= this.getDocMetadata(parent);
      //   item["dateCreated"] =  parent["dateCreated"];
      //   item["dateModified"] = parent["lastSaveDate"];
      //   items.push(item);
      // }
      for(let childNameStr of childOrTreeLevel2) {
        let childArr = _.get(relatedRecords,'relatedObjects.'+childNameStr);
        // console.log('------------------------------------------------- childNameStr '+childNameStr);
        // console.log(JSON.stringify(childArr));
        // console.log('-------------------------------------------------');
        if(!_.isUndefined(childArr) && _.isArray(childArr)) {
          for (let child of childArr) {
            let item: any = {};
            item["oid"] = child["redboxOid"];
            item["title"] = child["metadata"]["title"];
            item["metadata"]= this.getDocMetadata(child);
            item["dateCreated"] =  child["dateCreated"];
            item["dateModified"] = child["lastSaveDate"];
            // item["hasEditAccess"] = RecordsService.hasEditAccess(brand, user, roles, doc);
            items.push(item);
          }
        }
      }

      response["items"] = items;
      // console.log(response);
      return response;
    }
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
    let url = `${this.brandingAndPortalUrl}/listRecords?${recordType}${packageType}${state}${sort}${filterFields}${filterString}${filterMode}&start=${start}&rows=${rows}}`;
    const result$ = this.http.get(url).pipe(map(res => res));
    let result = await firstValueFrom(result$);
    return result;
  }

  //TODO needs to re-implement as fit for purpose ajax call
  public async getRecordTypes(packageType: string) {
    //old endpoint that will be deprecated
    //this.http.get(`${this.brandingAndPortalUrl}/record/type/`, this.getOptionsClient())
    let url = `${this.brandingAndPortalUrl}/record/type/`;
    const result$ = this.http.get(url).pipe(map(res => res));
    let result = await firstValueFrom(result$);
    console.log('-------------------------------------------------');
    console.log(result);
    console.log('-------------------------------------------------');
    return result;
  }

}
