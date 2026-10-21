import assert from 'node:assert/strict';
import { PublicationProviderRegistry } from '../../../src/services/publication/registry';
import type { PublicationRepairContext } from '../../../src/services/publication/contracts';
import { Services as QueueServices } from '../../../src/services/AgendaQueueService';
import { reviewProvider, configuredDestination } from '../../fixtures/publication/provider';

function context(): PublicationRepairContext {
  return {
    brandId: 'brand',
    oid: 'record',
    destinationId: 'review',
    targetFingerprint: 'verified-target',
    configuration: configuredDestination(),
    state: { receipt: 'owned' },
    operations: [],
    parameters: {},
    reconcile: async () => ({ state: { receipt: 'owned', confirmed: true }, operations: [] }),
    withResourceLease: async (_namespace, _resource, run) => run({ operations: [], journal: async () => {} }),
  };
}
describe('Publication administration boundaries (PUB-15)', () => {
  it('exposes immutable repair descriptions while retaining execution at the typed adapter boundary', () => {
    const registry = new PublicationProviderRegistry();
    registry.register({
      ...reviewProvider,
      repairs: [
        { id: 'reconcile-evidence', description: 'Read back a deposit', run: async context => context.reconcile() },
      ],
    });
    const provider = registry.get(reviewProvider.id)!;
    assert.deepEqual(provider.repairs, [{ id: 'reconcile-evidence', description: 'Read back a deposit' }]);
    assert.ok(Object.isFrozen(provider.repairs));
    assert.ok(Object.isFrozen(provider.repairs![0]));
    assert.equal(Reflect.has(provider.repairs![0], 'run'), false);
  });
  it('rejects unknown or description-only repairs rather than accepting arbitrary state edits', async () => {
    const registry = new PublicationProviderRegistry();
    registry.register({
      ...reviewProvider,
      repairs: [{ id: 'manual', description: 'Requires a future verified action' }],
    });
    await assert.rejects(registry.get(reviewProvider.id)!.repair!('unknown', context(), 2), /Unsupported/);
    await assert.rejects(registry.get(reviewProvider.id)!.repair!('manual', context(), 2), /Unsupported/);
  });
  it('validates configuration and state versions before a repair and validates the returned checkpoint', async () => {
    const registry = new PublicationProviderRegistry();
    registry.register({
      ...reviewProvider,
      repairs: [
        { id: 'verified', description: 'Checked correction', run: async context => ({ state: context.state }) },
      ],
    });
    const repair = registry.get(reviewProvider.id)!.repair!;
    await assert.rejects(repair('verified', { ...context(), configuration: {} }, 2), /Invalid/);
    await assert.rejects(repair('verified', context(), 99), /Invalid/);
    await assert.rejects(repair('verified', context(), 0), /Invalid/);
  });
  it('upgrades a copied state and narrows reconciliation results without changing the original receipt', async () => {
    const registry = new PublicationProviderRegistry();
    registry.register({
      ...reviewProvider,
      repairs: [
        {
          id: 'verified',
          description: 'Checked correction',
          run: async context => ({ state: { ...context.state, reconciled: (await context.reconcile()).state } }),
        },
      ],
    });
    const input = context();
    const result = await registry.get(reviewProvider.id)!.repair!('verified', input, 1);
    assert.deepEqual(input.state, { receipt: 'owned' });
    assert.equal(result.state.upgraded, true);
    assert.deepEqual(result.state.reconciled, { receipt: 'owned', confirmed: true });
  });
  it('disables queue readiness before accessing backend configuration in a publication admin process', async () => {
    const previous = process.env.REDBOX_PUBLICATION_ADMIN;
    class Queue extends QueueServices.AgendaQueue {
      ready() {
        return this.handleReady();
      }
    }
    try {
      process.env.REDBOX_PUBLICATION_ADMIN = 'true';
      const queue = new Queue();
      await queue.ready();
      assert.equal(Reflect.get(queue, 'queueInitialized'), false);
      assert.deepEqual(Reflect.get(queue, 'agendas'), {});
    } finally {
      if (previous === undefined) delete process.env.REDBOX_PUBLICATION_ADMIN;
      else process.env.REDBOX_PUBLICATION_ADMIN = previous;
    }
  });
});
