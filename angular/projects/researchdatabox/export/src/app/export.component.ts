// Copyright (c) 2023 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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

import { Component, Inject, OnInit } from '@angular/core';
import { UtilityService, LoggerService, TranslationService, RecordService } from '@researchdatabox/redbox-portal-core';
import { map as _map } from 'lodash-es';
import { DateTime } from 'luxon';

@Component({
  selector: 'export',
  templateUrl: './export.component.html'
})
export class ExportComponent implements OnInit {
  datePickerPlaceHolder: string = '';
  criticalError: any;
  modBefore: any;
  modAfter: any;
  datePickerOpts: any;
  timePickerOpts: any;
  hasClearButton: boolean = false;
  recTypeNames: string[] = null as any;
  record_type: string = null as any;
  exportFormatTypes: any[] = null as any;
  export_format: { name: string, id: string, checked: string } = null as any;
  labelModAfter: string = '';
  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(RecordService) private recordService: RecordService,
    @Inject(UtilityService) private utilService: UtilityService,
    @Inject(TranslationService) private translationService: TranslationService
  ) {

  }

  async ngOnInit() {
    this.loggerService.debug(`Export waiting for deps to init...`); 
    await this.utilService.waitForDependencies([this.translationService, this.recordService]);
    this.datePickerOpts = { dateInputFormat: 'DD/MM/YYYY' };
    this.datePickerPlaceHolder = 'dd/mm/yyyy';
    this.exportFormatTypes = [{name: 'CSV', id: 'csv', checked: 'true'},{name: 'JSON', id: 'json', checked: null}];
    this.export_format = this.exportFormatTypes[0].id; //set default export format
    this.labelModAfter = `${this.translationService.t('export-modified-after')}`;
    const typeConfs = await this.recordService.getAllTypes();
    this.recTypeNames = _map(typeConfs, (typeConf:any) => { return typeConf.name });
    this.record_type = this.recTypeNames[0];
    this.loggerService.debug(`Export initialised.`); 
  }

  download() {
    const formatStr = 'yyyy-mm-dd'
    const before = this.modBefore ? DateTime.fromObject(this.modBefore).toFormat(formatStr) : '';
    const after = this.modAfter ? DateTime.fromObject(this.modAfter).toFormat(formatStr) : '';
    const url = `${this.recordService.brandingAndPortalUrl}/export/record/download/${this.export_format}?before=${before}&after=${after}&recType=${this.record_type}`;
    window.open(url, '_blank');
  }

  getRecordTypeNames() {
    return this.recTypeNames;
  }

  getExportFormatNames() {
    return this.exportFormatTypes;
  }

  setRecordType(recType:any, e: any) {
    if (e) {
      e.preventDefault();
    }
    this.record_type = recType;
  }

  setExportFormat(exportFormat:any, e:any) {
    if (e) {
      e.preventDefault();
    }
    this.export_format = exportFormat;
  }
}