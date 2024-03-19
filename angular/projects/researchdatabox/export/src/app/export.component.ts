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

import { Component, Inject } from '@angular/core';
import { DOCUMENT } from "@angular/common"
import { ConfigService, LoggerService, TranslationService, RecordService, BaseComponent } from '@researchdatabox/portal-ng-common';
import { map as _map, get as _get } from 'lodash-es';
import { DateTime } from 'luxon';

@Component({
  selector: 'export',
  templateUrl: './export.component.html'
})
export class ExportComponent extends BaseComponent {
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
  window: any;
  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(RecordService) private recordService: RecordService,
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(DOCUMENT) private document: Document
  ) {
    super();
    this.loggerService.debug(`Export waiting for deps to init...`); 
    this.window = this.document.defaultView;
    this.initDependencies = [this.translationService, this.recordService];
  }

  protected override async initComponent():Promise<void> {
    const sysConfig = await this.configService.getConfig();
    const appName = 'export';
    const defaultDatePickerOpts = { dateInputFormat: 'DD/MM/YYYY', containerClass: 'theme-dark-blue' };
    const defaultDatePickerPlaceHolder = 'dd/mm/yyyy';
    const defaultExportFormatTypes = [{name: 'CSV', id: 'csv', checked: 'true'},{name: 'JSON', id: 'json', checked: null}];
    this.datePickerOpts = ConfigService._getAppConfigProperty(sysConfig, appName, 'datePickerOpts', defaultDatePickerOpts);  
    this.datePickerPlaceHolder = ConfigService._getAppConfigProperty(sysConfig, appName, 'datePickerPlaceHolder', defaultDatePickerPlaceHolder);
    this.exportFormatTypes = ConfigService._getAppConfigProperty(sysConfig, appName, 'exportFormatTypes', defaultExportFormatTypes);
    this.export_format = this.exportFormatTypes[0].id; //set default export format
    this.labelModAfter = `${this.translationService.t('export-modified-after')}`;
    const typeConfs = await this.recordService.getAllTypes();
    this.recTypeNames = _map(typeConfs, (typeConf:any) => { return typeConf.name });
    this.record_type = this.recTypeNames[0];
    this.loggerService.debug(`Export initialised`); 
  }

  download() {
    let before = '';
    let after = '';
    if(this.modBefore) {
      this.modBefore.setHours(23,59,59,999);
      before = this.modBefore.toISOString();
    }
    if(this.modAfter) {
      this.modAfter.setHours(0,0,0,0);
      after = this.modAfter.toISOString();
    }
    
    
    const url = `${this.recordService.brandingAndPortalUrl}/export/record/download/${this.export_format}?before=${before}&after=${after}&recType=${this.record_type}`;
    this.window.open(url, '_blank');
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
