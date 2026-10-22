import { expect } from 'chai';
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';
import { Services } from '../../src/services/SolrSearchService';
const axios = require('axios');

describe('SolrSearchService bootstrap readiness', function () {
  let service: Services.SolrSearchService;
  let sailsMock: any;
  let writes: sinon.SinonStub;
  let schemaPosts: sinon.SinonStub;
  let gets: sinon.SinonStub;
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
    gets = sinon.stub(axios, 'get').callsFake(async (url: string) => ({
      data: url.includes('action=STATUS')
        ? { status: { redbox: { instanceDir: '/redbox' }, other: { instanceDir: '/other' } } }
        : { schema: { fields: [], dynamicFields: [], copyFields: [] } },
    }));
    schemaPosts = sinon.stub(axios, 'post').resolves({ data: {} });
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
    schemaPosts.onSecondCall().returns(
      new Promise(resolve => {
        release = () => resolve({ data: {} });
      })
    );
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
    release();
    await init;
    expect(await first).to.equal(true);
    expect(await second).to.equal(true);
    expect(writes.args.filter(args => Array.isArray(args[1])).map(args => args[1][0].id)).to.have.members([
      'bootstrap-one',
      'bootstrap-two',
    ]);
    expect(schemaPosts.callCount).to.equal(2);
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
    schemaPosts.resolves({ data: {} });
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
    await service.solrDelete({ attrs: { data: { id: 'old-record', searchCore: 'secondary' } } } as any, undefined);
    expect(schemaPosts.callCount).to.equal(2);
    expect(writes.firstCall.args[1]).to.deep.equal({ delete: { query: 'id:"old-record"' } });
    const failure = new Error('delete rejected');
    writes.rejects(failure);
    expect(
      await service.solrDelete({ attrs: { data: { id: 'old-record' } } } as any, undefined).then(
        () => undefined,
        err => err
      )
    ).to.equal(failure);
  });
});
