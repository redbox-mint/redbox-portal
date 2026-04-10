import _ from 'lodash';
import { AnyRecord } from './types';

export function shouldRunWorkflowTransitionJob(jobConfig: AnyRecord): boolean {
  return _.get(jobConfig, 'enabled', '')?.toString() === 'true';
}
