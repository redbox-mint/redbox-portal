import type { OniRecordModel, OniRunContext } from './types';
import { getBrandName } from './config';
import { createRunContext as ownedContext } from '../../integrations/oni/context';

export function createRunContext(
  record: OniRecordModel,
  oid: string,
  siteName: string,
  jobId?: string,
  triggerSource: string = 'exportDataset'
): OniRunContext {
  return ownedContext(getBrandName(record), record, oid, siteName, jobId, triggerSource);
}
