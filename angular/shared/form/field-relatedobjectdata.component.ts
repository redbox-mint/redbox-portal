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
import { Input, Component, OnInit, Inject, Injector} from '@angular/core';
import { SimpleComponent } from './field-simple.component';
import { FieldBase } from './field-base';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import * as _ from "lodash";
import { RecordsService } from './records.service';



/**
 * Contributor Model
 *
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
export class RelatedObjectDataField extends FieldBase<any> {

  showHeader: boolean;
  validators: any;
  enabledValidators: boolean;
  relatedObjects: object[];
  accessDeniedObjects: object[];
  failedObjects: object[];
  hasInit: boolean;
  recordsService: RecordsService;
  columns: object[];

  constructor(options: any, injector: any) {
    super(options, injector);
    this.relatedObjects = [];
    this.accessDeniedObjects = [];
    this.failedObjects = [];
    this.columns = options['columns'] || [];

    var relatedObjects = this.relatedObjects;
    this.value = options['value'] || this.setEmptyValue();
    this.recordsService = this.getFromInjector(RecordsService);
    var that = this;
    _.forEach(this.value, (item:any) => {
       this.recordsService.getRecordMeta(item.id).then(function (meta) {
         if(!meta) {
           that.failedObjects.push(meta);
         } else if(meta.status =="Access Denied") {
          that.accessDeniedObjects.push(meta);
        } else if(meta.title) {
          that.relatedObjects.push(meta);
        } else {
          that.failedObjects.push(meta);
        }
      });
    });
  }



  createFormModel(valueElem: any = undefined): any {
    if (valueElem) {
      this.value = valueElem;
    }

      this.formModel = new FormControl(this.value || []);

      if (this.value) {
        this.setValue(this.value);
      }

    return this.formModel;
  }

  setValue(value:any) {
    this.formModel.patchValue(value, {emitEvent: false });
    this.formModel.markAsTouched();
  }

  setEmptyValue() {
    this.value = [];
    return this.value;
  }
}

declare var aotMode
// Setting the template url to a constant rather than directly in the component as the latter breaks document generation
let rbRelatedObjectDataTemplate = './field-relatedobjectdata.html';
if(typeof aotMode == 'undefined') {
  rbRelatedObjectDataTemplate = '../angular/shared/form/field-relatedobjectdata.html';
}

/**
* Component to display information from related objects within ReDBox
*
*
*
*
*/
@Component({
  selector: 'rb-relatedobjectdata',
  templateUrl: './field-relatedobjectdata.html'
})
export class RelatedObjectDataComponent extends SimpleComponent {
  field: RelatedObjectDataField;

}
