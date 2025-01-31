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


import { RecordPageDto } from "@researchdatabox/sails-ng-common";

/**
 * The data source, decouples the renderer.
 */
export interface RecordSource {
  getCurrentPage(): RecordPageDto;
  gotoPage(pageNum: number): Promise<RecordPageDto>;

  /**
   * The record table button action click event.
   * Used by RecordTableComponent.
   * @param event The click event data.
   * @param data The data for the current item.
   * @param actionName The name of the action.
   */
  recordTableAction(event: any, data: any, actionName: string): Promise<void>;

  /**
   * The header sort changed event.
   * Emitted by HeaderSortComponent.
   * @param event The sort changed data.
   * @param data The data for the current item.
   */
  headerSortChanged(event:any, data: any): Promise<void>;
}
