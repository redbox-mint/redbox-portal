import { expect } from 'chai';
import { GenerationModelConnectionWLDef } from '../../src/waterline-models/GenerationModelConnection';

type ConnectionDefinition = {
  attributes: Record<string, { defaultsTo?: unknown }>;
  beforeCreate?: (record: Record<string, unknown>, callback: (error?: Error) => void) => void;
  beforeUpdate?: (record: Record<string, unknown>, callback: (error?: Error) => void) => void;
};

// Run the exported lifecycle hooks used by Waterline rather than a service-only stub.
describe('Generation connection timeout lifecycle', () => {
  const definition = GenerationModelConnectionWLDef as ConnectionDefinition;
  function run(hook: 'beforeCreate' | 'beforeUpdate', values: Record<string, unknown>): Error | undefined {
    const callback = definition[hook];
    if (!callback) throw new Error(`Missing ${hook} lifecycle hook`);
    let failure: Error | undefined;
    callback(values, error => { failure = error; });
    return failure;
  }
  const timeoutValues = [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5, 2_147_483_648, '1000', null];
  for (const hook of ['beforeCreate', 'beforeUpdate'] as const) {
    for (const timeoutMs of timeoutValues) {
      it(`rejects ${String(timeoutMs)} in ${hook}`, () => {
        const values = hook === 'beforeCreate' ? { brandId: 'brand-1', key: 'connection', name: 'Connection', timeoutMs } : { timeoutMs };
        expect(run(hook, values)).to.be.instanceOf(Error);
      });
    }
    for (const timeoutMs of [1, 90_000, 2_147_483_647]) {
      it(`accepts the valid ${timeoutMs}ms timeout in ${hook}`, () => {
        const values = hook === 'beforeCreate' ? { brandId: 'brand-1', key: 'connection', name: 'Connection', timeoutMs } : { timeoutMs };
        expect(run(hook, values)).to.equal(undefined); expect(values.timeoutMs).to.equal(timeoutMs);
      });
    }
  }
  it('retains the 90000ms schema default and permits an omitted create timeout', () => {
    expect(definition.attributes.timeoutMs.defaultsTo).to.equal(90_000);
    const values = { brandId: 'brand-1', key: 'connection', name: 'Connection' };
    expect(run('beforeCreate', values)).to.equal(undefined);
    expect(values).not.to.have.property('timeoutMs');
  });
  it('does not require a timeout on an unrelated partial update', () => {
    expect(run('beforeUpdate', { name: 'Updated connection' })).to.equal(undefined);
  });
});
