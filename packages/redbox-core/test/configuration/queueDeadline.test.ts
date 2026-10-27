import assert from 'node:assert/strict';
import { deploymentDefaults, deploymentSchema } from '../../src/configuration/deployment';
import { resolveStartupConfiguration } from '../../src/configuration/resolution';

describe('queue connection deadline configuration', () => {
  it('retains a supported connection deadline through strict configuration resolution', () => {
    const config = resolveStartupConfiguration({
      schema: deploymentSchema,
      core: deploymentDefaults('test'),
      application: { source: 'queue deadline', values: { agendaQueue: { options: { connectionTimeoutMs: 45000 } } } },
    });
    assert.equal(config.agendaQueue.options.connectionTimeoutMs, 45000);
  });

  for (const value of [0, -1, 1.5, 2147483648]) {
    it(`rejects the invalid connection deadline ${value}`, () => {
      assert.throws(() =>
        resolveStartupConfiguration({
          schema: deploymentSchema,
          core: deploymentDefaults('test'),
          application: {
            source: 'queue deadline',
            values: { agendaQueue: { options: { connectionTimeoutMs: value } } },
          },
        })
      );
    });
  }
});
