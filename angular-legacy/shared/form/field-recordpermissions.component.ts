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
import { Input, Component, OnInit, Inject, Injector } from '@angular/core';
import { SimpleComponent } from './field-simple.component';
import { FieldBase } from './field-base';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import * as _ from "lodash";
import { RecordsService } from './records.service';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/zip';
import { fromPromise } from 'rxjs/observable/fromPromise';
import {DomSanitizer} from '@angular/platform-browser';



/**
 * Record Permissions Model
 *
 *
 * @author <a target='_' href='https://github.com/andrewbrazzati'>Andrew Brazzatti</a>
 *
 */
export class RecordPermissionsField extends FieldBase<any> {

  showHeader: boolean;
  validators: any;
  enabledValidators: boolean;
  hasInit: boolean;
  recordsService: RecordsService;

  permissions: any = {edit:[],view:[],editRoles:[],viewRoles:[],editPending:[],viewPending:[]}

  constructor(options: any, injector: any) {
    super(options, injector);

    this.value = options['value'] || this.setEmptyValue();
    this.recordsService = this.getFromInjector(RecordsService);

  }

/**
* Loading the metadata for each related object in the array
*/
  asyncLoadData() {
    let oid = this.fieldMap._rootComp.oid;
    let getRecordMetaObs = [];
    var that = this;

    if(oid == null || oid == "") {
      return Observable.of(null);
     } else {
      return fromPromise(this.recordsService.getPermissions(oid)).flatMap(permissions => {
        that.permissions = permissions;
       return Observable.of(permissions);
      });
      
    }
    
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

  setValue(value: any) {
    this.formModel.patchValue(value, { emitEvent: false });
    this.formModel.markAsTouched();
  }

  setEmptyValue() {
    this.value = [];
    return this.value;
  }
}

declare var aotMode
// Setting the template url to a constant rather than directly in the component as the latter breaks document generation
let rbRelatedObjectDataTemplate = './field-recordpermissions.html';
if (typeof aotMode == 'undefined') {
  rbRelatedObjectDataTemplate = '../angular/shared/form/field-recordpermissions.html';
}

/**
* Component to display information from related objects within ReDBox
*
*
*
*
*/
@Component({
  selector: 'rb-recordpermissions',
  templateUrl: './field-recordpermissions.html'
})
export class RecordPermissionsComponent extends SimpleComponent {
  field: RecordPermissionsField;

  constructor(private sanitizer: DomSanitizer) {
    super();
  }

  sanitizeUrl(url:string){
    return this.sanitizer.bypassSecurityTrustUrl(url);
  }
}
