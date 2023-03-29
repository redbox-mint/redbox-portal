// Copyright (c) 2022 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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
import { Subject } from 'rxjs';

/**
 * Basic methods for an object that needs to initialise.
 */
export interface Initable {
  /**
   * Used if consumers are interested in the low-level Subject broadcasting the init.
   */
  getInitSubject(): Subject<any>;

  /**
   * Convenience promised-based method for waiting on service initialisation. Implementations can optionally return data.
   * 
   */
  
  waitForInit(): Promise<any>;

  /**
   * Use to check the init status
   */

  isInitializing(): boolean;
}