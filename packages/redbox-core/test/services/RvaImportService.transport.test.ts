import { expect } from 'chai';
import axios from 'axios';
import * as lodash from 'lodash';
import { createServer, type Server, type IncomingHttpHeaders } from 'node:http';
import { Socket } from 'node:net';
import * as sinon from 'sinon';
import { Services } from '../../src/services/RvaImportService';

describe('RvaImportService generated transport', () => {
  let server: Server;
  let service: Services.RvaImport;
  let sailsDescriptor: PropertyDescriptor | undefined;
  let lodashDescriptor: PropertyDescriptor | undefined;
  let requests: { method: string | undefined; url: string; headers: IncomingHttpHeaders; body: string }[];
  let respond: (url: string) => { status?: number; data: unknown } | null;
  let timeouts: sinon.SinonSpy;
  let vocabularyDescriptor: PropertyDescriptor | undefined;
  let create: sinon.SinonStub;

  beforeEach(async () => {
    sailsDescriptor = Object.getOwnPropertyDescriptor(global, 'sails');
    lodashDescriptor = Object.getOwnPropertyDescriptor(global, '_');
    Object.defineProperty(global, '_', { configurable: true, value: lodash });
    vocabularyDescriptor = Object.getOwnPropertyDescriptor(global, 'VocabularyService');
    create = sinon.stub().resolves({ id: 'local-vocab' });
    Object.defineProperty(global, 'VocabularyService', { configurable: true, value: { create } });
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
    // Keep the suite's existing Sails fixture; isolate just the service configuration.
    Object.defineProperty(global, 'sails', {
      configurable: true,
      value: { config: { vocab: { rva: { baseUrl: `http://127.0.0.1:${address.port}/registry/` } } } },
    });
    service = new Services.RvaImport();
    timeouts = sinon.spy(Socket.prototype, 'setTimeout');
  });

  afterEach(async () => {
    sinon.restore();
    if (sailsDescriptor) Object.defineProperty(global, 'sails', sailsDescriptor);
    else Reflect.deleteProperty(global, 'sails');
    if (lodashDescriptor) Object.defineProperty(global, '_', lodashDescriptor);
    else Reflect.deleteProperty(global, '_');
    if (vocabularyDescriptor) Object.defineProperty(global, 'VocabularyService', vocabularyDescriptor);
    else Reflect.deleteProperty(global, 'VocabularyService');
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
    expect(timeouts.calledWith(15000)).to.equal(true);
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
    await service.importRvaVocabulary('1');
    expect(create.calledOnce).to.equal(true);
    expect(requests.map(r => r.method)).to.deep.equal(['GET', 'GET', 'GET']);
    expect(requests[1].headers.accept).to.equal('text/plain');
    expect(requests[2].url).to.equal('/repository/api/rva/version/101/concept-tree');
    expect(timeouts.getCalls().filter(c => c.args[0] === 15000).length).to.be.at.least(3);
  });

  it('aborts a stalled generated request after the configured 15000ms timeout', async function () {
    this.timeout(20000);
    respond = () => null;
    const started = Date.now();
    try {
      await service.searchRva('stalled');
      expect.fail('Expected the local request to time out');
    } catch (error) {
      if (!axios.isAxiosError(error)) throw error;
      expect(error.code).to.equal('ECONNABORTED');
      expect(error.message).to.equal('timeout of 15000ms exceeded');
      expect(Date.now() - started).to.be.at.least(14000);
    }
    expect(requests).to.have.length(1);
  });
});
