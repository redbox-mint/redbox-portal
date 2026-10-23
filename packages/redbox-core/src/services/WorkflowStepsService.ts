import { LegacyWorkflowSteps } from '../compat/sails/workflowSteps';
export namespace Services {
  export class WorkflowSteps extends LegacyWorkflowSteps {}
}
declare global {
  let WorkflowStepsService: Services.WorkflowSteps;
}
