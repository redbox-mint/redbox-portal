import { LegacyOni } from '../compat/sails/oni';
export namespace Services {
  export class OniService extends LegacyOni {}
}
declare global {
  let OniService: Services.OniService;
}
