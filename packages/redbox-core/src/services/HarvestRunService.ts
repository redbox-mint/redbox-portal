import { Services as Comparison } from '../compat/sails/harvestRuns';
export namespace Services {
  export class HarvestRunService extends Comparison.HarvestRunService {}
}
declare global {
  let HarvestRunService: Services.HarvestRunService;
}
