import { Injectable, Inject} from '@angular/core';
import { Http } from '@angular/http';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/toPromise';
import moment from 'moment-es6';
import { BaseService } from '../shared/base-service'
import { PlanTable } from './dashboard-models'
import { ConfigService } from './config-service';

@Injectable()
export class DashboardService extends BaseService {

  constructor( @Inject(Http) http: Http, @Inject(ConfigService) protected configService: ConfigService) {
    super(http, configService);
  }

  getActivePlans(pageNumber:number): Promise<PlanTable> {
    var rows = 10;
    var start = (pageNumber-1) * rows;
    return this.http.get(`${this.brandingAndPortallUrl}/listPlans?state=active&start=`+start+`&rows=`+rows, this.options)
      .toPromise()
      .then((res: any) => this.formatDates(this.extractData(res))as PlanTable);
  }

  getDraftPlans(pageNumber:number): Promise<PlanTable> {
    var rows = 10;
    var start = (pageNumber-1) * rows;
    return this.http.get(`${this.brandingAndPortallUrl}/listPlans?state=draft&start=`+start+`&rows=`+rows, this.options)
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

}
