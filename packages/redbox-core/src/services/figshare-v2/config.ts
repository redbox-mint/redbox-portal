export type { ResolvedFigsharePublishingConfigData } from '../../integrations/figshare/config';
export { getSyncState, setSyncState } from '../../integrations/figshare/config';
import * as comparison from '../../compat/sails/figshareConfiguration';
export { legacyDelayMs } from '../../queries/FigshareStatus';
export const getBrandName = (...args: Parameters<typeof comparison.getBrandName>) => comparison.getBrandName(...args);
export const resolveFigsharePublishingConfig = (
  ...args: Parameters<typeof comparison.resolveFigsharePublishingConfig>
) => comparison.resolveFigsharePublishingConfig(...args);
export const resolveFigshareVocabularyConfig = (
  ...args: Parameters<typeof comparison.resolveFigshareVocabularyConfig>
) => comparison.resolveFigshareVocabularyConfig(...args);
