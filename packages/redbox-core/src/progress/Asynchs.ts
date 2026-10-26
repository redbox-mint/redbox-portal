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

import { Observable, defer } from 'rxjs';
import _ from 'lodash';
import type { ProgressRepositories } from '../persistence/progress/ProgressRepositories';

import { DateTime } from 'luxon';

export namespace Services {
  /**
   * Asynch related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  function once<T>(operation: () => Promise<T>): Observable<T> {
    let pending: Promise<T> | undefined;
    return defer(() => (pending ??= Promise.resolve().then(operation)));
  }
  export class Asynchs {
    constructor(protected readonly repository: ProgressRepositories['progress']) {}

    public start(progressObj: Record<string, unknown>): Observable<Record<string, unknown>> {
      if (_.isEmpty(progressObj.date_started) || _.isUndefined(progressObj.date_completed)) {
        // Using ISO-like local timestamp without timezone
        progressObj.date_started = DateTime.local().toFormat("yyyy-LL-dd'T'HH:mm:ss");
      }
      return once(() => this.repository.startProgress(progressObj));
    }

    public update(
      criteria: Record<string, unknown>,
      progressObj: Record<string, unknown>
    ): Observable<Record<string, unknown>[]> {
      return once(() => this.repository.reviseProgress(criteria, progressObj));
    }

    public finish(
      progressId: string,
      progressObj: Record<string, unknown> | null = null
    ): Observable<Record<string, unknown>[]> {
      if (progressObj) {
        progressObj.date_completed = DateTime.local().toFormat('yyyy-LL-dd HH:mm:ss');
      } else {
        progressObj = { date_completed: DateTime.local().toFormat('yyyy-LL-dd HH:mm:ss') };
      }
      progressObj.status = 'finished';
      return once(() => this.repository.reviseProgress({ id: progressId }, progressObj!));
    }

    public get(criteria: Record<string, unknown>): Observable<Record<string, unknown>[]> {
      return once(() => this.repository.listProgress(criteria));
    }
  }
}
