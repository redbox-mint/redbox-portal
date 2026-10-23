import { comparisonFigshareContext } from '../../compat/sails/figshareHelpers';
export type { BindingContext } from '../../integrations/figshare/context';
export const resolveBrandId = (...args: Parameters<ReturnType<typeof comparisonFigshareContext>['resolveBrandId']>) =>
  comparisonFigshareContext().resolveBrandId(...args);
export const createBindingContext = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareContext>['createBindingContext']>
) => comparisonFigshareContext().createBindingContext(...args);
export const createRunContext = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareContext>['createRunContext']>
) => comparisonFigshareContext().createRunContext(...args);
