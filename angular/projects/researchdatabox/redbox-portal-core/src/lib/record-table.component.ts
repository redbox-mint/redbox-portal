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

import { Component, Input, Inject } from '@angular/core';
import { BaseComponent } from './base.component';
import { LoggerService } from './logger.service';
import { isEmpty as _isEmpty, get as _get, merge as _merge, template as _template } from 'lodash-es';

// TODO: Move the following interfaces to the record.service?
/**
 * Defines the property/column rendering configuration
 */
export interface RecordPropMeta {
  // control visibility
  show: boolean; 
  // if set, will run this against _.template
  template: string;
  // the property/variable name
  variable: string;
  // the column header
  label: string;
  // whether to expect the property to be multi-valued
  multivalue: boolean;
}

/**
 * Model for each page of records
 */
export interface RecordPage {
  items: any[];
  totalItems: number;
  pageNum: number;
}

/**
 * The data source, decouples the renderer.
 */
export interface RecordSource {
  getPage(pageNum: number, params: any): Promise<RecordPage>;
}
// END TODO

/**
 * This component displays records in a table. 
 * 
 * Features:
 * - Pagination
 * - Sortable column headers (pending)
 * - Group by workflow stages (pending)
 * 
 * Requires:
 * - Data source, with async support
 * - Config block used to render the table
 * 
 * * Author: <a href='https://github.com/shilob' target='_blank'>Shilo B</a>
 */
@Component({
  selector: 'record-table',
  templateUrl: './record-table.component.html'
})
export class RecordTableComponent extends BaseComponent {
  // row/column config
  @Input() columnConfig: RecordPropMeta[] = null as any;
  // the data source
  @Input() dataSource: RecordSource = null as any;
  // additional binding data for templates
  @Input() optTemplateData: any = {};
  // the data 
  currentPage: RecordPage = null as any;
  // pagination 
  @Input() paginationDirectionLinks:boolean = false;
  @Input() paginationBoundaryLinks: boolean = true;
  @Input() paginationClass: string = 'pagination-sm';
  @Input() paginationMaxSize:number = 10;
  @Input() paginationRotate: boolean = true;
  
  constructor(@Inject(LoggerService) private loggerService: LoggerService) {
    super();
    // no deps
    this.initDependencies = [];
  }

  protected override async initComponent():Promise<void> {
    // get the first page
    if (!_isEmpty(this.dataSource)) {
      this.loggerService.debug(JSON.stringify(this.columnConfig));
      this.loggerService.debug(`RecordTableComponent getting the first page...`);
      this.currentPage = await this.dataSource.getPage(1, {});
      this.loggerService.debug(JSON.stringify(this.currentPage));
      this.loggerService.debug(`RecordTableComponent got first page.`);
    }
  }

  getColValue(row: any, col: RecordPropMeta) {
    if (col.multivalue) {
      let retVal = [];
      for (let val of _get(row, col.variable)) {
        retVal.push(this.getEntryValue(row, col, val));
      }
      return retVal.join('');
    } else {
      return this.getEntryValue(row, col);
    }
  }

  getEntryValue(row: any, col: RecordPropMeta, val: any = undefined) {
    let retVal = '';
    if (!_isEmpty(col.template)) {
      const imports = _merge({}, row, {
        recordTableMeta: { 
          col: col, 
          val: val
        },
        optTemplateData: this.optTemplateData
      });
      const templateData = {imports: imports};
      retVal = _template(col.template, templateData)();
    } else {
      retVal = _get(row, col.variable, val);
    }
    return retVal;
  }

  async gotoPage(event: any) {
    this.currentPage = await this.dataSource.getPage(event.page, {});
  } 
}