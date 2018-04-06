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
import { FieldBase } from './field-base';
import { TextField, Container, TextArea, DateTime, AnchorOrButton, SaveButton, CancelButton, HiddenValue, LinkValue, TabOrAccordionContainer, ButtonBarContainer, SelectionField, ParameterRetrieverField, RecordMetadataRetrieverField } from './field-simple';
import { TextFieldComponent, RepeatableTextfieldComponent} from './field-textfield.component';
import {
  DropdownFieldComponent,
  TabOrAccordionContainerComponent,
  ButtonBarContainerComponent,
  TextBlockComponent,
  TextAreaComponent,
  DateTimeComponent,
  AnchorOrButtonComponent,
  SaveButtonComponent,
  CancelButtonComponent,
  HiddenValueComponent,
  LinkValueComponent,
  SelectionFieldComponent,
  ParameterRetrieverComponent,
  RecordMetadataRetrieverComponent
} from './field-simple.component';
import { VocabField, VocabFieldComponent, VocabFieldLookupService } from './field-vocab.component';
import { RepeatableContainer, RepeatableVocabComponent, RepeatableContributorComponent } from './field-repeatable.component';
import { ContributorField, ContributorComponent } from './field-contributor.component';
import { WorkflowStepButton, WorkflowStepButtonComponent } from './workflow-button.component';
import { RelatedObjectDataField, RelatedObjectDataComponent } from './field-relatedobjectdata.component';
import { RelatedObjectSelectorComponent, RelatedObjectSelectorField } from './field-relatedobjectselector.component';
import { MapField, MapComponent } from './field-map.component';
import * as _ from "lodash-es";
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/of';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/last';
import 'rxjs/add/observable/from';
import { CompleterService } from 'ng2-completer';
import { ConfigService } from '../config-service';
import { TranslationService } from '../translation-service';
import { UtilityService } from '../util-service';
import { GenericGroupComponent, RepeatableGroupComponent } from './field-group.component';
/**
 * Field / Model Factory Service...
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Injectable()
export class FieldControlService {
  protected classes = {
    'TextField': { 'meta': TextField, 'comp': TextFieldComponent },
    'TextArea': { 'meta': TextArea, 'comp': TextAreaComponent },
    'DateTime': { 'meta': DateTime, 'comp': DateTimeComponent },
    'Container': {'meta': Container, 'comp': [ TextBlockComponent, GenericGroupComponent ] },
    'TabOrAccordionContainer': {'meta': TabOrAccordionContainer, 'comp': TabOrAccordionContainerComponent },
    'ButtonBarContainer': {'meta': ButtonBarContainer, 'comp': ButtonBarContainerComponent },
    'AnchorOrButton': { 'meta': AnchorOrButton, 'comp': AnchorOrButtonComponent },
    'SaveButton': { 'meta': SaveButton, 'comp': SaveButtonComponent },
    'CancelButton': { 'meta': CancelButton, 'comp': CancelButtonComponent },
    'VocabField': {'meta': VocabField, 'comp': VocabFieldComponent, 'lookupService': 'vocabFieldLookupService'},
    'RepeatableContainer': {'meta': RepeatableContainer, 'comp': [RepeatableVocabComponent, RepeatableContributorComponent, RepeatableTextfieldComponent, RepeatableGroupComponent]},
    'ContributorField': {'meta': ContributorField, 'comp': ContributorComponent, 'lookupService': 'vocabFieldLookupService'},
    'HiddenValue': {'meta': HiddenValue, 'comp': HiddenValueComponent},
    'WorkflowStepButton': {'meta': WorkflowStepButton, 'comp': WorkflowStepButtonComponent},
    'LinkValueComponent': {'meta': LinkValue, 'comp': LinkValueComponent },
    'SelectionField': {'meta': SelectionField, 'comp': [ SelectionFieldComponent, DropdownFieldComponent ]},
    'RelatedObjectDataField': {'meta': RelatedObjectDataField, 'comp': RelatedObjectDataComponent, 'lookupService': 'vocabFieldLookupService'},
    'MapField': {'meta': MapField, 'comp': MapComponent, 'lookupService': 'vocabFieldLookupService'},
    'ParameterRetriever':{ 'meta': ParameterRetrieverField, 'comp': ParameterRetrieverComponent},
    'RecordMetadataRetriever':{ 'meta': RecordMetadataRetrieverField, 'comp': RecordMetadataRetrieverComponent},
    'RelatedObjectSelector':{ 'meta': RelatedObjectSelectorField, 'comp': RelatedObjectSelectorComponent},
  };
  constructor(@Inject(VocabFieldLookupService) private vocabFieldLookupService: VocabFieldLookupService, @Inject(CompleterService) private completerService: CompleterService,
  @Inject(ConfigService) protected configService: ConfigService,
  @Inject(TranslationService) protected translationService: TranslationService,
  @Inject(UtilityService) protected utilityService: UtilityService,
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
    const fields = _.map(fieldsArr, (f:any) => {
        console.log(f.class);
        if(typeof this.classes[f.class] != 'undefined'){
          console.log(f.class + ' is null');
        }
      const inst = new this.classes[f.class].meta(f.definition, this.app['_injector']);
      inst.utilityService = this.utilityService;
      // set the component class
      if (_.isArray(this.classes[f.class].comp)) {
        inst.compClass = _.find(this.classes[f.class].comp, (c:any)=> { return c.name == f.compClass });
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
        const lookupServiceName = this.classes[f.constructor.name].lookupService;
        f.setLookupServices(this.completerService, this[lookupServiceName]);
        // f.completerService = this.completerService;
        // f.lookupService = this[lookupServiceName];
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
