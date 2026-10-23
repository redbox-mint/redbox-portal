import { LegacyDomSanitizer } from '../compat/sails/domSanitizer';
export namespace Services {
  export class DomSanitizer extends LegacyDomSanitizer {}
}
export default Services;
declare global {
  let DomSanitizerService: Services.DomSanitizer;
}
