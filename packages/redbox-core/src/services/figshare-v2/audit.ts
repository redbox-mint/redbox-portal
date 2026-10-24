import { comparisonFigshareAudit } from '../../compat/sails/figshareWorkers';
export const startFigshareAudit = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareAudit>['startFigshareAudit']>
) => comparisonFigshareAudit().startFigshareAudit(...args);
export const completeFigshareAudit = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareAudit>['completeFigshareAudit']>
) => comparisonFigshareAudit().completeFigshareAudit(...args);
export const failFigshareAudit = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareAudit>['failFigshareAudit']>
) => comparisonFigshareAudit().failFigshareAudit(...args);
