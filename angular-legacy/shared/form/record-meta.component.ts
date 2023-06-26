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
import { Component } from '@angular/core';
import { FieldBase } from './field-base';
import { RecordsService } from './records.service';
import { SimpleComponent } from './field-simple.component';

export class RecordMetadataRetrieverField extends FieldBase<string> {
  parameterName: string;
  recordsService: RecordsService;
  constructor(options: any, injector: any) {
    super(options, injector);
    this.recordsService = this.getFromInjector(RecordsService);
    this.parameterName = options.parameterName || '';
  }

  public publishMetadata(oid: any, config: any) {
    this.recordsService.getRecordMeta(oid).then(data => {
      data.oid = oid;
      this.onValueUpdate.emit(data);
    });
  }

}

@Component({
  selector: 'record-metadata-retriever',
  template: `
  `,
})
export class RecordMetadataRetrieverComponent extends SimpleComponent {
  field: RecordMetadataRetrieverField;

}
