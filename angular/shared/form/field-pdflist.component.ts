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
import moment from 'moment-es6';



/**
 * Contributor Model
 *
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
export class PDFListField extends FieldBase<any> {

  showHeader: boolean;
  validators: any;
  enabledValidators: boolean;
  relatedObjects: object[];
  accessDeniedObjects: object[];
  failedObjects: object[];
  hasInit: boolean;
  recordsService: RecordsService;
  columns: object[];
  pdfAttachments: object[];
  latestPdf: object;
  startsWith:string;
  showHistoryTable:boolean = false;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.relatedObjects = [];
    this.accessDeniedObjects = [];
    this.failedObjects = [];
    this.columns = options['columns'] || [];
    this.startsWith = options['startsWith'] || 'rdmp-pdf';
    var relatedObjects = this.relatedObjects;
    this.recordsService = this.getFromInjector(RecordsService);
    this.pdfAttachments = [];
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

/**
* Component to display PDFs related to this record
*
*/
@Component({
  selector: 'rb-pdf-list',
  templateUrl: './field-pdflist.html'
})
export class PDFListComponent extends SimpleComponent implements OnInit {
  field: PDFListField;

  public ngOnInit() {
    const oid = this.fieldMap._rootComp.oid;
    if(oid) {
      let allAttachmentsPromise = this.field.recordsService.getAttachments(oid);
      let matchingExpression = new RegExp(`${this.field.startsWith}-[0-9a-fA-F]{32}-[0-9]+\.pdf`);
      var that = this;
      allAttachmentsPromise.then(allAttachments => {
        this.field.latestPdf = null;
        _.forEach(allAttachments, (attachment:any) => {
          if(matchingExpression.test(attachment.label)) {

            attachment.dateUpdated = moment(attachment.dateUpdated).format('LLL');
            this.field.pdfAttachments.push(attachment);
            if(this.field.latestPdf == null || moment(this.field.latestPdf['dateUpdated']).isBefore(moment(attachment.dateUpdated))) {
              this.field.latestPdf = attachment;
            }
          }
        });

        this.field.pdfAttachments.sort(function compare(a, b) {
          let before = moment(a['dateUpdated']).isBefore(moment(b['dateUpdated']));
          //We want descending order so let's reverse it
          return before ? -1 : 1;
        });

      });

    }
  }

  public getDownloadUrl(attachment) {
    const oid = this.fieldMap._rootComp.oid;
    return  `${this.field.recordsService.getBrandingAndPortalUrl}/record/${oid}/datastream?datastreamId=${attachment.label}`
  }
}
