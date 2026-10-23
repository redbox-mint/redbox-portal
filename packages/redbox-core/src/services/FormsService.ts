export * from '../forms/Forms';
import { LegacyForms } from '../compat/sails/forms';
export namespace Services {
  export class Forms extends LegacyForms {}
}
declare global {
  let FormsService: Services.Forms;
}
