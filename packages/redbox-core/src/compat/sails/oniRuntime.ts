import * as owned from '../../integrations/oni/runtime';
type AfterLog<T> = T extends (log: owned.OniLoggerSink, ...args: infer Args) => unknown ? Args : never;
export const makeRuntimeLayer = (...args: AfterLog<typeof owned.makeRuntimeLayer>) =>
  owned.makeRuntimeLayer(sails.log, ...args);
export const runPublishDatasetProgram = (...args: AfterLog<typeof owned.runPublishDatasetProgram>) =>
  owned.runPublishDatasetProgram(sails.log, ...args);
