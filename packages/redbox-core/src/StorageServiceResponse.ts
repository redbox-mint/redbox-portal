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

import {
  ActionResult,
  StorageMutationApplicationState,
  type RecordConcurrencyResolution,
} from '@researchdatabox/sails-ng-common';
import type { RecordModel } from './model';
import type { StorageMutationNonApplicationReason } from './RecordStorageConcurrency';

/**
 * Response class for StorageService methods.
 *
 * This remains the generic response used by all storage operations.  Save
 * specific fields live on StorageMutationResponse/RecordSaveResponse so
 * existing storage services do not need to manufacture attachment state.
 */
export class StorageServiceResponse<TData = unknown> implements ActionResult {
  success: boolean = false;
  oid: string = '';
  message: string = '';
  data?: TData;
  metadata: Record<string, unknown> | null = null;
  details?: Record<string, unknown> | string;
  totalItems: number = 0;
  items: Record<string, unknown>[] = [];
  constructor() {}

  public isSuccessful(): boolean {
    return this.success === true;
  }
}

/**
 * Storage facts for a primary metadata mutation.  `unknown` is intentional:
 * a rejected or timed-out call is not proof that the provider did not write.
 */
export class StorageMutationResponse extends StorageServiceResponse {
  applicationState?: StorageMutationApplicationState;
  nonApplicationReason?: StorageMutationNonApplicationReason;
  committedRevision?: number;
  committedRecord?: RecordModel | Record<string, unknown>;
  removedRecord?: RecordModel | Record<string, unknown>;
  requestId?: string;
  resolution?: RecordConcurrencyResolution;
}

export default StorageServiceResponse;
