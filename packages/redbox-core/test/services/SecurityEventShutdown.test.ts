import assert from 'node:assert/strict';
import sinon from 'sinon';
import { Services } from '../../src/integrations/SecurityEvents';
import {
  initializePersistence,
  cleanupPersistence,
  runAcceptedPersistenceWork,
  hasActivePersistenceWork,
  drainAcceptedPersistenceWork,
} from '../../src/persistence/runtime';

describe('security event completion during shutdown', () => {
  for (const kind of ['record', 'attachment', 'integration', 'user']) {
    it(`retains an accepted ${kind} producer until its event is queued`, async () => {
      const owner = { config: {}, log: { warn() {} } };
      await initializePersistence(owner);
      const enqueue = sinon.stub().resolves();
      const capture = new Services.SecurityEventService({
        repository: {} as any,
        log: { error() {} },
        brand: () => ({ id: 'brand', name: 'default' }),
        configuration: () => ({ enabled: true }),
        enqueue,
        record: async () => undefined,
        hasAcceptedWork: () => hasActivePersistenceWork(owner),
        drainAcceptedWork: () => drainAcceptedPersistenceWork(owner),
      });
      const gate = Promise.withResolvers<void>();
      const producer = runAcceptedPersistenceWork(owner, async () => {
        await gate.promise;
        if (kind === 'record') await capture.emitFromRecordAudit({ brandId: 'brand', action: 'created' });
        if (kind === 'attachment') await capture.emitFromAttachmentAudit({ brandId: 'brand', action: 'download' });
        if (kind === 'integration') await capture.emitFromIntegrationAudit({ brandId: 'brand', status: 'completed' });
        if (kind === 'user') await capture.emitFromUserAudit({ id: 'user' }, 'login', { brandId: 'brand' });
      });
      capture.quiesce();
      let drained = false;
      const drain = capture.drain().then(() => {
        drained = true;
      });
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(drained, false);
      gate.resolve();
      await producer;
      await drain;
      assert.equal(enqueue.callCount, 1);
      await assert.rejects(
        capture.emitSecurityEvent({ brandId: 'brand', eventType: 'late', category: 'recordLifecycle', source: 'test' }),
        /draining/
      );
      await cleanupPersistence(owner);
    });
  }
});
