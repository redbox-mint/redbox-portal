import { Services as Comparison } from '../compat/sails/standardDatastream';
export namespace Services {
  export class StandardDatastream extends Comparison.StandardDatastream {}
}
declare global {
  let StandardDatastreamService: Services.StandardDatastream;
}
