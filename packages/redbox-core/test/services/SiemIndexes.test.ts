import { expect } from 'chai';
import * as sinon from 'sinon';
import { Services } from '../../src/services/SecurityEventService';
import * as persistence from '../../src/persistence/runtime';

describe('SIEM capture replay', () => {
  const original = Reflect.get(globalThis, 'AgendaQueueService');
  afterEach(() => { sinon.restore(); Reflect.set(globalThis, 'AgendaQueueService', original); });
  it('retries enqueue after a committed capture without changing delivered state', async () => {
    let saved: Record<string, unknown> | undefined;
    const repository = { capture: async (input: Record<string, unknown>) => { saved ??= { ...input }; } };
    sinon.stub(require('../../src/persistence/siem/runtime'), 'getSiemRepository').returns(repository as any);
    let calls = 0;
    Reflect.set(globalThis, 'AgendaQueueService', { now: async () => { if (++calls === 1) throw new Error('queue unavailable after commit'); } });
    const service = new Services.SecurityEventService();
    const job = { attrs: { data: { event: { eventId: 'replayed', brandId: 'test', deliveryState: 'pending' } } } };
    try { await service.storeSecurityEvent(job); throw new Error('expected failure'); } catch (error) { expect((error as Error).message).to.equal('queue unavailable after commit'); }
    expect(saved).not.to.equal(undefined);
    saved!.deliveryState = 'delivered';
    await service.storeSecurityEvent(job);
    expect(calls).to.equal(2);
    expect(saved!.deliveryState).to.equal('delivered');
  });
});
