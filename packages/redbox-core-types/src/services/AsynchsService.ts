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

import { Observable } from 'rxjs';
import { Services as services } from '../CoreService';

import { DateTime } from 'luxon';

export namespace Services {
  /**
   * Asynch related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Asynchs extends services.Core.Service {

    protected override _exportedMethods: string[] = [
      'start',
      'update',
      'finish',
      'get'
    ];

    public start(progressObj: Record<string, unknown>): Observable<Record<string, unknown>> {
      if (_.isEmpty(progressObj.date_started) || _.isUndefined(progressObj.date_completed)) {
  // Using ISO-like local timestamp without timezone
  progressObj.date_started = DateTime.local().toFormat("yyyy-LL-dd'T'HH:mm:ss");
      }
      return super.getObservable<Record<string, unknown>>(AsynchProgress.create(progressObj));
    }

    public update(criteria: Record<string, unknown>, progressObj: Record<string, unknown>): Observable<Record<string, unknown>[]> {
      return super.getObservable<Record<string, unknown>[]>(AsynchProgress.update(criteria, progressObj));
    }

    public finish(progressId: string, progressObj: Record<string, unknown> | null = null): Observable<Record<string, unknown>[]> {
      if (progressObj) {
          progressObj.date_completed = DateTime.local().toFormat('yyyy-LL-dd HH:mm:ss');
      } else {
          progressObj = {date_completed: DateTime.local().toFormat('yyyy-LL-dd HH:mm:ss')};
      }
      progressObj.status = 'finished';
      return super.getObservable<Record<string, unknown>[]>(AsynchProgress.update({id:progressId}, progressObj));
    }

    public get(criteria: Record<string, unknown>): Observable<Record<string, unknown>[]> {
      return super.getObservable<Record<string, unknown>[]>(AsynchProgress.find(criteria));
    }

  }

}

declare global {
  let AsynchsService: Services.Asynchs;
}
