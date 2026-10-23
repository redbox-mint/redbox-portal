import { LegacyFormPayloadPrehydrate } from '../compat/sails/formPayloadPrehydrate';
export namespace Services {
  export class FormPayloadPrehydrateService extends LegacyFormPayloadPrehydrate {}
}
declare global {
  let FormPayloadPrehydrateService: Services.FormPayloadPrehydrateService;
}
