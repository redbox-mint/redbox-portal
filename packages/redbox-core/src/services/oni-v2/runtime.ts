export { OniConfigTag, OniRunContextTag, OniRepositoryTag, makeOniLoggerLayer } from '../../integrations/oni/runtime';
import * as comparison from '../../compat/sails/oniRuntime';
export const makeRuntimeLayer: typeof comparison.makeRuntimeLayer = (...args) => comparison.makeRuntimeLayer(...args);
export const runPublishDatasetProgram: typeof comparison.runPublishDatasetProgram = (...args) =>
  comparison.runPublishDatasetProgram(...args);
