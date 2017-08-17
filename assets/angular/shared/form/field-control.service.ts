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

import { Injectable, Inject }   from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { FieldBase } from './field-base';
import { TextField, DropdownField, Container, TextArea, DateTime, AnchorOrButton, HiddenValue, LinkValue, TabOrAccordionContainer } from './field-simple';
import {
  TextFieldComponent,
  DropdownFieldComponent,
  TabOrAccordionContainerComponent,
  TextBlockComponent,
  TextAreaComponent,
  DateTimeComponent,
  AnchorOrButtonComponent,
  HiddenValueComponent,
  LinkValueComponent} from './field-simple.component';
import { VocabField, VocabFieldComponent, VocabFieldLookupService } from './field-vocab.component';
import { RepeatableContainer, RepeatableVocabComponent, RepeatableContributorComponent } from './field-repeatable.component';
import { ContributorField, ContributorComponent } from './field-contributor.component';
import { WorkflowStepButton, WorkflowStepButtonComponent } from './workflow-button.component';
import * as _ from "lodash-lib";
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/of';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/last';
import 'rxjs/add/observable/from';
import { CompleterService } from 'ng2-completer';
import { ConfigService } from '../config-service';

/**
 * Field / Model Factory Service...
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
@Injectable()
export class FieldControlService {

  protected classes = {
    'TextField': { 'meta': TextField, 'comp': TextFieldComponent },
    'TextArea': { 'meta': TextArea, 'comp': TextAreaComponent },
    'DateTime': { 'meta': DateTime, 'comp': DateTimeComponent },
    'DropdownField': { 'meta': DropdownField, 'comp': DropdownFieldComponent },
    'Container': {'meta': Container, 'comp': [ TextBlockComponent ] },
    'TabOrAccordionContainer': {'meta': TabOrAccordionContainer, 'comp': TabOrAccordionContainerComponent },
    'AnchorOrButton': { 'meta': AnchorOrButton, 'comp': AnchorOrButtonComponent },
    'VocabField': {'meta': VocabField, 'comp': VocabFieldComponent, 'lookupService': 'vocabFieldLookupService'},
    'RepeatableContainer': {'meta': RepeatableContainer, 'comp': [RepeatableVocabComponent, RepeatableContributorComponent]},
    'ContributorField': {'meta': ContributorField, 'comp': ContributorComponent},
    'HiddenValue': {'meta': HiddenValue, 'comp': HiddenValueComponent},
    'WorkflowStepButton': {'meta': WorkflowStepButton, 'comp': WorkflowStepButtonComponent},
    'LinkValueComponent': {'meta': LinkValue, 'comp': LinkValueComponent }
  };
  constructor(@Inject(VocabFieldLookupService) private vocabFieldLookupService: VocabFieldLookupService, @Inject(CompleterService) private completerService: CompleterService,  @Inject(ConfigService) protected configService: ConfigService) {

  }

  getEmptyFormGroup() {
    return new FormGroup({});
  }

  toFormGroup(fields: FieldBase<any>[], fieldMap: any = null ) {
    let group: any = {};
    this.populateFormGroup(fields, group, fieldMap);
    return new FormGroup(group);
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
    const fields = _.map(fieldsArr, (f:any) => {
      const inst = new this.classes[f.class].meta(f.definition);
      // set the component class
      if (_.isArray(this.classes[f.class].comp)) {
        inst.compClass = _.find(this.classes[f.class].comp, (c:any)=> { return c.name == f.compClass });
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
        const lookupServiceName = this.classes[f.constructor.name].lookupService;
        f.completerService = this.completerService;
        f.lookupService = this[lookupServiceName];
        return this[lookupServiceName].getLookupData(f);
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

}
