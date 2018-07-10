import { Injectable, Inject, ApplicationRef }   from '@angular/core';
import { Observable } from 'rxjs/Observable';
import * as _ from "lodash";
import  { fieldClasses }from '../fieldClasses';

import { ConfigService } from '../config-service';
import { VocabFieldLookupService } from './field-vocab.component';
import { CompleterService } from 'ng2-completer';
import { TranslationService } from '../translation-service';
import { UtilityService } from '../util-service';
import { BaseService } from '../base-service';
import { Http } from '@angular/http';

@Injectable()
export class FieldControlMetaService extends BaseService {
  protected classes =  fieldClasses;

  constructor(
    @Inject(Http) http: Http,
    @Inject(VocabFieldLookupService) private vocabFieldLookupService: VocabFieldLookupService,
    @Inject(CompleterService) private completerService: CompleterService,
    @Inject(ConfigService) protected configService: ConfigService,
    @Inject(TranslationService) protected translationService: TranslationService,
    @Inject(UtilityService) protected utilityService: UtilityService,
    protected app: ApplicationRef
  ) {
      super(http, configService);
  }

  getFieldsMeta(fieldsArr: any) {
    const fields = _.map(fieldsArr, (f:any) => {
        // console.log(f.class);
        // if(typeof this.classes[f.class] != 'undefined'){
        //   console.log(f.class + ' is null');
        // }
      const inst = new this.classes[f.class].meta(f.definition, this.app['_injector']);
      inst.utilityService = this.getInjectedService('utilityService');
      inst.appConfig = this.getInjectedService('configService').config;
      // set the component class
      if (_.isArray(this.classes[f.class].comp)) {
        inst.compClass = _.find(this.classes[f.class].comp, (c:any)=> {
          // console.log(`Checking if ${c.clName} == ${f.compClass}`);
          return c.clName == f.compClass
        });
        // defaults to the first entry when compClass is undefined
        if (_.isUndefined(inst.compClass)) {
          inst.compClass = this.classes[f.class].comp[0];
        }
      } else {
        inst.compClass = this.classes[f.class].comp;
      }
      if (f.definition && f.definition.fields) {
        inst.fields = this.getFieldsMeta(f.definition.fields);
      }
      return inst;
    });
    return fields;
  }

  flattenFields(fields: any[], fieldArr: any[]) {
    _.map(fields, (f:any)=> {
      fieldArr.push(f);
      if (f.fields) {
        this.flattenFields(f.fields, fieldArr);
      }
    });
  }

  getLookupData(fields: any[]) {
    let fieldArray: any[] = [];
    this.flattenFields(fields, fieldArray);
    return Observable.from(fieldArray).flatMap((f:any) => {
      if (f.hasLookup) {
        const lookupServiceName = this.classes[f.clName].lookupService;
        const serviceInst = this.getInjectedService(lookupServiceName);
        f.setLookupServices(this.getInjectedService('completerService'), serviceInst);
        // f.completerService = this.completerService;
        // f.lookupService = this[lookupServiceName];
        return serviceInst.getLookupData(f);
      } else {
        return Observable.of(null);
      }
    })
    .flatMap((field:any) => {
      return Observable.of(field);
    })
    .last()
    .flatMap((whatever:any) => {
      return Observable.of(fields);
    });
  }

  getInjectedService(serviceName: string) {
    let serviceInst = null;
    switch (serviceName) {
      case 'vocabFieldLookupService':
        serviceInst = this.vocabFieldLookupService;
        break;
      case 'completerService':
        serviceInst = this.completerService;
        break;
      case 'configService':
        serviceInst = this.configService;
        break;
      case 'translationService':
        serviceInst = this.translationService;
        break;
      case 'utilityService':
        serviceInst = this.utilityService;
        break;
    }
    return serviceInst;
  }
}
