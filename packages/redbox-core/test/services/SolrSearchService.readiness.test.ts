import { expect } from 'chai';
import * as sinon from 'sinon';
import { createServer } from 'node:http';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';
import { Services } from '../../src/services/SolrSearchService';
import { SOLR_EXACT_ACL_FIELDS, type SolrCoreSchema, type SolrFieldDefinition } from '../../src/config/solr.config';
const axios: {
  create: (options: unknown) => { post: sinon.SinonStub };
  get: (url: string) => Promise<{ data: unknown }>;
  post: (url: string, schema: SolrCoreSchema) => Promise<{ data: object }>;
} = require('axios');

describe('SolrSearchService bootstrap readiness', function () {
  let service: Services.SolrSearchService;
  let sailsMock: any;
  let writes: sinon.SinonStub;
  let schemaPosts: sinon.SinonStub;
  let gets: sinon.SinonStub;
  let applySchema: (url: string, schema: SolrCoreSchema) => Promise<{ data: object }>;
  beforeEach(async function () {
    const core = (name: string) => ({
      options: { host: 'solr', port: 8983, core: name },
      schema: {
        'add-field': [{ name: 'title', type: 'string', stored: true, indexed: true }],
        'add-dynamic-field': [],
        'add-copy-field': [],
      },
      preIndex: { move: [{ source: 'metadata', dest: '' }], flatten: { options: { delimiter: '_' } } },
    });
    sailsMock = createMockSails({
      config: {
        solr: {
          cores: { default: core('redbox'), secondary: core('other') },
          maxWaitTries: 2,
          waitTime: 0,
          createOrUpdateJobName: 'index',
        },
        queue: { serviceName: 'agendaqueueservice' },
      },
      services: { agendaqueueservice: { now: sinon.stub().resolves() } },
    });
    setupServiceTestGlobals(sailsMock);
    writes = sinon.stub().resolves({});
    sinon.stub(axios, 'create').returns({ post: writes });
    const fieldsByCore = new Map<string, SolrFieldDefinition[]>();
    gets = sinon.stub(axios, 'get').callsFake(async (url: string) => ({
      data: url.includes('action=STATUS')
        ? { status: { redbox: { instanceDir: '/redbox' }, other: { instanceDir: '/other' } } }
        : { schema: {
          fields: structuredClone(fieldsByCore.get(url.split('/solr/')[1].split('/')[0]) ?? []),
          fieldTypes: [{ name: 'string', class: 'solr.StrField' }],
          dynamicFields: [], copyFields: [],
        } },
    }));
    applySchema = async (url, schema) => {
      const coreName = url.split('/solr/')[1].split('/')[0];
      fieldsByCore.set(coreName, structuredClone(schema['add-field']));
      return { data: {} };
    };
    schemaPosts = sinon.stub(axios, 'post').callsFake(applySchema);
    service = new Services.SolrSearchService();
    await (service as any).processDynamicImports();
  });
  afterEach(function () {
    sinon.restore();
    cleanupServiceTestGlobals();
  });
  const record = (core = 'default') =>
    ({ metadata: { title: 'Cold bootstrap' }, metaMetadata: { searchCore: core } }) as any;
  const tick = () => new Promise<void>(resolve => setImmediate(resolve));

  it('awaits every core schema before pre-lift init completes and concurrent bootstrap writes run', async function () {
    let release!: () => void;
    schemaPosts.onSecondCall().callsFake(async (url: string, schema: SolrCoreSchema) => {
      await new Promise<void>(resolve => { release = resolve; });
      return applySchema(url, schema);
    });
    let initialized = false;
    const init = Promise.resolve(service.init()).then(() => {
      initialized = true;
    });
    const first = service.index('bootstrap-one', record());
    const second = service.index('bootstrap-two', record('secondary'));
    await tick();
    expect(initialized).to.equal(false);
    expect(writes.called).to.equal(false);
    expect(schemaPosts.callCount).to.equal(2);
    for (const call of schemaPosts.getCalls()) {
      expect(call.args[1]['add-field']).to.deep.include.members(SOLR_EXACT_ACL_FIELDS);
    }
    release();
    await init;
    expect(await first).to.equal(true);
    expect(await second).to.equal(true);
    expect(writes.args.filter(args => Array.isArray(args[1])).map(args => args[1][0].id)).to.have.members([
      'bootstrap-one',
      'bootstrap-two',
    ]);
    expect(schemaPosts.callCount).to.equal(2);
    expect(gets.args.filter(args => args[0].includes('/schema?'))).to.have.length(4);
    await sailsMock.on.firstCall.args[1]();
    expect(schemaPosts.callCount).to.equal(2);
    await service.index('queued-after-ready', record());
    expect(sailsMock.services.agendaqueueservice.now.calledOnce).to.equal(true);
  });
  it('initializes an inline worker safely before init or ready', async function () {
    expect(await service.index('early-record', record('secondary'))).to.equal(true);
    expect(schemaPosts.callCount).to.equal(2);
    expect(writes.firstCall.args[1][0]).to.include({ id: 'early-record', title: 'Cold bootstrap' });
  });
  it('rejects schema setup failure, reports inline failure and permits retry', async function () {
    const failure = new Error('schema POST denied');
    schemaPosts.rejects(failure);
    expect(
      await Promise.resolve(service.init()).then(
        () => undefined,
        err => err
      )
    ).to.equal(failure);
    expect(await service.index('unindexed', record())).to.equal(false);
    expect(writes.called).to.equal(false);
    schemaPosts.callsFake(applySchema);
    expect(await service.index('retry', record())).to.equal(true);
  });
  it('rejects exhausted core checks without writing or sleeping after the last attempt', async function () {
    gets.rejects(new Error('Solr offline'));
    const sleep = sinon.stub(service as any, 'sleep').resolves();
    const error = await Promise.resolve(service.init()).then(
      () => undefined,
      err => err
    );
    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.include('redbox');
    expect(gets.callCount).to.equal(2);
    expect(sleep.callCount).to.equal(1);
    expect(writes.called).to.equal(false);
    expect(schemaPosts.called).to.equal(false);
  });
  it('reports failed inline writes and rejects queued worker failures', async function () {
    await service.init();
    const failure = new Error('Solr write rejected');
    writes.rejects(failure);
    expect(await service.index('failed', record())).to.equal(false);
    expect(
      await service.solrAddOrUpdate({ attrs: { data: record() } } as any).then(
        () => undefined,
        err => err
      )
    ).to.equal(failure);
  });
  it('rejects unconfigured cores instead of dropping records', async function () {
    expect(await service.index('unknown-core', record('missing'))).to.equal(false);
    const error = await service.solrAddOrUpdate({ attrs: { data: record('missing') } } as any).then(
      () => undefined,
      err => err
    );
    expect(error.message).to.equal('Unknown SOLR core: missing');
    expect(writes.called).to.equal(false);
  });
  it('does not acknowledge failed commits', async function () {
    await service.init();
    writes.onSecondCall().rejects(new Error('commit rejected'));
    expect(await service.index('commit-failed', record())).to.equal(false);
  });
  it('awaits schema for deletes and propagates delete failures', async function () {
    await service.solrDelete({ attrs: { data: { id: 'old-record', searchCore: 'secondary' } } } as any);
    expect(schemaPosts.callCount).to.equal(2);
    expect(writes.firstCall.args[1]).to.deep.equal({ delete: { query: 'id:"old-record"' } });
    const failure = new Error('delete rejected');
    writes.rejects(failure);
    expect(
      await service.solrDelete({ attrs: { data: { id: 'old-record' } } } as any).then(
        () => undefined,
        err => err
      )
    ).to.equal(failure);
  });
  for (const phase of ['status', 'schema-read', 'schema-write']) {
    it(`bounds a never-answering ${phase} setup request over real loopback HTTP`, async function () {
      gets.restore();
      schemaPosts.restore();
      const requests: string[] = [];
      const server = createServer((req, res) => {
        requests.push(`${req.method} ${req.url}`);
        const stalled = phase === 'status' ||
          (phase === 'schema-read' && req.url?.includes('/schema?')) ||
          (phase === 'schema-write' && req.method === 'POST');
        if (stalled) return;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(req.url?.includes('action=STATUS')
          ? { status: { redbox: { instanceDir: '/redbox' } } }
          : { schema: {
            fields: [], fieldTypes: [{ name: 'string', class: 'solr.StrField' }],
            dynamicFields: [], copyFields: [],
          } }));
      });
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Expected TCP listener');
        sailsMock.config.solr.cores = { default: sailsMock.config.solr.cores.default };
        Object.assign(sailsMock.config.solr.cores.default.options, { host: '127.0.0.1', port: address.port });
        sailsMock.config.solr.waitTime = 50;
        sailsMock.config.solr.maxWaitTries = 1;
        const notBounded = Symbol('setup did not settle');
        const result = await Promise.race([
          service.init().then(() => undefined, err => err),
          new Promise(resolve => { deadline = setTimeout(() => resolve(notBounded), 1000); }),
        ]);
        expect(result).not.to.equal(notBounded);
        expect(result).to.be.instanceOf(Error);
        expect(requests).to.have.length(phase === 'status' ? 1 : phase === 'schema-read' ? 2 : 3);
        expect(writes.called).to.equal(false);
      } finally {
        clearTimeout(deadline);
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
      }
    });
  }

  it('does not require Solr at startup when another search service is configured', async function () {
    sailsMock.config.search = { serviceName: 'customsearchservice' };
    gets.rejects(new Error('unused Solr offline'));
    await service.init();
    expect(gets.called).to.equal(false);
    expect(schemaPosts.called).to.equal(false);
    // Explicit use of this service still runs the readiness gate.
    sinon.stub(service as any, 'sleep').resolves();
    expect(await service.index('explicit-solr-use', record())).to.equal(false);
    expect(gets.called).to.equal(true);
  });

  for (const retries of [0, -1, NaN]) {
    it(`checks Solr at least once for retry setting ${retries}`, async function () {
      sailsMock.config.solr.maxWaitTries = retries;
      await service.init();
      expect(gets.args.filter(args => args[0].includes('action=STATUS'))).to.have.length(2);
    });
  }

  it('fails bounded checks when status does not include the configured core', async function () {
    gets.resolves({ data: { status: {} } });
    const sleep = sinon.stub(service as any, 'sleep').resolves();
    const error = await service.init().then(() => undefined, err => err);
    expect(error.message).to.contain('unavailable after 2 attempts');
    expect(gets.callCount).to.equal(2);
    expect(sleep.calledOnce).to.equal(true);
    expect(schemaPosts.called).to.equal(false);
  });

  it('shares a failed setup across concurrent callers and permits a fresh retry', async function () {
    const failure = new Error('shared schema failure');
    let reject!: (error: Error) => void;
    schemaPosts.onFirstCall().returns(new Promise((_resolve, fail) => { reject = fail; }));
    const initialized = service.init().then(() => undefined, err => err);
    const first = service.index('first', record());
    const second = service.index('second', record('secondary'));
    await tick();
    expect(schemaPosts.calledOnce).to.equal(true);
    reject(failure);
    expect(await initialized).to.equal(failure);
    expect(await first).to.equal(false);
    expect(await second).to.equal(false);
    expect(writes.called).to.equal(false);
    expect(await service.index('retry', record())).to.equal(true);
  });

  it('lets Agenda await successful deletes using its actual job dispatch', async function () {
    const { Job } = await import('agenda');
    const job = new Job({ definitions: { delete: { fn: service.solrDelete.bind(service) } } } as any,
      { name: 'delete', data: { id: 'old-record' } } as any);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const notCompleted = Symbol('callback dispatch never completed');
    try {
      const result = await Promise.race([
        (job as any).runJob().then(() => 'completed'),
        new Promise(resolve => { deadline = setTimeout(() => resolve(notCompleted), 1000); }),
      ]);
      expect(result).to.equal('completed');
      expect(writes.firstCall.args[1]).to.deep.equal({ delete: { query: 'id:"old-record"' } });
    } finally {
      clearTimeout(deadline);
    }
  });

  it('rejects unknown delete cores without issuing a delete', async function () {
    const error = await service.solrDelete({ attrs: { data: { id: 'old-record', searchCore: 'missing' } } } as any)
      .then(() => undefined, err => err);
    expect(error.message).to.equal('Unknown SOLR core: missing');
    expect(writes.called).to.equal(false);
  });

});
