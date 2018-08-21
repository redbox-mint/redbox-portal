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

  getRecords(recordType:string,state:string,pageNumber:number,packageType:string=undefined, sort:string=undefined): Promise<PlanTable> {
    var rows = 10;
    var start = (pageNumber-1) * rows;
    recordType = (!_.isEmpty(recordType) && !_.isUndefined(recordType)) ? `recordType=${recordType}` : '';
    packageType = (!_.isEmpty(packageType) && !_.isUndefined(packageType)) ? `packageType=${packageType}` : '';
    sort = (!_.isEmpty(sort) && !_.isUndefined(sort)) ? `&sort=${sort}` : '';
    state = (!_.isEmpty(state) && !_.isUndefined(state)) ? `&state=${state}` : '';
    return this.http.get(`${this.brandingAndPortalUrl}/listRecords?${recordType}${packageType}${state}${sort}&start=${start}&rows=${rows}&ts=${moment().unix()}`, this.options)
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
