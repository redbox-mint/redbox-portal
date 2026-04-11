import { WorkflowTransitionJobConfig } from './types';

export function shouldRunWorkflowTransitionJob(jobConfig: WorkflowTransitionJobConfig): boolean {
  return jobConfig.enabled?.toString() === 'true';
}
