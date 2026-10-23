import { comparisonFigshareEmbargo } from '../../compat/sails/figshareHelpers';
export const syncEmbargoPhase = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareEmbargo>['syncEmbargoPhase']>
) => comparisonFigshareEmbargo().syncEmbargoPhase(...args);
