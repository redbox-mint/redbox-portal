import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { of, Subject } from 'rxjs';
import * as sinon from 'sinon';
import { Controllers as Browser } from '../../src/controllers/RecordController';
import { Controllers as Api } from '../../src/controllers/webservice/RecordController';
import { routes } from '../../src/config/routes.config';
import { policies, type ControllerPolicies } from '../../src/config/policies.config';
import { validateApiContractRequest } from '../../src/policies/validateApiContractRequest';
import { isAuthenticated } from '../../src/policies/isAuthenticated';
import { checkAuth } from '../../src/policies/checkAuth';
import { isWebServiceAuthenticated } from '../../src/policies/isWebServiceAuthenticated';
import { createMockSails } from '../services/testHelper';
import { Services as RecordServices } from '../../src/services/RecordsService';
import { RELATED_RESOLUTION_LIMITS } from '../../src/related-records/resolver';

const { Sails } = require('sails');
const csurf = require('@sailshq/csurf');

describe('related metadata HTTP routes', () => {
  const names = [
    'sails',
    'BrandingService',
    'RecordTypesService',
    'WorkflowStepsService',
    'FormsService',
    'TranslationService',
    'RolesService',
    'PathRulesService',
  ];
  let originals: unknown[];
  let server: Server;
  let base: string;
  let authenticated: boolean;
  let records: any;
  let root: any;
  const relation = {
    id: 'activity',
    recordType: 'activity',
    localField: 'metadata.activity',
    foreignField: 'redboxOid',
    resolution: { metadataFields: ['/title'] },
  };
  let session: Record<string, unknown>;
  let token: string;
  beforeEach(async () => {
    originals = names.map(name => Reflect.get(globalThis, name));
    authenticated = true;
    session = { branding: 'default' };
    root = {
      redboxOid: 'root',
      metadata: { activity: 'old' },
      metaMetadata: { type: 'plan', brandId: 'brand', form: 'plan-form', secret: true },
      authorization: { secret: true },
    };
    records = {
      getMeta: sinon.stub().resolves(root),
      hasViewAccess: sinon.stub().returns(true),
      hasCreateAccess: sinon.stub().resolves(true),
      resolveRelatedMetadata: sinon
        .stub()
        .resolves({ activity: { status: 'resolved', records: [], issues: [], internal: true } }),
    };
    Reflect.set(
      globalThis,
      'sails',
      createMockSails({
        config: {
          apiRoutesHooks: [],
          passport: { authenticate: (_strategy: string, callback: any) => () => callback(null, false) },
        },
      })
    );
    Reflect.set(globalThis, 'BrandingService', { getBrand: () => ({ id: 'brand', name: 'default' }) });
    Reflect.set(globalThis, 'RecordTypesService', { get: () => of({ name: 'plan', relatedTo: [relation] }) });
    Reflect.set(globalThis, 'WorkflowStepsService', { getFirst: () => of({ name: 'draft' }) });
    Reflect.set(globalThis, 'FormsService', { getFormByStartingWorkflowStep: () => of({ name: 'plan-form' }) });
    Reflect.set(globalThis, 'TranslationService', { t: (value: string) => value });
    Reflect.set(globalThis, 'RolesService', { getDefUnathenticatedRole: () => ({ name: 'Guest' }) });
    Reflect.set(globalThis, 'PathRulesService', { getRulesFromPath: () => [{}], canRead: () => authenticated });
    const router = new Sails();
    for (const [kind, Controller, action, address] of [
      ['browser', Browser.Record, 'resolveRelatedMetadata', 'post /:branding/:portal/record/relatedMetadata/resolve'],
      ['api', Api.Record, 'getResolved', 'get /:branding/:portal/api/records/resolved/:oid'],
    ] as const) {
      const controller = new Controller();
      Object.assign(controller, { recordsService: records, RecordsService: records });
      const identity = `${kind === 'api' ? 'webservice/' : ''}record/${action.toLowerCase()}`;
      router._actions[identity] = controller[action as keyof typeof controller].bind(controller);
      const chain = (
        policies[kind === 'api' ? 'webservice/RecordController' : 'RecordController'] as ControllerPolicies
      )[action] as string[];
      assert.ok(chain.includes('validateApiContractRequest'));
      router._actionMiddleware[identity] = chain.map(name =>
        name === 'validateApiContractRequest'
          ? validateApiContractRequest
          : name === 'isAuthenticated'
            ? isAuthenticated
            : name === 'checkAuth'
              ? checkAuth
              : name === 'isWebServiceAuthenticated'
                ? isWebServiceAuthenticated
                : (_req: unknown, _res: unknown, next: () => void) => next()
      );
      router.router.bind(address, routes[address]);
    }
    assert.equal((routes['post /:branding/:portal/record/relatedMetadata/resolve'] as { csrf: boolean }).csrf, true);
    const app = express();
    app.disable('etag'); // Sails' HTTP fixture does not need Express-generated representation tags.
    app.use(express.json({ limit: '128kb' }));
    app.use((req, res, next) => {
      Object.assign(req, {
        session,
        user: authenticated ? { username: 'reader', roles: [] } : undefined,
        isAuthenticated: () => authenticated,
        param: (name: string) => req.params[name] ?? req.query[name],
      });
      next();
    });
    // Use the same CSRF middleware as Sails' security hook, backed by a fixture session.
    app.use(csurf());
    app.get('/csrf', (req: any, res) => res.json({ token: req.csrfToken() }));
    app.use(router.router._privateRouter);
    app.use((error: any, _req: unknown, res: express.Response, _next: unknown) =>
      res.status(error.code === 'EBADCSRFTOKEN' ? 403 : 400).json({ error: 'Invalid request' })
    );
    server = createServer(app);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${(server.address() as any).port}`;
    token = ((await (await fetch(base + '/csrf')).json()) as any).token;
  });
  afterEach(async () => {
    if (server?.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    names.forEach((name, index) => Reflect.set(globalThis, name, originals[index]));
  });
  const post = (body: unknown, csrf = true) =>
    fetch(base + '/default/rdmp/record/relatedMetadata/resolve', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-redbox-api-version': '2.0',
        ...(csrf ? { 'x-csrf-token': token } : {}),
      },
      body: JSON.stringify(body),
    });
  function useRealResolver() {
    const service = new RecordServices.Records();
    service.storageService = { getMeta: records.getMeta } as never;
    service.hasViewAccess = records.hasViewAccess;
    service.hasCreateAccess = records.hasCreateAccess;
    records.resolveRelatedMetadata.callsFake(service.resolveRelatedMetadata.bind(service));
    records.getMeta.withArgs('old').resolves({
      redboxOid: 'old', metadata: { title: 'Existing activity' },
      metaMetadata: { type: 'activity', brandId: 'brand', form: '' },
    });
    records.getMeta.withArgs('new').resolves({
      redboxOid: 'new', metadata: { title: 'Selected activity' },
      metaMetadata: { type: 'activity', brandId: 'brand', form: '' },
    });
  }
  for (const kind of ['browser', 'api'] as const) {
    const request = () => kind === 'browser'
      ? post({ oid: 'root', relations: ['activity'], references: { activity: 'new' } })
      : fetch(base + '/default/rdmp/api/records/resolved/root?relations=activity', {
        headers: { 'x-redbox-api-version': '2.0' },
      });
    it(`loads the authoritative ${kind} root once with the real resolver`, async () => {
      useRealResolver();
      const response = await request();
      assert.equal(response.status, 200, await response.clone().text());
      const result = ((await response.json()) as any).data.relatedMetadata.activity;
      assert.equal(result.records[0].metadata.title, kind === 'browser' ? 'Selected activity' : 'Existing activity');
      assert.equal(records.getMeta.getCalls().filter((call: sinon.SinonSpyCall) => call.args[0] === 'root').length, 1);
      assert.equal(root.metadata.activity, 'old');
    });
    it(`preserves per-record and per-reference issues in the ${kind} HTTP response with the real resolver`, async () => {
      useRealResolver();
      const references = ['new', 'missing', 'old'];
      root.metadata.activity = references;
      records.getMeta.withArgs('missing').resolves(null);
      Reflect.set(globalThis, 'RecordTypesService', { get: () => of({ name: 'plan', relatedTo: [{
        ...relation, resolution: { metadataFields: ['/title', '/endDate'] },
      }] }) });
      const response = kind === 'browser'
        ? await post({ oid: 'root', relations: ['activity'], references: { activity: references } })
        : await request();
      assert.equal(response.status, 200, await response.clone().text());
      const result = ((await response.json()) as any).data.relatedMetadata.activity;
      assert.equal(result.status, 'partial');
      assert.deepEqual(result.records.map((record: any) => record.redboxOid), ['new', 'old']);
      assert.deepEqual(result.issues, [
        { code: 'field-absent', recordIndex: 0, fieldPointer: '/endDate' },
        { code: 'field-absent', recordIndex: 1, fieldPointer: '/endDate' },
        { code: 'unavailable', referenceIndex: 1 },
      ]);
      assert.ok(!JSON.stringify(result).includes('missing'));
    });
    it(`includes the initial ${kind} root lookup in the HTTP deadline and stops late resolution`, async () => {
      useRealResolver();
      const clock = sinon.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
      let finish!: (value: unknown) => void;
      let entered!: () => void;
      const started = new Promise<void>(resolve => { entered = resolve; });
      records.getMeta.withArgs('root').onFirstCall().callsFake(() => {
        entered();
        return new Promise(resolve => { finish = resolve; });
      });
      try {
        const pending = request();
        await started;
        await clock.tickAsync(RELATED_RESOLUTION_LIMITS.deadlineMs);
        const response = await pending;
        assert.equal(response.status, 500, await response.clone().text());
        finish(root);
        await clock.tickAsync(1);
        sinon.assert.notCalled(records.resolveRelatedMetadata);
        assert.equal(records.getMeta.callCount, 1);
      } finally {
        clock.restore();
      }
    });
    it(`includes ${kind} relation configuration lookup in the HTTP deadline`, async () => {
      useRealResolver();
      const clock = sinon.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
      const configuration = new Subject<{ name: string; relatedTo: typeof relation[] }>();
      let entered!: () => void;
      const started = new Promise<void>(resolve => { entered = resolve; });
      const get = sinon.stub().callsFake(() => { entered(); return configuration; });
      Reflect.set(globalThis, 'RecordTypesService', { get });
      try {
        const pending = request();
        await started;
        await clock.tickAsync(RELATED_RESOLUTION_LIMITS.deadlineMs);
        const response = await pending;
        assert.equal(response.status, 500, await response.clone().text());
        configuration.next({ name: 'plan', relatedTo: [relation] });
        configuration.complete();
        await clock.tickAsync(1);
        sinon.assert.notCalled(records.resolveRelatedMetadata);
        assert.equal(records.getMeta.callCount, 1);
        assert.equal(get.callCount, 1);
      } finally {
        clock.restore();
      }
    });
    it(`shares the remaining ${kind} HTTP budget with source resolution`, async () => {
      useRealResolver();
      const clock = sinon.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
      let finishRoot!: (value: unknown) => void;
      let finishSource!: (value: unknown) => void;
      let rootEntered!: () => void;
      let sourceEntered!: () => void;
      const rootStarted = new Promise<void>(resolve => { rootEntered = resolve; });
      const sourceStarted = new Promise<void>(resolve => { sourceEntered = resolve; });
      records.getMeta.withArgs('root').onFirstCall().callsFake(() => {
        rootEntered();
        return new Promise(resolve => { finishRoot = resolve; });
      });
      records.getMeta.withArgs(kind === 'browser' ? 'new' : 'old').callsFake(() => {
        sourceEntered();
        return new Promise(resolve => { finishSource = resolve; });
      });
      try {
        const pending = request();
        await rootStarted;
        await clock.tickAsync(RELATED_RESOLUTION_LIMITS.deadlineMs - 1000);
        finishRoot(root);
        await sourceStarted;
        await clock.tickAsync(1000);
        const response = await pending;
        assert.equal(response.status, 500, await response.clone().text());
        finishSource({ redboxOid: 'late-source', metadata: { title: 'Late source' },
          metaMetadata: { type: 'activity', brandId: 'brand', form: '' } });
        await clock.tickAsync(1);
        assert.equal(records.getMeta.callCount, 2);
      } finally {
        clock.restore();
      }
    });
  }

  it('rechecks the authoritative loaded root ACL before following its unsaved selection', async () => {
    useRealResolver();
    records.hasViewAccess.onSecondCall().returns(false);
    const response = await post({ oid: 'root', relations: ['activity'], references: { activity: 'new' } });
    assert.equal(response.status, 500);
    assert.equal(records.getMeta.callCount, 1);
    assert.equal(records.hasViewAccess.callCount, 2);
  });
  it('rejects a server-loaded root for a different candidate OID without reading sources', async () => {
    useRealResolver();
    await assert.rejects(records.resolveRelatedMetadata({ ...root, redboxOid: 'different-root' }, {
      brand: { id: 'brand' }, user: { username: 'reader', roles: [] }, audience: 'api',
    }, { relations: [{ relationId: 'activity' }] }, { loadedRoot: root, startedAt: Date.now() }), /Record unavailable/);
    sinon.assert.notCalled(records.getMeta);
  });

  it('follows an existing root unsaved selection without mutating storage and strips internal output', async () => {
    const response = await post({ oid: 'root', relations: ['activity'], references: { activity: 'new' } });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(root.metadata.activity, 'old');
    assert.equal(records.resolveRelatedMetadata.firstCall.args[0].metadata.activity, 'new');
    assert.equal(((await response.json()) as any).data.relatedMetadata.activity.internal, undefined);
  });
  it('derives new root type, workflow and form and checks creation rights', async () => {
    const response = await post({ recordType: 'plan', relations: ['activity'], references: { activity: ['new'] } });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(records.resolveRelatedMetadata.firstCall.args[0].metaMetadata.form, 'plan-form');
    assert.equal(records.resolveRelatedMetadata.firstCall.args[0].workflow.stage, 'draft');
    assert.equal(records.hasCreateAccess.firstCall.args[4], 'draft');
    sinon.assert.notCalled(records.getMeta);
  });
  it('denies creation without following a source and reports configuration failures safely', async () => {
    records.hasCreateAccess.resolves(false);
    assert.equal((await post({ recordType: 'plan', relations: ['activity'], references: {} })).status, 403);
    sinon.assert.notCalled(records.resolveRelatedMetadata);
    records.hasCreateAccess.resolves(true);
    records.resolveRelatedMetadata.resolves({
      activity: { status: 'failed', records: [], issues: [{ code: 'configuration-error' }] },
    });
    const response = await post({ oid: 'root', relations: ['activity'] });
    assert.equal(response.status, 500);
    assert.ok(!(await response.text()).includes('configuration-error'));
  });
  it('returns optional source unavailability as a successful current result', async () => {
    records.resolveRelatedMetadata.resolves({
      activity: { status: 'unavailable', records: [], issues: [{ code: 'unavailable' }] },
    });
    const response = await post({ oid: 'root', relations: ['activity'] });
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as any).data.relatedMetadata.activity.status, 'unavailable');
  });
  it('rejects malformed JSON and malformed GET selections before source resolution', async () => {
    const malformed = await fetch(base + '/default/rdmp/record/relatedMetadata/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': token },
      body: '{',
    });
    assert.equal(malformed.status, 400);
    const response = await fetch(base + '/default/rdmp/api/records/resolved/root?relations=activity,activity');
    assert.equal(response.status, 400);
    sinon.assert.notCalled(records.resolveRelatedMetadata);
  });
  it('requires session authentication', async () => {
    authenticated = false;
    assert.equal((await post({ oid: 'root', relations: ['activity'] })).status, 403);
    sinon.assert.notCalled(records.resolveRelatedMetadata);
  });
  it('requires API authentication through existing auth policies', async () => {
    authenticated = false;
    const response = await fetch(base + '/default/rdmp/api/records/resolved/root?relations=activity', {
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(response.status, 403);
    sinon.assert.notCalled(records.resolveRelatedMetadata);
  });
  it('requires a valid CSRF token', async () => {
    assert.equal((await post({ oid: 'root', relations: ['activity'] }, false)).status, 403);
    sinon.assert.notCalled(records.getMeta);
  });
  it('rejects malformed and authority-widening bodies', async () => {
    for (const body of [
      null,
      {},
      { oid: 'root', recordType: 'plan', relations: ['activity'] },
      { oid: 'root', relations: ['unknown'] },
      { oid: 'root', relations: ['activity', 'activity'] },
      { oid: 'root', relations: ['activity'], fields: ['/secret'] },
      { oid: 'root', relations: ['activity'], references: { other: 'new' } },
      { oid: 'root', relations: ['activity'], references: { activity: { query: '*' } } },
      { oid: 'root', relations: ['activity'], references: { activity: 'a'.repeat(65536) } },
    ])
      assert.equal((await post(body)).status, 400, JSON.stringify(body)?.slice(0, 150));
    sinon.assert.notCalled(records.resolveRelatedMetadata);
  });
  it('maps root denial, cross-brand and operational failures safely', async () => {
    records.hasViewAccess.returns(false);
    assert.equal((await post({ oid: 'root', relations: ['activity'] })).status, 403);
    records.hasViewAccess.returns(true);
    root.metaMetadata.brandId = 'other';
    assert.equal((await post({ oid: 'root', relations: ['activity'] })).status, 404);
    root.metaMetadata.brandId = 'brand';
    records.resolveRelatedMetadata.rejects(new Error('secret source identity'));
    const response = await post({ oid: 'root', relations: ['activity'] });
    assert.equal(response.status, 500);
    assert.ok(!(await response.text()).includes('secret source identity'));
  });
  it('returns a minimal enriched API envelope without ETag or root-only 304', async () => {
    const response = await fetch(base + '/default/rdmp/api/records/resolved/root?relations=activity', {
      headers: { 'x-redbox-api-version': '2.0', 'if-none-match': '"old-root"' },
    });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('etag'), null);
    const data = ((await response.json()) as any).data;
    assert.deepEqual(Object.keys(data).sort(), ['metaMetadata', 'metadata', 'redboxOid', 'relatedMetadata']);
    assert.deepEqual(data.metaMetadata, { type: 'plan', brandId: 'brand' });
  });
});
