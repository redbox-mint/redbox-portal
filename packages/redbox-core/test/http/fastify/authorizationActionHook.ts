import assert from 'node:assert/strict';
import type { HttpHookContribution } from '../../../src/http/contracts';
import { clearRequestActor, requestContext } from '../../../src/http/context';

export const actorClearsAfterAdmission = { count: 0 };
export const replacementHooks: readonly HttpHookContribution[] = [
  {
    name: 'fm043-clear-actor-after-admission',
    stage: 'beforeAction',
    scope: { kind: 'application' },
    async run(request) {
      if (request.headers['x-fm043-action-actor'] !== 'clear') return;
      assert.equal(requestContext(request).actor?.username, 'pilot-admin');
      clearRequestActor(request);
      actorClearsAfterAdmission.count++;
    },
  },
];
