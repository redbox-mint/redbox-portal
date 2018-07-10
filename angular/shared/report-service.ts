import { Injectable, Inject} from '@angular/core';
import { Http } from '@angular/http';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/toPromise';
import moment from 'moment-es6';
import { BaseService } from '../shared/base-service'
import { Report, ReportResults } from './report-models'
import { ConfigService } from './config-service';
import { TranslationService } from './translation-service';
import * as _ from "lodash";

@Injectable()
export class ReportService extends BaseService {

  constructor(
    @Inject(Http) http: Http,
    @Inject(ConfigService) protected configService: ConfigService,
    @Inject(TranslationService) protected translator:TranslationService) {
    super(http, configService);
  }

  getReport(name:string): Promise<Report> {
    return this.http.get(`${this.brandingAndPortalUrl}/admin/getReport?name=`+name, this.options)
      .toPromise()
      .then((res: any) => this.extractData(res) as Report);
  }

  getReportResults(name:string, pageNumber:number, params:object): Promise<ReportResults> {
    var rows = 10;
    var start = (pageNumber-1) * rows;
    var url = `${this.brandingAndPortalUrl}/admin/getReportResults?name=`+name+`&start=`+start+`&rows=`+rows;
    for(var key in params) {
      url=url+'&'+key+"="+params[key];
    }
    return this.http.get(url, this.options)
      .toPromise()
      .then((res: any) => this.extractData(res) as ReportResults);
  }

  formatDates(response:object){
    var items = response["items"];
    for (var i=0;i<items.length;i++){
      items[i]["dateCreated"] = moment(items[i]["dateCreated"]).local().format('LLL')
      items[i]["dateModified"] = moment(items[i]["dateModified"]).local().format('LLL')
    }
    return response;
  }


}
