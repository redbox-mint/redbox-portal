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
import * as _ from "lodash-es";
import { RecordsService } from './records.service';



/**
 * Contributor Model
 *
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
export class DataLocationField extends FieldBase<any> {

  showHeader: boolean;
  validators: any;
  enabledValidators: boolean;
  value: object[];
  accessDeniedObjects: object[];
  failedObjects: object[];
  hasInit: boolean;
  recordsService: RecordsService;
  columns: object[];
  newLocation:any = {type:"url", location:"",notes:""};
  dataTypes:object[] = [{
    'label': 'URL',
    'value': 'url',
  },
  {
    'label': 'Physical location',
    'value': 'physical',
  },
  {
    'label': 'File path',
    'value': 'file',
  },
  {
    'label': 'Attachment',
    'value': 'attachment'
  }
];

  dataTypeLookup:any = {
    'url':"URL",
    'physical':"Physical location",
    'attachment':"Attachment",
    'file':"File path"
  }

  constructor(options: any, injector: any) {
    super(options, injector);
    this.accessDeniedObjects = [];

    this.columns = options['columns'] || [];


    this.value = options['value'] || this.setEmptyValue();
    this.recordsService = this.getFromInjector(RecordsService);
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

  addLocation() {
    this.value.push(this.newLocation);
    this.setValue(this.value);
    this.newLocation = {type:"url", location:"",notes:""};
  }
}
/**
* Component to display information from related objects within ReDBox
*
*
*
*
*/
@Component({
  selector: 'data-location-selector',
  templateUrl: './field-data-location.html'
})
export class DataLocationComponent extends SimpleComponent {
  field: DataLocationField;

}
