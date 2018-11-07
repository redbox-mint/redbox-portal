import { Injectable, Inject} from '@angular/core';
import { Http } from '@angular/http';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/toPromise';
import moment from 'moment-es6';
import { BaseService } from '../shared/base-service'
import { PlanTable, Plan } from './dashboard-models'
import { ConfigService } from './config-service';
import { TranslationService } from './translation-service';
import * as _ from "lodash";

@Injectable()
export class DashboardService extends BaseService {

  constructor(
    @Inject(Http) http: Http,
    @Inject(ConfigService) protected configService: ConfigService,
    @Inject(TranslationService) protected translator:TranslationService) {
    super(http, configService);
  }

  getAllDraftPlansCanEdit(): Promise<PlanTable> {
    const rows = this.config.maxTransferRowsPerPage;
    const start = 0;
    return this.http.get(`${this.brandingAndPortalUrl}/listRecords?recordType=rdmp&state=draft&editOnly=true&start=${start}&rows=${rows}&ts=${moment().unix()}`, this.options)
      .toPromise()
      .then((res: any) => this.formatDates(this.extractData(res))as PlanTable);
  }

  getAllRecordsCanEdit(recordType:string, state:string): Promise<PlanTable> {
    const rows = this.config.maxTransferRowsPerPage;
    const start = 0;

    let url = `${this.brandingAndPortalUrl}/listRecords?recordType=${recordType}&editOnly=true&start=${start}&rows=${rows}&ts=${moment().unix()}`;
    if(state != '') {
      url += `&state=${state}`;
    }
    return this.http.get(url, this.options)
      .toPromise()
      .then((res: any) => this.formatDates(this.extractData(res))as PlanTable);
  }

  getActivePlans(pageNumber:number): Promise<PlanTable> {
    var rows = 10;
    var start = (pageNumber-1) * rows;
    return this.http.get(`${this.brandingAndPortalUrl}/listRecords?state=active&start=${start}&rows=${rows}&ts=${moment().unix()}`, this.options)
      .toPromise()
      .then((res: any) => this.formatDates(this.extractData(res))as PlanTable);
  }

  getDraftPlans(pageNumber:number): Promise<PlanTable> {
    var rows = 10;
    var start = (pageNumber-1) * rows;
    return this.http.get(`${this.brandingAndPortalUrl}/listRecords?recordType=rdmp&state=draft&start=${start}&rows=${rows}&ts=${moment().unix()}`, this.options)
      .toPromise()
      .then((res: any) => this.formatDates(this.extractData(res)) as PlanTable);
  }

  getRecords(recordType:string,state:string,pageNumber:number,packageType:string=undefined, sort:string=undefined, rows:number=undefined, filter:string=undefined): Promise<PlanTable> {
    // normalise parameters
    recordType = (!_.isEmpty(recordType) && !_.isUndefined(recordType)) ? recordType : '';
    state = (!_.isEmpty(state) && !_.isUndefined(state)) ? state : '';
    pageNumber  = (!_.isEmpty(pageNumber) && !_.isUndefined(pageNumber)) ? pageNumber : 1;
    packageType  = (!_.isEmpty(packageType) && !_.isUndefined(packageType)) ? packageType : '';
    sort  = (!_.isEmpty(sort) && !_.isUndefined(sort)) ? sort : '';
    rows = (!_.isEmpty(rows) && !_.isUndefined(rows)) ? rows : 20;
    filter = (!_.isEmpty(filter) && !_.isUndefined(filter)) ? JSON.stringify(filter) : '';
    let start = (pageNumber - 1) * rows;
    let ts = moment().unix();

    let data = {
      'recordType': recordType,
      'packageType': packageType,
      'state': state,
      'sort': sort,
      'start': start,
      'rows': rows,
      'filter': filter,
      'ts': ts
    };

    // build get and post data
    // state can be set to '' to get all states
    let get_data = Object
      .keys(data)
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(data[k])}`)
      .join('&');

    let post_data = {};
    for (const prop in data) {
      if (data.hasOwnProperty(prop)) {
        post_data[prop] = data[prop]
      }
    }

    // decide type of request to send
    let post_url = `${this.brandingAndPortalUrl}/listRecords`;
    let get_url = `${this.brandingAndPortalUrl}/listRecords?${get_data}`;
    let request;
    if (get_url.length < 1000){
      request = this.http.get(get_url, this.options);
      console.log('get records', get_url);
    } else {
      // using post if the get url is too long
      request = this.http.post(post_url, data, this.options);
      console.log('post records', post_url, data);
    }

    return request
      .toPromise()
      .then((res: any) => this.formatDates(this.extractData(res)) as PlanTable);
  }



  formatDates(response:object){
    var items = response["items"];
    for (var i=0;i<items.length;i++){
      items[i]["dateCreated"] = moment(items[i]["dateCreated"]).local().format('LLL')
      items[i]["dateModified"] = moment(items[i]["dateModified"]).local().format('LLL')
    }
    return response;
  }

  public setDashboardTitle(planTable: PlanTable, plans: any[]=null) {
    _.forEach(planTable ? planTable.items : plans, (plan: Plan) => {
      plan.dashboardTitle = (_.isUndefined(plan.title) || _.isEmpty(plan.title) || _.isEmpty(plan.title[0])) ? this.translator.t('plan-with-no-title'): plan.title;
    });
  }

  public searchRecords(pageNumber:number, basicSearch: string, facets: any = null) {
    const rows = this.config.maxSearchRowsPerPage;
    const start = (pageNumber-1) * rows;
    return this.http.get(`${this.brandingAndPortalUrl}/searchPlans?start=${start}&rows=${rows}&query=${basicSearch}&facets=${facets}&ts=${moment().unix()}`, this.options)
      .toPromise()
      .then((res:any) => this.formatDates(this.extractData(res))as PlanTable);
  }

}
