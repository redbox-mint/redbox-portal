import { LegacySecurityEventService } from '../compat/sails/securityEvents';
export namespace Services {
  export class SecurityEventService extends LegacySecurityEventService {}
}
declare global {
  let SecurityEventService: Services.SecurityEventService;
}
