import assert from 'node:assert/strict';
import sinon from 'sinon';


import path from 'node:path';
import { RequestChronicleHelper } from '../../src/utilities/RequestChronicle';
import { runWithRequestChronicle } from '../../src/utilities/RequestChronicleContext';
import { createSinonStubLogger } from '../logger.test';
let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));

describe('Owned HTTP request chronicle integration', function () {

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
it('retains correlated late-operation reporting without mutating a completed request', async function () {
    const logger = createSinonStubLogger(sinon);
    const req = { method: 'POST', path: '/test', headers: {}, query: {}, body: {} };
    const rc = RequestChronicleHelper.fromReq(logger, req, { generateRequestId: () => 'request-1' });
    rc.start();
    rc.finish({ statusCode: 302, headersSent: true, writableFinished: true });
    await runWithRequestChronicle(rc, async () => {
      await flush();
      rc.addOperationResult('userAuditEventLogout', new Error('audit unavailable'));
    });
    assert.equal(logger.error.callCount, 1);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(logger.error.firstCall.args[0]).filter(([k]) =>
          ['requestId', 'operation', 'outcome'].includes(k)
        )
      ),
      { requestId: 'request-1', operation: 'userAuditEventLogout', outcome: 'failure' }
    );
    assert.equal(rc.data.userAuditEventLogout, undefined);
  });
afterEach(() => sinon.restore());
});
