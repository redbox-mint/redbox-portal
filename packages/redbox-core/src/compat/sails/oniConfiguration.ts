import * as owned from '../../integrations/oni/config';
import type { OniRecordModel } from '../../services/oni-v2/types';
function input(): owned.OniConfigurationInput {
  return {
    configuration: name => {
      const service =
        typeof AppConfigService === 'undefined' ? undefined : AppConfigService.getAppConfigurationForBrand?.(name);
      return service ?? sails.config.brandingAware?.(name) ?? sails.config.brandingConfigurationDefaults;
    },
    brandById: value => (typeof BrandingService !== 'undefined' ? BrandingService.getBrandById?.(value) : undefined),
    brandByName: value => (typeof BrandingService !== 'undefined' ? BrandingService.getBrand?.(value) : undefined),
    warn: message => sails.log.warn(message),
  };
}
export const getBrandName = (record?: OniRecordModel) => owned.getBrandName(input(), record);
export const getBrand = (record?: OniRecordModel) => owned.getBrand(input(), record);
export const resolveOniPublishingConfig = (record?: OniRecordModel) =>
  owned.resolveOniPublishingConfig(input(), record);
