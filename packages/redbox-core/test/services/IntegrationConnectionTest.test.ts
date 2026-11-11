import { expect } from 'chai';
import * as sinon from 'sinon';
import axios from 'axios';
import { createServer, type Server } from 'node:http';
import { testIntegrationConnection } from '../../src/services/IntegrationConnectionTest';
import { Services } from '../../src/services/AppConfigService';
import { integrationConnectionBody, type IntegrationKey } from '../../src/api-routes/groups/appconfig';
import { createMockSails } from './testHelper';

const secret = 'private-connection-test-secret';
const keys: IntegrationKey[] = ['figsharePublishing', 'doiPublishing', 'raidPublishing', 'oniPublishing'];
const config = (key: IntegrationKey, baseUrl = 'https://configured.example/api') => key === 'oniPublishing'
  ? { defaultSite: 'primary', sites: { primary: { enabled: true, publicUrl: baseUrl, ingestion: { enabled: true, apiUrl: baseUrl, adminToken: secret, timeoutMs: 30000 } } } }
  : { connection: { baseUrl, token: secret, username: 'client-id', password: secret, timeoutMs: 30000 } };
const body = (key: IntegrationKey) => ({
  figsharePublishing: { id: 12 }, doiPublishing: { data: { id: 'client-id', type: 'clients' } },
  raidPublishing: [], oniPublishing: { isIndexed: false, count: 0 },
})[key];

