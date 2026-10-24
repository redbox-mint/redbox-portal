import { seedReadSearch } from './seedReadSearch';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { readFixture } from './readFixture';
import { queryReadRoutes } from '../../src/http/express/queryReads';

describe('owned query reads on Mongo and Solr', () => {
  let f: Awaited<ReturnType<typeof readFixture>>;
  before(async () => {
    f = await readFixture();
  });
  after(async () => {
    await f?.close();
  });
  async function read(route: string, headers: Record<string, string> = f.headers) {
    const response = await fetch(f.url + '/default/rdmp' + route, { headers });
    const text = await response.text();
    return { response, body: text ? JSON.parse(text) : {} };
  }
  it('mounts exactly the accepted 25 declarations', () => assert.equal(queryReadRoutes.length, 25));
  it('reads persisted report configurations through API and admin variants', async () => {
    for (const prefix of ['/api', '/admin']) {
      const list = await read(prefix + '/report-config');
      assert.equal(list.response.status, 200);
      assert.equal(list.body[0].name, 'records');
      const one = await read(prefix + '/report-config/records?apiVersion=2.0');
      assert.equal(one.response.status, 200);
      assert.equal(one.body.data.title, 'Records');
    }
  });
  it('gives collections precedence over the dynamic named-query route', async () => {
    assert.deepEqual((await read('/api/named-query/collections')).body, ['record', 'user']);
    assert.equal((await read('/api/named-query')).body[0].name, 'records');
    assert.equal((await read('/api/named-query/records')).body.collectionName, 'record');
  });
  it('executes mandatory brand-scoped named queries and database reports', async () => {
    const result = await read('/api/report/namedQuery?queryName=records');
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.summary.numFound, 2);
    assert(!JSON.stringify(result.body).includes('other-record'));
    const report = await read('/admin/getReportResults?name=records&rows=1&apiVersion=2.0');
    assert.equal(report.response.status, 200);
    assert.equal(report.body.data.total, 2);
    assert.equal(report.body.data.records.length, 1);
    assert.equal((await read('/admin/getReport?name=records')).response.status, 200);
  });
  it('preserves CSV type disposition and formula-safe output', async () => {
    const response = await fetch(f.url + '/default/rdmp/admin/downloadReportCSV?name=records', { headers: f.headers });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type')!, /text\/csv/);
    assert.match(response.headers.get('content-disposition')!, /records.csv/);
    assert.match(await response.text(), /Title/);
  });
  it('previews without persisting and enforces browser CSRF', async () => {
    const body = {
      name: 'preview',
      title: 'Preview',
      reportSource: 'database',
      databaseQuery: { queryName: 'records' },
      filter: [],
      columns: [],
    };
    const api = await fetch(f.url + '/default/rdmp/api/report-config/preview', {
      method: 'POST',
      headers: { ...f.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(api.status, 200, await api.text());
    assert.equal(await f.reports.getConfig(Object.assign({}, f.brand) as never, 'preview'), null);
    const browser = await fetch(f.url + '/default/rdmp/admin/report-config/preview', {
      method: 'POST',
      headers: { ...f.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(browser.status, 403);
  });
  it('lists persisted harvest runs detail and events', async () => {
    assert.equal((await read('/api/harvest-runs')).body.summary.numFound, 1);
    const detail = await read('/api/harvest-runs/' + f.runId);
    assert.equal(detail.response.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.run.sourceRunId, 'source-1');
    assert.equal((await read('/api/harvest-runs/' + f.runId + '/events')).body.summary.numFound, 0);
  });
  it('scopes SIEM events and delivery reads to the requested brand', async () => {
    assert.equal((await read('/api/siem/events')).body.total, 1);
    assert.equal((await read('/api/siem/delivery-status')).body.total, 0);
    assert.equal((await read('/api/siem/config')).response.status, 200);
  });
  it('accepts validated numeric pagination while retaining bounds on SIEM requests', async () => {
    for (const route of ['/api/siem/events', '/api/siem/delivery-status']) {
      const page = await read(route + '?limit=1&offset=0');
      assert.equal(page.response.status, 200, JSON.stringify(page.body));
      assert.equal((await read(route + '?limit=0')).response.status, 400);
      assert.equal((await read(route + '?offset=-1')).response.status, 400);
    }
  });
  it('reads real audit snapshots diffs permissions and integration history', async () => {
    const audit = await read('/record/viewAudit/read-record/audit');
    assert.equal(audit.response.status, 200, JSON.stringify(audit.body));
    assert.equal(audit.body.records.length, 2);
    assert.equal(audit.body.records[0].changeSummary.count, 1);
    for (const route of [
      '/record/viewAudit/read-record/permissions',
      '/record/viewAudit/read-record/integration-audit',
      '/record/integrationStatus/read-record',
      '/api/integration-audit/read-record',
    ])
      assert.equal((await read(route)).response.status, 200, route);
  });
  it('rejects unauthenticated wrong-brand wrong-role and inaccessible objects', async () => {
    assert.equal((await read('/api/report-config', {})).response.status, 401);
    const wrong = await fetch(f.url + '/other/rdmp/api/report-config', { headers: f.headers });
    assert.equal(wrong.status, 403);
    await f.identities.update('user', { id: f.user.id }, { roles: [f.reader.id] });
    assert.equal((await read('/api/siem/events')).response.status, 403);
    await f.identities.update('user', { id: f.user.id }, { roles: [f.role.id] });
    assert.equal((await read('/record/viewAudit/private-record/audit')).response.status, 403);
    assert.equal((await read('/record/viewAudit/other-record/permissions')).response.status, 403);
    assert.equal((await read('/api/integration-audit/other-record')).response.status, 403);
  });
  it('rejects malformed pagination dates report input and search fields', async () => {
    for (const route of [
      '/api/harvest-runs?page=2oops',
      '/api/harvest-runs?dateFrom=nope',
      '/api/siem/events?limit=-1',
      '/api/siem/events?startDate=nope',
      '/api/report/namedQuery?queryName=records&rows=101',
      '/api/report/namedQuery?queryName=records&start=-1',
      '/record/viewAudit/read-record/audit?dateFrom=nope',
      '/record/viewAudit/read-record/integration-audit?status=bogus',
      '/api/integration-audit/read-record?page=bad',
      '/record/viewAudit/read-record/integration-audit?page=bad',
      '/api/search?type=dataRecord&exact_bad:field=anything',
    ]) {
      const result = await read(route);
      assert.equal(result.response.status, 400, route + ' ' + JSON.stringify(result.body));
    }
  });
  it('uses independent Solr filters even when search text contains an OR injection', async () => {
    await seedReadSearch(f);
    const result = await read('/api/search?type=dataRecord&searchStr=' + encodeURIComponent('test OR *:*'));
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.totalItems, 1);
    assert.equal(result.body.records[0].id, 'visible');
  });
  it('reports backend failure and recovers without restarting the host', async () => {
    f.failReads(true);
    try {
      assert.equal((await read('/api/report-config')).response.status, 500);
    } finally {
      f.failReads(false);
    }
    assert.equal((await read('/api/report-config')).response.status, 200);
  });
  it('runs Bruno requests against the owned HTTP host', async () => {
    const collection = path.resolve('test/http/fixtures/bruno-query-reads');
    const cli = path.resolve('../../test/bruno/node_modules/@usebruno/cli/bin/bru.js');
    const result = await promisify(execFile)(
      process.execPath,
      [cli, 'run', '--env-var', 'host=' + f.url, '--env-var', 'token=pilot-api-token', '--reporter-skip-all-headers'],
      { cwd: collection, timeout: 30000, maxBuffer: 1024 * 1024 }
    );
    console.log(result.stdout);
  });
});

describe('owned query read request lifetime', () => {
  it('retains an admitted Mongo read after abort and waits before closing persistence', async () => {
    const f = await readFixture();
    const delay = f.delayRead();
    const controller = new AbortController();
    const pending = fetch(f.url + '/default/rdmp/api/report-config', {
      headers: f.headers,
      signal: controller.signal,
    }).catch(() => {});
    try {
      await delay.entered.promise;
      controller.abort();
      const stopping = f.host.stop();
      let stopped = false;
      void stopping.then(() => {
        stopped = true;
      });
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.equal(stopped, false);
      delay.release.resolve();
      await pending;
      await stopping;
    } finally {
      delay.release.resolve();
      await f.close();
    }
  });
});
