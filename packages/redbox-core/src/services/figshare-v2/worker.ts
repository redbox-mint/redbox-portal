import { comparisonFigshareWorker } from '../../compat/sails/figshareWorkers';
export type { QueuedFigshareService } from '../../integrations/figshare/worker';
export const contentHash = (...args: Parameters<ReturnType<typeof comparisonFigshareWorker>['contentHash']>) =>
  comparisonFigshareWorker().contentHash(...args);
export const getSyncStore = (...args: Parameters<ReturnType<typeof comparisonFigshareWorker>['getSyncStore']>) =>
  comparisonFigshareWorker().getSyncStore(...args);
export const projectionPaths = (...args: Parameters<ReturnType<typeof comparisonFigshareWorker>['projectionPaths']>) =>
  comparisonFigshareWorker().projectionPaths(...args);
export const importRecordIntent = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareWorker>['importRecordIntent']>
) => comparisonFigshareWorker().importRecordIntent(...args);
export const dispatchFigshare = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareWorker>['dispatchFigshare']>
) => comparisonFigshareWorker().dispatchFigshare(...args);
export const runFigshareWorker = (
  ...args: Parameters<ReturnType<typeof comparisonFigshareWorker>['runFigshareWorker']>
) => comparisonFigshareWorker().runFigshareWorker(...args);
