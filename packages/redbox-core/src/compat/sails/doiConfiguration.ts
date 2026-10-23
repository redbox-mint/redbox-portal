import * as owned from '../../integrations/doi/config';
import type { DoiRecordModel } from '../../services/doi-v2/types';
import type { BrandingModel } from '../../model/storage/BrandingModel';

function input(): owned.DoiConfigurationInput {
  return {
    configuration: name => sails.config.brandingAware(name).doiPublishing,
    brandById: id => BrandingService.getBrandById(id),
    env: process.env,
  };
}
export const resolveDoiPublishingBrand = (record?: DoiRecordModel) => owned.resolveDoiPublishingBrand(input(), record);
export const resolveDoiPublishingConfig = (record?: DoiRecordModel) =>
  owned.resolveDoiPublishingConfig(input(), record);
export const resolveDoiPublishingConfigForBrand = (brand: BrandingModel | string) =>
  owned.resolveDoiPublishingConfigForBrand(input(), brand);
export const resolveDoiPublishingConfigAsync = (record?: DoiRecordModel) =>
  owned.resolveDoiPublishingConfigAsync(input(), record);
