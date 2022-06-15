// Copyright (c) 2019 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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

declare var jQuery: any;
/**
 * Published Data Refresher Component Model
 *
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
export class PublishDataLocationRefreshField extends FieldBase<any> {
  isGettingAttachments: boolean;
  origDisabledExpr: string;
  recordsService: RecordsService;

  constructor(options: any, injector: any) {
    super(options, injector);

    this.value = options['value'];
    this.recordsService = this.getFromInjector(RecordsService);
    this.origDisabledExpr = options['disabledExpression'];
  }

  public getAttachments(event: any, emitEvent: boolean = true ) {
    event.preventDefault();
    this.options['disabledExpression'] = "true";
    this.recordsService.getRecordMeta(this.value).then(data => {
      this.onValueUpdate.emit(data);
      this.formModel.patchValue(this.value, {emitEvent: true, emitModelToViewChange:true });
      this.options['disabledExpression'] = this.origDisabledExpr;
      this.formModel.markAsTouched();
      this.formModel.markAsDirty();
    });
  }

  getRelatedRecordId() {
    this.value = this.fieldMap._rootComp.relatedRecordId;
  }
}

/**
* Component to refresh data pub data locations from the related Data Record
*
*
*
* @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
*/
@Component({
  selector: 'publish-data-location-refresh',
  templateUrl: './field-publish-data-location-refresh.component.html'
})
export class PublishDataLocationRefreshComponent extends SimpleComponent {
  field: PublishDataLocationRefreshField;
}
