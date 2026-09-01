// Copyright (c) 2020 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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

import { ActionResult, StorageMutationApplicationState } from '@researchdatabox/sails-ng-common';

/**
 * Response class for StorageService methods.
 *
 * This remains the generic response used by all storage operations.  Save
 * Save-specific fields live on RecordSaveResponse. Storage adapters may
 * additionally report whether a mutation was applied.
 */
export class StorageServiceResponse implements ActionResult {
  success: boolean = false;
  oid: string = '';
  message: string = '';
  data?: unknown;
  metadata: Record<string, unknown> | null = null;
  details?: Record<string, unknown> | string;
  totalItems: number = 0;
  items: Record<string, unknown>[] = [];
  applicationState?: StorageMutationApplicationState;
  constructor() {

  }

  public isSuccessful(): boolean {
    return this.success === true;
  }
}

export default StorageServiceResponse
