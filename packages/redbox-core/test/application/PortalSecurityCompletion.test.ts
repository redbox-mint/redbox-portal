import assert from 'node:assert/strict';
import sinon from 'sinon';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { portalProviderPlan } from '../../src/application/portal/providers';
import { initializePersistence, cleanupPersistence, runAcceptedPersistenceWork } from '../../src/persistence/runtime';
import * as siem from '../../src/persistence/siem/runtime';

describe('production security completion ownership', () => {
  afterEach(() => sinon.restore());
  it('keeps accepted producer completion admitted while the composed capture module drains', async () => {
    const owner = { config: {}, log: nothingLogger };
    await initializePersistence(owner);
    sinon.stub(siem, 'getSiemRepository').returns({} as any);
    const now = sinon.stub().resolves();
    const plan = portalProviderPlan(
      owner,
      {} as any,
      nothingLogger,
      {
        reference: {
          branding: { get: () => ({ getBrandById: () => ({ id: 'brand', name: 'default' }) }) },
          appConfigs: { get: () => ({ getAppConfigurationForBrand: () => ({ siem: { enabled: true } }) }) },
        },
        queue: { get: () => ({ now }) },
      } as any,
      { env: {}, resolveEmailHook: () => undefined, retainFollowup: work => work }
    );
    const module = plan.security.bind({ provider: 'core', declaration: plan.security.declaration })();
    await module.initialize();
    const gate = Promise.withResolvers<void>();
    const producer = runAcceptedPersistenceWork(owner, async () => {
      await gate.promise;
      await plan.security.get().emitFromRecordAudit({ brandId: 'brand', action: 'created' });
    });
    module.quiesce?.();
    let drained = false;
    const draining = module.drain!().then(() => {
      drained = true;
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(drained, false);
    gate.resolve();
    await producer;
    await draining;
    assert.equal(now.callCount, 1);
    await module.close();
    await cleanupPersistence(owner);
  });
});
