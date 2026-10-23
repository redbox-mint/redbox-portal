import { ServiceExports } from '../../services/index';
import { createFigshareConfiguration } from '../../integrations/figshare/config';
import type { FigshareDevConfig } from '../../config/figshareDev.config';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
type AppConfigResolver = { getAppConfigurationForBrand?: (name: string) => unknown };
function current() {
  return createFigshareConfiguration({
    configuration: name => {
      const lifted = typeof AppConfigService === 'undefined' ? undefined : AppConfigService;
      const resolver: AppConfigResolver =
        typeof lifted?.getAppConfigurationForBrand === 'function' ? lifted : ServiceExports.AppConfigService;
      return resolver?.getAppConfigurationForBrand?.(name);
    },
    brandById: id => (typeof BrandingService === 'undefined' ? undefined : BrandingService.getBrandById?.(id)),
    brandByName: name => (typeof BrandingService === 'undefined' ? undefined : BrandingService.getBrand?.(name)),
    get development(): FigshareDevConfig {
      const value = sails.config?.figshareDev;
      return value != null && typeof value === 'object'
        ? (value as FigshareDevConfig)
        : { enabled: false, mode: 'live' };
    },
    get environment() {
      return String(sails.config.environment ?? process.env.NODE_ENV ?? '');
    },
    get log() {
      return typeof sails === 'undefined' ? nothingLogger : sails.log;
    },
  });
}
export const getBrandName = (...args: Parameters<ReturnType<typeof current>['getBrandName']>) =>
  current().getBrandName(...args);
export const resolveFigsharePublishingConfig = (
  ...args: Parameters<ReturnType<typeof current>['resolveFigsharePublishingConfig']>
) => current().resolveFigsharePublishingConfig(...args);
export const resolveFigshareVocabularyConfig = (
  ...args: Parameters<ReturnType<typeof current>['resolveFigshareVocabularyConfig']>
) => current().resolveFigshareVocabularyConfig(...args);
