export { DoiConfigTag, DoiRunContextTag } from '../../integrations/doi/runtime';
import * as comparison from '../../compat/sails/doiRuntime';
export const makeRuntimeLayer: typeof comparison.makeRuntimeLayer = (...args) => comparison.makeRuntimeLayer(...args);
export const runCreateDoiProgram: typeof comparison.runCreateDoiProgram = (...args) =>
  comparison.runCreateDoiProgram(...args);
export const runUpdateDoiProgram: typeof comparison.runUpdateDoiProgram = (...args) =>
  comparison.runUpdateDoiProgram(...args);
export const runDeleteDoiProgram: typeof comparison.runDeleteDoiProgram = (...args) =>
  comparison.runDeleteDoiProgram(...args);
export const runChangeDoiStateProgram: typeof comparison.runChangeDoiStateProgram = (...args) =>
  comparison.runChangeDoiStateProgram(...args);
