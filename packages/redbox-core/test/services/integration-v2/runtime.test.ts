import { strict as assert } from 'node:assert';
import * as Effect from 'effect/Effect';
import { runEffectProgram } from '../../../src/services/integration-v2/runtime';

describe('integration Effect runtime', function () {
  it('returns successful values', async function () {
    const result = { identifier: 'minted' };
    assert.equal(await runEffectProgram(Effect.succeed(result)), result);
  });

  for (const failure of [new Error('publishing failed'), { statusCode: 503 }, undefined, null, false]) {
    it(`preserves the original typed failure: ${String(failure)}`, async function () {
      let rejected = false;
      try {
        await runEffectProgram(Effect.fail(failure));
      } catch (error) {
        rejected = true;
        assert.equal(error, failure);
      }
      assert.equal(rejected, true);
    });
  }

  it('preserves defects', async function () {
    const defect = new Error('unexpected publishing defect');
    await assert.rejects(runEffectProgram(Effect.die(defect)), error => error === defect);
  });
});
