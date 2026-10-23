// Temporary legacy entrypoint. The domain implementation has no Sails dependencies.
import { LegacyRecordTypes } from '../compat/sails/recordTypes';
export { RecordTypeRecordSchemaConfigurationError } from '../recordTypes';

export namespace Services {
  export class RecordTypes extends LegacyRecordTypes {}
}

declare global {
  let RecordTypesService: Services.RecordTypes;
}
