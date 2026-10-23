export * from '../forms/RecordValidation';
import { LegacyRecordValidation } from '../compat/sails/recordValidation';
export namespace Services {
  export class RecordValidation extends LegacyRecordValidation {}
}
declare global {
  let RecordValidationService: Services.RecordValidation;
}
