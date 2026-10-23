export * from '../records/Records';
import { Services as Comparison } from '../compat/sails/records';
export namespace Services {
  export class Records extends Comparison.Records {}
}
declare global {
  let RecordsService: Services.Records;
}
