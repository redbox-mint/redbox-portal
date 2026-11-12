import assert from 'node:assert/strict';
import { prepareReferenceRequest, inheritRequestPreparation } from '../../../src/http/actions/requestPreparation';
import type { ReferenceRequest } from '../../../src/http/actions/reference';

function facts(body: unknown, params = {}, query = {}): ReferenceRequest {
  return { body, params, query, context: { brand: { id: 'brand', name: 'default' }, portal: 'rdmp' } };
}
describe('Shared request preparation completion without input snapshots', () => {
  it('delegates once after preparation and uses newly derived body, params and query', async () => {
    let calls = 0;
    const preparation = {
      run: (_input: undefined, request: ReferenceRequest) => {
        calls++;
        return { ...request, body: { prepared: true, ...Object(request.body) } };
      },
    };
    // The host prepares after hooks, publishes the result, and transfers only
    // completion identity through the transport to the shared action adapter.
    const request = facts({ hook: true }, { id: 'hook-id' }, { apiVersion: '2.0' });
    const prepared = await prepareReferenceRequest(undefined, request, preparation);
    const transport = {};
    inheritRequestPreparation(prepared, transport);
    const live = facts({ replacement: true }, { id: 'replacement-id' }, { apiVersion: '1.0' });
    inheritRequestPreparation(transport, live);
    const action = await prepareReferenceRequest(undefined, live, preparation);
    assert.strictEqual(action, live);
    assert.deepEqual(action.body, { replacement: true });
    assert.deepEqual(action.params, { id: 'replacement-id' });
    assert.deepEqual(action.query, { apiVersion: '1.0' });
    assert.equal(calls, 1);
  });
  it('does not cache failed preparation or share completion across independent requests', async () => {
    let calls = 0;
    const preparation = {
      run: (_input: undefined, request: ReferenceRequest) => {
        if (++calls === 1) throw new Error('preparation failed');
        return request;
      },
    };
    const request = facts({});
    await assert.rejects(prepareReferenceRequest(undefined, request, preparation), /preparation failed/);
    await prepareReferenceRequest(undefined, request, preparation);
    await prepareReferenceRequest(undefined, request, preparation);
    await prepareReferenceRequest(undefined, facts({}), preparation);
    assert.equal(calls, 3);
  });
});
