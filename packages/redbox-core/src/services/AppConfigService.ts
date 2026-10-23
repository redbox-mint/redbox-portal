import { LegacyAppConfigs } from '../compat/sails/appConfigs';
export * from '../configuration/AppConfigs';
export namespace Services {
  export class AppConfigs extends LegacyAppConfigs {}
}
declare global {
  let AppConfigService: Services.AppConfigs;
}
