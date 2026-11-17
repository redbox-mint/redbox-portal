import { cloneDeep } from 'lodash';

/** Detached persistence view. Only the record envelope is runtime-owned;
 * identically named user metadata and integration properties remain intact.
 */
export function withoutRuntimeRecordProperties<T extends object>(record: T): T {
  const detached = cloneDeep(record);
  return stripRuntimeRecordProperties(detached);
}

/** Strip only the envelope in place when the caller already owns the record.
 * This deliberately preserves every nested object reference.
 */
export function stripRuntimeRecordProperties<T extends object>(record: T): T {
  delete (record as T & { relatedMetadata?: unknown }).relatedMetadata;
  return record;
}
