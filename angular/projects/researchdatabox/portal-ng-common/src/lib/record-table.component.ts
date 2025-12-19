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

import {Component, Input, Inject, ViewChildren, QueryList} from '@angular/core';
import { BaseComponent } from './base.component';
import { LoggerService } from './logger.service';
import { UtilityService } from './utility.service';
import { isEmpty as _isEmpty, get as _get, merge as _merge } from 'lodash-es';
import { RecordSource } from './record.model';
import { RecordPropViewMetaDto } from '@researchdatabox/sails-ng-common';
import { HandlebarsTemplateService } from './handlebars-template.service';
import {HeaderSortComponent} from "./header-sort.component";

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
    templateUrl: './record-table.component.html',
    standalone: false
})
export class RecordTableComponent extends BaseComponent {
  // row/column config
  @Input() columnConfig: RecordPropViewMetaDto[] = null as any;
  // the data source
  @Input() dataSource: RecordSource = null as any;
  // additional binding data for templates
  @Input() optTemplateData: any = {};
  // report name for template key construction (required for Handlebars templates)
  @Input() reportName: string = '';
  // pagination
  @Input() paginationItemsPerPage: number = 10;
  @Input() paginationDirectionLinks:boolean = false;
  @Input() paginationBoundaryLinks: boolean = true;
  @Input() paginationClass: string = 'pagination-sm';
  @Input() paginationMaxSize:number = 10;
  @Input() paginationRotate: boolean = true;
  // which actions to show in the table
  @Input() showActions: {name:string, classes: string, label:string}[] = [];
  // whether to enable table sorting
  @Input() enableSort: boolean = false;
  // whether to enable actions column
  @Input() enableActions: boolean = false;
  // find the header sort elements and provide references to them
  @ViewChildren(HeaderSortComponent) headerSortItems: QueryList<HeaderSortComponent> | undefined;

  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(UtilityService) private utilService: UtilityService,
    @Inject(HandlebarsTemplateService) private handlebarsTemplateService: HandlebarsTemplateService,
    ) {
    super();
    // no deps
    this.initDependencies = [];
  }

  protected override async initComponent():Promise<void> {
    if (_isEmpty(this.dataSource)) {
      this.loggerService.error(`RecordTableComponent is missing a datasource parameter!`);
      throw new Error(`RecordTableComponent is missing a datasource parameter!`);
    }

    // Validate reportName if any columns use templates
    const hasTemplates = this.columnConfig?.some(col => !_isEmpty(col.template));
    if (hasTemplates && !this.reportName) {
      this.loggerService.error(`RecordTableComponent requires reportName when using Handlebars templates!`);
      throw new Error(`RecordTableComponent requires reportName when using Handlebars templates!`);
    }
  }

  getColValue(row: any, col: RecordPropViewMetaDto) {
    if (col.multivalue) {
      let retVal = [];
      for (let val of _get(row, col.property)) {
        retVal.push(this.getEntryValue(row, col, val));
      }
      return retVal.join('');
    } else {
      return this.getEntryValue(row, col);
    }
  }

  /**
   * Get the column index from columnConfig for template key construction.
   */
  private getColumnIndex(col: RecordPropViewMetaDto): number {
    if (!this.columnConfig) return -1;
    return this.columnConfig.findIndex(c => c.property === col.property && c.label === col.label);
  }

  /**
   * Build template key parts for HandlebarsTemplateService.
   * Key structure: [reportName, 'columns', columnIndex, 'render']
   */
  private buildTemplateKeyParts(col: RecordPropViewMetaDto): string[] {
    if (!this.reportName) {
      return [];
    }
    const colIndex = this.getColumnIndex(col);
    if (colIndex < 0) {
      return [];
    }
    return [this.reportName, 'columns', colIndex.toString(), 'render'];
  }

  getEntryValue(row: any, col: RecordPropViewMetaDto, val: any = undefined) {
    let retVal = '';
    if (!_isEmpty(col.template)) {
      const data = _merge({}, row, {
        recordTableMeta: {
          col: col,
          val: val
        },
        optTemplateData: this.optTemplateData
      });
      
      // Build template key parts for pre-compiled template lookup
      const keyParts = this.buildTemplateKeyParts(col);
      retVal = this.handlebarsTemplateService.compileAndRunTemplate(col.template, data, keyParts);
    } else {
      retVal = _get(row, col.property, val);
    }
    return retVal;
  }

  async gotoPage(event: any) {
    await this.dataSource.gotoPage(event.page);
  }

  async headerSortChanged(event: any, data: any) {
    // Reset the sort order for all headers, except the header that was clicked.
    this.headerSortItems?.forEach(item => {
      if (item.step == event.step && item.variable == event.variable) {
        return;
      }
      item.sort = '';
    })
  }
}
