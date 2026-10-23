import { LegacyTrigger } from '../compat/sails/workflowTriggers';
export namespace Services {
  export class Trigger extends LegacyTrigger {}
}
declare global {
  let TriggerService: Services.Trigger;
}
