import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { FigshareSourceIntents } from '../../records/FigshareSourceIntents';
import { resolveFigsharePublishingConfig } from './config';
const instanceKey = Symbol.for('@researchdatabox/redbox-core/comparison/figshare-source-intents');
function current(): FigshareSourceIntents {
  if (typeof sails === 'undefined') return new FigshareSourceIntents({ config: () => null, log: nothingLogger });
  let instance = Reflect.get(sails, instanceKey) as FigshareSourceIntents | undefined;
  if (!instance) {
    instance = new FigshareSourceIntents({
      config: record => resolveFigsharePublishingConfig(record, { requireToken: false }),
      get log() {
        return sails.log;
      },
    });
    Object.defineProperty(sails, instanceKey, { value: instance });
  }
  return instance;
}
export { evaluateSourceCondition } from '../../records/FigshareSourceIntents';
export function prepareSourceIntent(...args: Parameters<FigshareSourceIntents['prepareSourceIntent']>) {
  return current().prepareSourceIntent(...args);
}
export function currentExecutionEligible(...args: Parameters<FigshareSourceIntents['currentExecutionEligible']>) {
  return current().currentExecutionEligible(...args);
}
