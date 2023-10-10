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

import { Injectable } from '@angular/core';

/**
 *
 * LoggerService
 * 
 * Note: The implementation is bare-boned and serves as a sort of placeholder. This will likely require a refactor as more use-cases and candidate remote backend solutions are identified.
 * 
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 * 
 */
@Injectable()
export class LoggerService {

  constructor() {

  }

  log(text: string, data: any = undefined) {
    console.log(text, data);
  }

  debug(text: string, data: any = undefined) {
    console.debug(text, data);
  }

  info(text: string, data: any = undefined) {
    console.info(text, data);
  }

  error(text: string, data: any = undefined) {
    console.error(text, data);
  }

}