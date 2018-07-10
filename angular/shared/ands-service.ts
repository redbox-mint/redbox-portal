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
export class ANDSService extends BaseService {

  constructor(
    @Inject(Http) http: Http,
    @Inject(ConfigService) protected configService: ConfigService,
    @Inject(TranslationService) protected translator:TranslationService) {
    super(http, configService);
  }

  getResourceDetails(uri:string, vocab:string): Promise<any> {
    return this.http.get(`${this.brandingAndPortalUrl}/ands/vocab/resourceDetails?uri=${uri}&vocab=${vocab}`, this.options)
      .toPromise()
      .then((res: any) => this.extractData(res));
  }

}
