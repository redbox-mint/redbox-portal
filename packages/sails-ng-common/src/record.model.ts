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

/**
 * Defines the property/column rendering configuration
 */
export interface RecordPropViewMetaDto {
  /**
   * control visibility
   *
   * warning breaking change, used to be called 'show'
   */
  hide: boolean;
  /**
   * if set, will run this against _.template
   */
  template: string;
  /**
   * the property/variable name
   */
  property: string;
  /**
   * the column header
   */
  label: string;
  /**
   * whether to expect the property to be multi-valued
   */
  multivalue: boolean;
}

/**
 * Model for each page of records
 */
export interface RecordPageDto {
  records: unknown[];
  total: number;
  pageNum: number;
}
