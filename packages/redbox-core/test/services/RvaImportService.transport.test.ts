import { expect } from 'chai';
import axios from 'axios';
import { createServer, type Server, type IncomingHttpHeaders } from 'node:http';
import * as sinon from 'sinon';
import { Services } from '../../src/services/RvaImportService';

describe('RvaImportService generated transport', () => {
  let server: Server;
  let service: Services.RvaImport;
  let requests: { method: string | undefined; url: string; headers: IncomingHttpHeaders; body: string }[];
  let respond: (url: string) => { status?: number; data: unknown } | null;
  let generatedRequests: sinon.SinonSpy;
  let create: sinon.SinonStub;

  beforeEach(async () => {
    create = sinon.stub().resolves({ id: 'local-vocab' });
    requests = [];
    respond = () => ({ data: { response: { docs: [{ id: '1', title: 'Local vocabulary' }] } } });
    server = createServer((req, res) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        requests.push({ method: req.method, url: req.url!, headers: req.headers, body });
        const result = respond(req.url!);
        if (result === null) return;
        res.writeHead(result.status ?? 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.data));
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP listener');
    service = new Services.RvaImport({
      repository: { getVocabulary: async () => null, reviseVocabulary: async () => undefined } as any,
      vocabulary: { create, upsertEntries: sinon.stub().resolves() },
      log: { error: sinon.stub(), warn: sinon.stub(), info: sinon.stub(), debug: sinon.stub(), verbose: sinon.stub() } as any,
      baseUrl: () => `http://127.0.0.1:${address.port}/registry/`, defaultBrand: () => 'default'
    });
    // Observe the generated client's actual request config, independently of the legacy client.
    generatedRequests = sinon.spy(Reflect.get(Reflect.get(service, 'servicesApi'), 'axios'), 'request');
  });

  afterEach(async () => {
    sinon.restore();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  });

  it('sends generated search requests with the configured base URL, encoding, headers and 15-second timeout', async () => {
    expect(await service.searchRva('  local & vocabulary  ')).to.deep.equal([
      { id: '1', title: 'Local vocabulary', slug: undefined, description: undefined, owner: undefined },
    ]);
    expect(requests).to.have.length(1);
    expect(requests[0].method).to.equal('POST');
    expect(requests[0].url).to.equal('/registry/api/services/search');
    expect(requests[0].headers.accept).to.equal('application/json');
    expect(requests[0].headers['content-type']).to.contain('application/x-www-form-urlencoded');
    expect(JSON.parse(new URLSearchParams(requests[0].body).get('filtersJson')!)).to.deep.equal({
      q: 'local & vocabulary',
      pp: 20,
    });
    expect(generatedRequests.calledOnce).to.equal(true);
    expect(generatedRequests.firstCall.args[0].timeout).to.equal(15000);
  });

  it('uses generated resource requests and retains the 406 legacy concept-tree fallback and timeout', async () => {
    respond = url => {
      if (url.startsWith('/registry/api/resource/vocabularies/1'))
        return { data: { id: 1, title: 'Local vocabulary', version: [{ id: 101, status: 'current' }] } };
      if (url === '/registry/api/resource/versions/101/versionArtefacts/conceptTree')
        return { status: 406, data: 'Use legacy' };
      if (url === '/repository/api/rva/version/101/concept-tree')
        return { data: [{ id: 'c1', label: 'Local concept' }] };
      throw new Error(`Unexpected local request: ${url}`);
    };
    const legacyClient = Reflect.get(service, 'httpClient');
    const legacyGet = sinon.spy(legacyClient, 'get');
    await service.importRvaVocabulary('1');
    expect(create.calledOnce).to.equal(true);
    expect(requests.map(r => r.method)).to.deep.equal(['GET', 'GET', 'GET']);
    expect(requests[1].headers.accept).to.equal('text/plain');
    expect(requests[2].url).to.equal('/repository/api/rva/version/101/concept-tree');
    expect(generatedRequests.getCalls().map(call => call.args[0].timeout)).to.deep.equal([15000, 15000]);
    expect(legacyGet.calledOnce).to.equal(true);
    expect(legacyGet.firstCall.args[0]).to.contain('/repository/api/rva/version/101/concept-tree');
    expect(legacyClient.defaults.timeout).to.equal(15000);
  });

  it('aborts a stalled generated request using its configured timeout', async () => {
    // Override only this instance's generated configuration to keep the real HTTP test fast.
    const shortTimeoutMs = 100;
    Reflect.get(service, 'apiConfiguration').baseOptions.timeout = shortTimeoutMs;
    respond = () => null;
    try {
      await service.searchRva('stalled');
      expect.fail('Expected the local request to time out');
    } catch (error) {
      if (!axios.isAxiosError(error)) throw error;
      expect(error.code).to.equal('ECONNABORTED');
      expect(error.message).to.equal(`timeout of ${shortTimeoutMs}ms exceeded`);
      expect(error.config?.timeout).to.equal(shortTimeoutMs);
    }
    expect(requests).to.have.length(1);
  });
});
