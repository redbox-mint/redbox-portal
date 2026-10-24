import { expect } from 'chai';
import { Services } from '../../src/integrations/SecurityEvents';
import { createSinonStubLogger } from '../logger.test';
import * as sinon from 'sinon';

describe('SIEM capture replay', () => {
  afterEach(() => sinon.restore());
  it('retries enqueue after a committed capture without changing delivered state', async () => {
    let saved: Record<string, unknown> | undefined;
    const repository = {
      capture: async (input: Record<string, unknown>) => {
        saved ??= { ...input };
      },
    };
    let calls = 0;
    const service = new Services.SecurityEventService({
      repository: repository as any,
      log: createSinonStubLogger(sinon),
      brand: () => null,
      configuration: () => ({}),
      record: async () => null,
      enqueue: async () => {
        if (++calls === 1) throw new Error('queue unavailable after commit');
      },
    });
    const job = { attrs: { data: { event: { eventId: 'replayed', brandId: 'test', deliveryState: 'pending' } } } };
    try {
      await service.storeSecurityEvent(job);
      throw new Error('expected failure');
    } catch (error) {
      expect((error as Error).message).to.equal('queue unavailable after commit');
    }
    expect(saved).not.to.equal(undefined);
    saved!.deliveryState = 'delivered';
    await service.storeSecurityEvent(job);
    expect(calls).to.equal(2);
    expect(saved!.deliveryState).to.equal('delivered');
  });
});
