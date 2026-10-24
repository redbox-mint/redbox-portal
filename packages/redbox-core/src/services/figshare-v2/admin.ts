import { comparisonFigshareAdmin } from '../../compat/sails/figshareWorkers';
export type { FigshareAdminOptions, FigshareAdminAction } from '../../integrations/figshare/admin';
export const figshareAdmin = (...args: Parameters<ReturnType<typeof comparisonFigshareAdmin>['figshareAdmin']>) =>
  comparisonFigshareAdmin().figshareAdmin(...args);
