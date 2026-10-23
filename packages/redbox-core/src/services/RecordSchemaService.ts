export * from '../recordSchema/RecordSchema';
import { LegacyRecordSchema } from '../compat/sails/recordSchema';
export namespace Services {
  export class RecordSchema extends LegacyRecordSchema {}
}
declare global {
  let RecordSchemaService: Services.RecordSchema;
}