describe('Integration connection tests', () => {
  let previous: any;
  beforeEach(() => { previous = (global as any).sails; (global as any).sails = createMockSails(); });
  afterEach(() => { sinon.restore(); (global as any).sails = previous; });
  for (const key of keys) {
    describe(key, () => {
      it('uses the configured URL, real authentication format, bounded timeout, strict TLS and no redirects', async () => {
        const request = sinon.stub(axios, 'request').resolves({ status: 200, data: body(key) });
        expect(await testIntegrationConnection(key, config(key))).to.include({ ok: true, status: 'ok', httpStatus: 200 });
        const options = request.firstCall.args[0];
        expect(options.url).to.equal('https://configured.example/api' + ({ figsharePublishing: '/account', doiPublishing: '/clients/client-id', raidPublishing: '/service-point/', oniPublishing: '/admin/index/structural' })[key]);
        expect(options.method).to.equal('get');
        expect(options.timeout).to.equal(10000);
        expect(options.maxRedirects).to.equal(0);
        expect(options.httpsAgent).to.equal(undefined); // System TLS verification remains enabled.
        expect(options.signal).to.be.instanceOf(AbortSignal);
        const authorization = (options.headers as any).Authorization;
        expect(authorization).to.equal(key === 'doiPublishing' ? `Basic ${Buffer.from('client-id:' + secret).toString('base64')}` : `${key === 'figsharePublishing' ? 'token' : 'Bearer'} ${secret}`);
      });
      for (const status of [401, 403]) it(`classifies HTTP ${status} without leaking the response body or credentials`, async () => {
        sinon.stub(axios, 'request').resolves({ status, data: { token: secret, message: secret } });
        const result = await testIntegrationConnection(key, config(key));
        expect(result).to.include({ ok: false, status: 'auth_failed', httpStatus: status });
        expect(JSON.stringify(result)).not.to.contain(secret);
      });
      for (const [code, status] of [
        ['ECONNABORTED', 'timeout'], ['ETIMEDOUT', 'timeout'], ['ENOTFOUND', 'unreachable'],
        ['ECONNREFUSED', 'unreachable'], ['CERT_HAS_EXPIRED', 'tls_error'], ['DEPTH_ZERO_SELF_SIGNED_CERT', 'tls_error'],
      ]) it(`classifies ${code} without logging or returning the raw error`, async () => {
        const logger = sails.log.error as sinon.SinonStub;
        const warn = sails.log.warn as sinon.SinonStub;
        sinon.stub(axios, 'request').rejects(Object.assign(new Error(secret), { code, config: { headers: { Authorization: secret } } }));
        const result = await testIntegrationConnection(key, config(key));
        expect(result.status).to.equal(status);
        expect(JSON.stringify(result)).not.to.contain(secret);
        expect(logger.called || warn.called).to.equal(false);
      });
      for (const [status, data] of [[200, '<html>login</html>'], [302, secret], [404, secret], [500, secret]] as const) it(`rejects unexpected ${status} responses`, async () => {
        sinon.stub(axios, 'request').resolves({ status, data });
        expect(await testIntegrationConnection(key, config(key))).to.include({ status: 'unexpected_response', httpStatus: status });
      });
      for (const base of ['file:///etc/passwd', 'ftp://configured.example', 'http://user:pass@configured.example', 'http://configured.example?redirect=evil', 'http://configured.example/#fragment', 'http://configured.example\\@evil.test']) it(`guards invalid base URL ${base}`, async () => {
        const request = sinon.stub(axios, 'request');
        expect((await testIntegrationConnection(key, config(key, base))).status).to.equal('misconfigured');
        expect(request.called).to.equal(false);
      });
      it('aborts a stalled request at the overall deadline', async () => {
        const clock = sinon.useFakeTimers();
        const request = sinon.stub(axios, 'request').returns(new Promise(() => {}));
        const pending = testIntegrationConnection(key, config(key));
        await clock.tickAsync(10000);
        expect(await pending).to.include({ status: 'timeout', latencyMs: 10000 });
        expect(request.firstCall.args[0].signal!.aborted).to.equal(true);
      });
      it('merges a draft URL and retains blank secrets without modifying the runtime config', async () => {
        const service = new Services.AppConfigs();
        const saved = config(key);
        service.brandingAppConfigMap.default = { [key]: saved } as any;
        const before = JSON.stringify(saved);
        const request = sinon.stub(axios, 'request').resolves({ status: 200, data: body(key) });
        const draft = key === 'oniPublishing' ? { sites: { primary: { ingestion: { apiUrl: 'http://draft.example', adminToken: '' } } } }
          : { connection: { baseUrl: 'http://draft.example', token: '', password: '' } };
        const result = await service.testConnection('default', 'admin-id', key, draft);
        expect(result.result.ok).to.equal(true);
        expect(request.firstCall.args[0].url).to.contain('http://draft.example/');
        expect((request.firstCall.args[0].headers as any).Authorization).to.contain(key === 'doiPublishing' ? Buffer.from('client-id:' + secret).toString('base64') : secret);
        expect(JSON.stringify(saved)).to.equal(before);
        expect(JSON.stringify(result)).not.to.contain(secret);
      });
    });
  }
  for (const key of ['figsharePublishing', 'doiPublishing'] as const) it(`resolves stored ${key} environment references through the publishing resolver`, async () => {
    const name = 'REDBOX_CONNECTION_TEST_TOKEN';
    const previous = process.env[name];
    try {
      process.env[name] = secret;
      const service = new Services.AppConfigs();
      const saved = config(key) as any;
      saved.connection[key === 'figsharePublishing' ? 'token' : 'password'] = '$' + name;
      service.brandingAppConfigMap.default = { [key]: saved } as any;
      const request = sinon.stub(axios, 'request').resolves({ status: 200, data: body(key) });
      const result = await service.testConnection('default', 'admin-id', key, { connection: { token: '', password: '' } });
      expect(result.result.ok).to.equal(true);
      expect((request.firstCall.args[0].headers as any).Authorization).to.contain(key === 'doiPublishing' ? Buffer.from('client-id:' + secret).toString('base64') : secret);
      expect(saved.connection[key === 'figsharePublishing' ? 'token' : 'password']).to.equal('$' + name);
    } finally {
      if (previous === undefined) delete process.env[name]; else process.env[name] = previous;
    }
  });
  it('honors a shorter configured request timeout', async () => {
    const saved = config('figsharePublishing') as any;
    saved.connection.timeoutMs = 450;
    const request = sinon.stub(axios, 'request').resolves({ status: 200, data: { id: 1 } });
    await testIntegrationConnection('figsharePublishing', saved);
    expect(request.firstCall.args[0].timeout).to.equal(450);
  });
  it('uses configured RAiD OAuth credentials before an authenticated harmless GET, without caching draft tokens', async () => {
    const request = sinon.stub(axios, 'request');
    request.onFirstCall().resolves({ status: 200, data: { access_token: secret } });
    request.onSecondCall().resolves({ status: 200, data: [] });
    const raid = { connection: { baseUrl: 'https://raid.example', token: '', timeoutMs: 1500, oauth: { url: 'https://auth.example/token', clientId: 'client', username: 'user', password: secret, timeoutMs: 1000 } } };
    expect((await testIntegrationConnection('raidPublishing', raid)).ok).to.equal(true);
    expect(request.firstCall.args[0]).to.include({ url: 'https://auth.example/token', method: 'post', maxRedirects: 0, timeout: 6000 });
    expect(String(request.firstCall.args[0].data)).to.contain('grant_type=password');
    expect((request.secondCall.args[0].headers as any).Authorization).to.equal('Bearer ' + secret);
    expect(request.secondCall.args[0].method).to.equal('get');
  });
  for (const status of [401, 403, 302, 200]) it(`handles RAiD OAuth failure ${status} without calling the API`, async () => {
    const request = sinon.stub(axios, 'request').resolves({ status, data: { message: secret } });
    const raid = { connection: { baseUrl: 'https://raid.example', oauth: { url: 'https://auth.example/token', username: 'u', password: secret, clientId: 'client' } } };
    const result = await testIntegrationConnection('raidPublishing', raid);
    expect(result.status).to.equal([401, 403].includes(status) ? 'auth_failed' : 'unexpected_response');
    expect(request.calledOnce).to.equal(true);
    expect(JSON.stringify(result)).not.to.contain(secret);
  });
  it('applies one overall deadline across OAuth and API requests', async () => {
    const clock = sinon.useFakeTimers();
    const request = sinon.stub(axios, 'request');
    request.onFirstCall().callsFake(async () => { await new Promise(resolve => setTimeout(resolve, 8000)); return { status: 200, data: { access_token: secret } }; });
    request.onSecondCall().returns(new Promise(() => {}));
    const pending = testIntegrationConnection('raidPublishing', { connection: { baseUrl: 'https://raid.example', oauth: { url: 'https://auth.example/token', username: 'u', password: secret, clientId: 'client' } } });
    await clock.tickAsync(10000);
    expect(await pending).to.include({ status: 'timeout', latencyMs: 10000 });
    expect(request.callCount).to.equal(2);
  });
  it('rejects invalid OAuth schemes before any calls, including calls to the API', async () => {
    const request = sinon.stub(axios, 'request');
    const result = await testIntegrationConnection('raidPublishing', { connection: { baseUrl: 'https://raid.example', oauth: { url: 'file:///etc/passwd', username: 'u', password: secret, clientId: 'client' } } });
    expect(result.status).to.equal('misconfigured');
    expect(request.called).to.equal(false);
  });
  it('reports Oni public-site reachability with the explicit auth/storage limitation', async () => {
    const request = sinon.stub(axios, 'request').resolves({ status: 200, data: '<html>Oni</html>' });
    const result = await testIntegrationConnection('oniPublishing', { defaultSite: 'primary', sites: { primary: { enabled: true, publicUrl: 'https://oni.example' } } });
    expect(result.ok).to.equal(true);
    expect(result.message).to.contain('Authentication and storage access were not tested');
    expect(request.firstCall.args[0].headers).to.equal(undefined);
  });
  it('scopes the cooldown to the user and brand across integrations; another user/brand is independent', async () => {
    const clock = sinon.useFakeTimers();
    const service = new Services.AppConfigs();
    const a = await service.testConnection('one', 'user', 'figsharePublishing');
    expect(a.retryAfter).to.equal(undefined);
    expect((await service.testConnection('one', 'user', 'doiPublishing')).retryAfter).to.equal(5);
    expect((await service.testConnection('two', 'user', 'figsharePublishing')).retryAfter).to.equal(undefined);
    expect((await service.testConnection('one', 'other-user', 'figsharePublishing')).retryAfter).to.equal(undefined);
    await clock.tickAsync(5000);
    expect((await service.testConnection('one', 'user', 'figsharePublishing')).retryAfter).to.equal(undefined);
  });
  it('handles explicit secret removal and backend masks without persistence', async () => {
    const service = new Services.AppConfigs();
    service.brandingAppConfigMap.default = { figsharePublishing: config('figsharePublishing') } as any;
    const request = sinon.stub(axios, 'request').resolves({ status: 200, data: { id: 1 } });
    expect((await service.testConnection('default', 'one', 'figsharePublishing', { connection: { token: '__REDACTED__' } })).result.ok).to.equal(true);
    expect((await service.testConnection('default', 'two', 'figsharePublishing', { connection: { token: '__CLEAR_SECRET__' } })).result.status).to.equal('misconfigured');
    expect(request.calledOnce).to.equal(true);
  });
  it('rejects unsafe keys, injected secret references and oversized/deep/non-JSON drafts', () => {
    for (const draft of [JSON.parse('{"__proto__":{}}'), { connection: { token: { $appConfigSecret: { arn: 'private' } } } }, { value: 'x'.repeat(256 * 1024) }, { field: undefined }]) {
      expect(integrationConnectionBody.safeParse({ draft }).success).to.equal(false);
    }
    let deep: any = {};
    for (let i = 0; i < 32; i++) deep = { child: deep };
    expect(integrationConnectionBody.safeParse({ draft: deep }).success).to.equal(false);
    expect(integrationConnectionBody.safeParse({ draft: {}, branding: 'other' }).success).to.equal(false);
  });
});

describe('Integration probe against local mocked upstream', () => {
  let server: Server;
  let base: string;
  let hits: string[];
  beforeEach(async () => {
    hits = [];
    server = createServer((req, res) => {
      hits.push(req.url!);
      if (req.url!.startsWith('/redirect')) { res.writeHead(302, { Location: '/stolen' }); res.end(); }
      else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: 1 })); }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
  it('makes only a read-only request and refuses to forward credentials on any redirect', async () => {
    expect((await testIntegrationConnection('figsharePublishing', config('figsharePublishing', base))).ok).to.equal(true);
    expect((await testIntegrationConnection('figsharePublishing', config('figsharePublishing', base + '/redirect'))).status).to.equal('unexpected_response');
    expect(hits).to.deep.equal(['/account', '/redirect/account']);
  });
});
