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
import { Injectable, Inject, ApplicationRef, Output, EventEmitter }   from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import * as _ from "lodash";
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/of';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/last';
import 'rxjs/add/observable/from';
import { CompleterService } from 'ng2-completer';
import { ConfigService } from '../config-service';
import { TranslationService } from '../translation-service';
import { UtilityService } from '../util-service';
import { FieldControlMetaService } from './field-control-meta.service';
import { FieldBase } from './field-base';
import  { fieldClasses } from '../fieldClasses';
/**
 * Field / Model Factory Service...
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Injectable()
export class FieldControlService {
  protected classes =  fieldClasses;
  constructor(
  @Inject(CompleterService) private completerService: CompleterService,
  @Inject(ConfigService) protected configService: ConfigService,
  @Inject(TranslationService) protected translationService: TranslationService,
  @Inject(UtilityService) protected utilityService: UtilityService,
  @Inject(FieldControlMetaService) protected fcmetaService: FieldControlMetaService,
  protected app: ApplicationRef
  ) {

  }

  addComponentClasses(componentClasses: object) {
    this.classes = _.merge(this.classes,componentClasses);
  }

  getEmptyFormGroup() {
    return new FormGroup({});
  }

  toFormGroup(fields: FieldBase<any>[], fieldMap: any = null ) {
    let group: any = {};
    this.populateFormGroup(fields, group, fieldMap);
    this.setupEventHandlers(fieldMap);
    return new FormGroup(group);
  }

  setupEventHandlers(fieldMap: any) {
    _.forOwn(fieldMap, (fMap:any) => {
      if (fMap.field) {
        fMap.field.setupEventHandlers();
      }
    });
  }

  populateFormGroup(fields: any[], group: any, fieldMap: any) {
    fields.forEach((field:any) => {
      if (field.fields && !field.hasGroup) {
        this.populateFormGroup(field.fields, group, fieldMap);
      } else {
        field.getGroup(group, fieldMap);
      }
    });
    return group;
  }

  getFieldsMeta(fieldsArr: any) {
    const fields = this.fcmetaService.getFieldsMeta(fieldsArr);
    return fields;
  }

  getLookupData(fields: any[]) {
    return this.fcmetaService.getLookupData(fields);
  }


}
