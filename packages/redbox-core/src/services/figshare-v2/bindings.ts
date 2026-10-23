import { comparisonFigshareBindings } from '../../compat/sails/figshareHelpers';
export type { CrosswalkBindingResult } from '../../integrations/figshare/bindings';
export const validateHandlebarsTemplate = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareBindings>['validateHandlebarsTemplate']>
) => comparisonFigshareBindings().validateHandlebarsTemplate(...args);
export const resolveCrosswalkBinding = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareBindings>['resolveCrosswalkBinding']>
) => comparisonFigshareBindings().resolveCrosswalkBinding(...args);
export const evaluateBinding = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareBindings>['evaluateBinding']>
) => comparisonFigshareBindings().evaluateBinding(...args);
