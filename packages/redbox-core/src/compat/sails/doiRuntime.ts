import * as owned from '../../integrations/doi/runtime';
import * as http from '../../services/doi-v2/http';
import * as audit from '../../services/doi-v2/audit';
import type { DoiPublishing, DoiRunContext } from '../../services/doi-v2/types';

function input(): owned.DoiRuntimeInput {
  return {
    get log() {
      return sails.log;
    },
    audit: {
      start: (...args) => audit.startDoiAudit(...args),
      complete: (...args) => audit.completeDoiAudit(...args),
      fail: (...args) => audit.failDoiAudit(...args),
    },
    clientLayer: (...args) => http.makeClientLayer(...args),
  };
}
export const makeRuntimeLayer = (config: DoiPublishing, context: DoiRunContext) =>
  owned.makeRuntimeLayer(input(), config, context);
export const runCreateDoiProgram = (...args: ParametersAfterInput<typeof owned.runCreateDoiProgram>) =>
  owned.runCreateDoiProgram(input(), ...args);
export const runUpdateDoiProgram = (...args: ParametersAfterInput<typeof owned.runUpdateDoiProgram>) =>
  owned.runUpdateDoiProgram(input(), ...args);
export const runDeleteDoiProgram = (...args: ParametersAfterInput<typeof owned.runDeleteDoiProgram>) =>
  owned.runDeleteDoiProgram(input(), ...args);
export const runChangeDoiStateProgram = (...args: ParametersAfterInput<typeof owned.runChangeDoiStateProgram>) =>
  owned.runChangeDoiStateProgram(input(), ...args);
type ParametersAfterInput<T> = T extends (input: owned.DoiRuntimeInput, ...args: infer Args) => unknown ? Args : never;
