import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as sinon from 'sinon';
import { createSinonStubLogger } from '../../logger.test';
import { FigsharePublishing } from '../../../src/configmodels/FigsharePublishing';
import { makeLiveClient } from '../../../src/services/figshare-v2/http';
import { figshareExecution, type FigshareExecution } from '../../../src/services/figshare-v2/execution';

describe('Figshare raw HTTP mutation authority', function () {
  let server: Server;
  let baseUrl: string;
  let requests = 0;
  let previousSails: PropertyDescriptor | undefined;
  before(async function () {
    server = createServer((_req, res) => {
      requests++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async function () {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  beforeEach(() => {
    previousSails = Object.getOwnPropertyDescriptor(globalThis, 'sails');
    Reflect.set(globalThis, 'sails', { log: createSinonStubLogger(sinon) });
    requests = 0;
  });
  afterEach(() => {
    sinon.restore();
    if (previousSails) Object.defineProperty(globalThis, 'sails', previousSails);
    else Reflect.deleteProperty(globalThis, 'sails');
  });
  const denied = async (): Promise<never> => {
    throw new Error('current publication authority denied');
  };
  const execution: FigshareExecution = { signal: new AbortController().signal, guard: denied, metadata: denied };
  function client() {
    const config = new FigsharePublishing();
    config.processing.enabled = true;
    config.connection.baseUrl = baseUrl;
    config.connection.retry.maxAttempts = 1;
    return makeLiveClient(config, {
      recordOid: 'record',
      brandId: 'brand',
      brandName: 'brand',
      correlationId: 'test',
      triggerSource: 'test',
    });
  }
  it('cannot treat an upload URL containing the account-discovery path as a read-only operation', async function () {
    await assert.rejects(
      figshareExecution.run(execution, () =>
        client().uploadFilePart(`${baseUrl}/upload?next=/institution/accounts/search`, 1, Buffer.from('approved bytes'))
      ),
      /current publication authority denied/
    );
    assert.equal(requests, 0);
  });
  it('permits the actual read-only account search without mutation authority', async function () {
    assert.deepEqual(await figshareExecution.run(execution, () => client().searchInstitutionAccounts({ page: 1 })), []);
    assert.equal(requests, 1);
  });
});
