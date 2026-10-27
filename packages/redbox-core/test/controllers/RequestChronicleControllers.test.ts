import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { of, throwError } from 'rxjs';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { httpRequestChronicle } from '../../src/http/express/middleware';
import { mountMetadataReadRoutes } from '../../src/http/express/metadata';
import { mountConfigurationWriteRoutes } from '../../src/http/express/configurationWrites';
import { mountAuthenticationRoutes } from '../../src/http/express/login';
import { mountVocabularyIntegrationRoutes } from '../../src/http/express/vocabularyIntegrations';
import { mountIdentityAdministrationRoutes } from '../../src/http/express/identityAdministration';
import { mountQueryReadRoutes } from '../../src/http/express/queryReads';
import { mountIntegrationOperationRoutes } from '../../src/http/express/integrationOperations';
import { mountBrandingOperationRoutes } from '../../src/http/express/brandingOperations';
import { I18nEntries } from '../../src/translations/I18nEntries';
import { RequestChronicleHelper, toChronicleError } from '../../src/utilities/RequestChronicle';
import { runWithRequestChronicle } from '../../src/utilities/RequestChronicleContext';
import { createSinonStubLogger } from '../logger.test';

/** Real dispatch, request observation and safe response contracts; no virtual HTTP/controller facade. */
describe('Owned HTTP request chronicle integration', function () {
  let f: Awaited<ReturnType<typeof httpRouteFixture>>;
  let captured: RequestChronicleHelper[];
  let translations: Record<string, any>;
  let users: Record<string, any>;
  let reports: Record<string, any>;
  let rva: Record<string, any>;
  let branding: Record<string, any>;
  let email: Record<string, any>;
  let sessionFailure: Error | undefined;
  let authError: Error | undefined;
  let observe: boolean;
  let sessionSave: sinon.SinonStub;
  let audit: sinon.SinonStub;
  let identitySession: sinon.SinonStub;
  const actor = {
    id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    username: 'user1',
    roles: [{ id: 'admin-role', brandId: 'brand-1', name: 'Admin' }],
  };
  const flush = () => new Promise<void>(resolve => setImmediate(resolve));
  const text = (value: unknown) => JSON.stringify(value);
  const data = () => captured.at(-1)!.data;
  const privateValues = [
    'private-password',
    'private-token',
    'Private translation content',
    'Private description',
    'Private report data',
    'Private subject',
    'private body',
    'secret-preview',
  ];
  function assertSafe() {
    for (const value of privateValues) {
      assert(!text(captured.map(c => c.data)).includes(value), value + ' in request chronicle');
      for (const level of ['info', 'debug', 'warn', 'error'] as const)
        assert(!text(f.log[level].args).includes(value), value + ' in log');
    }
  }
  beforeEach(async function () {
    captured = [];
    observe = true;
    authError = sessionFailure = undefined;
    sessionSave = sinon.stub().callsFake(done => done());
    audit = sinon.stub().resolves();
    identitySession = sinon.stub().resolves(actor);
    translations = Object.fromEntries(
      [
        'getNamespace',
        'listLanguages',
        'listEntries',
        'getBundle',
        'setEntry',
        'setBundle',
        'deleteEntry',
        'updateBundleEnabled',
      ].map(n => [n, sinon.stub().resolves({})])
    );
    users = {
      requireUserInBrand: sinon.stub().resolves({ ...actor, roles: [] }),
      updateUserDetails: sinon.stub().returns(of([{ ...actor }])),
      setUserKey: sinon.stub().returns(of({})),
      addUserAuditEvent: sinon.stub().resolves(),
    };
    reports = { getResults: sinon.stub().resolves(undefined), getCSVResult: sinon.stub().resolves('csv') };
    rva = {
      importRvaVocabulary: sinon.stub().resolves({ id: 'vocab-1' }),
      syncRvaVocabulary: sinon.stub().resolves({ id: 'vocab-1' }),
    };
    branding = { preview: sinon.stub().resolves({ token: 'secret-preview', url: '/preview/secret-preview.css' }) };
    email = {
      evaluateProperties: sinon.stub().returns({
        formatRendered: 'html',
        toRendered: 'person@example.com',
        subjectRendered: 'Private subject',
        templateRendered: of({ status: 200, body: '<p>private body</p>' }),
      }),
      sendMessage: sinon.stub().returns(of({ success: false, msg: 'Email unable to be submitted' })),
    };
    f = await httpRouteFixture((router, input) => {
      router.use((req, res, next) => {
        const run = () => {
          const chronicle = RequestChronicleHelper.existing(req);
          if (chronicle) captured.push(chronicle);
          req.session = {
            branding: 'default',
            portal: 'portal',
            save: sessionSave,
            destroy: (done: any) => done(),
          } as any;
          req.user = actor;
          req.logIn = ((_user: any, done: any) => done(sessionFailure)) as any;
          req.logout = ((done: any) => done()) as any;
          next();
        };
        if (observe) httpRequestChronicle(input.log)(req, res, run);
        else run();
      });
      mountMetadataReadRoutes(router, { ...input, translations } as any);
      mountConfigurationWriteRoutes(router, {
        ...input,
        translations,
        reloadTranslations: sinon.stub().resolves(),
      } as any);
      mountVocabularyIntegrationRoutes(router, {
        ...input,
        rva,
        vocabulary: { getById: sinon.stub().resolves({ branding: 'brand-1' }) },
        audit,
      } as any);
      mountIdentityAdministrationRoutes(router, {
        ...input,
        users,
        roles: { getRolesWithBrand: sinon.stub().returns(of([])) },
      } as any);
      mountQueryReadRoutes(router, { ...input, reports } as any);
      mountIntegrationOperationRoutes(router, { ...input, email, audit } as any);
      mountBrandingOperationRoutes(router, { ...input, branding, audit } as any);
      mountAuthenticationRoutes(router, {
        passport: {
          authenticate: (_name: any, callback: any) => (_req: any, _res: any, _next: any) =>
            callback(authError, { id: actor.id }, { token: 'private-token' }),
        } as any,
        identity: {
          session: identitySession,
          profile: sinon.stub().resolves({ id: actor.id, username: actor.username }),
        } as any,
        defaultBrand: 'default',
        defaultPortal: 'portal',
        validContext: () => true,
        brandId: () => 'brand-1',
        postLoginPath: () => '/default/portal/home',
        postLogoutPath: '/logout-success',
        audit,
        loginFailure: sinon.stub().resolves(),
        csrf: (_req, _res, next) => next(),
      });
    });
    f.authenticate.resolves(actor);
  });
  afterEach(async function () {
    try {
      assertSafe();
    } finally {
      await f?.close();
      sinon.restore();
    }
  });
  const methods = {
    getNamespace: { service: 'getNamespace', url: '/locales/en/translation.json' },
    getLanguages: { service: 'listLanguages', url: '/locales' },
    listEntriesApp: { service: 'listEntries', url: '/app/i18n/entries?locale=en&namespace=translation' },
    getBundleApp: { service: 'getBundle', url: '/app/i18n/bundles/en/translation' },
    setEntryApp: {
      service: 'setEntry',
      url: '/app/i18n/entries/en/translation/title',
      body: { value: 'Private translation content', description: 'Private description' },
    },
    setBundleApp: {
      service: 'setBundle',
      url: '/app/i18n/bundles/en/translation',
      body: { data: { title: 'Private translation content' }, displayName: 'English' },
    },
  } as const;
  for (const [method, definition] of Object.entries(methods)) {
    const body = 'body' in definition ? definition.body : undefined;
    const request = (brand = 'default') =>
      f.request('/' + brand + '/portal' + definition.url, { method: body ? 'POST' : 'GET', body });
    it(`refuses an unknown brand before ${method} delegation`, async function () {
      f.getBrand.resolves(null);
      const response = await request('unknown');
      assert.equal(response.status, 404);
      assert.equal(translations[definition.service].called, false);
      assert.equal(data().res?.statusCode, 404);
    });
    it(`captures a ${method} service failure once without response or log payload leakage`, async function () {
      translations[definition.service].rejects(new Error('private-token database unavailable'));
      const response = await request();
      assert.equal(response.status, 500);
      assert(!response.text.includes('private-token'));
      assert.equal(data().errors?.length, 1);
      assert.equal(captured.length, 1);
      assert.equal(data().res?.statusCode, 500);
    });
  }
  it('serves namespace JSON without metadata and captures only identifiers', async function () {
    translations.getNamespace.callsFake((...args: any[]) =>
      I18nEntries.prototype.getNamespace.apply({ getBundle: translations.getBundle } as any, args as any)
    );
    translations.getBundle.resolves({ data: { _meta: { revision: 3 }, title: 'Private translation content' } });
    const response = await f.request('/default/portal/locales/en/translation.json');
    assert.deepEqual(response.body, { title: 'Private translation content' });
    assert.equal(data().translationRemoveMetaSuccess, true);
    assert.equal(data().translationLng, 'en');
  });
  for (const method of ['setEntryApp', 'setBundleApp'] as const) {
    it(`preserves a successful ${method} write when its owned resource reload fails`, async function () {
      const entry = {
        id: 'entry-1',
        branding: 'brand-1',
        locale: 'en',
        namespace: 'translation',
        key: 'title',
        value: 'Private translation content',
      };
      const bundle = {
        id: 'bundle-1',
        branding: 'brand-1',
        locale: 'en',
        namespace: 'translation',
        displayName: 'English',
        data: { title: 'Private translation content' },
      };
      const reload = sinon.stub().rejects(new Error('private-token reload failed'));
      const real = new I18nEntries({
        repository: {
          translations: {
            findByUid: sinon.stub().resolves(entry),
            reviseEntry: sinon.stub().resolves(entry),
            listForLocale: sinon.stub().resolves([entry]),
          },
          bundles: { findByUid: sinon.stub().resolves(bundle), reviseBundle: sinon.stub().resolves(bundle) },
        } as any,
        reloadResources: reload,
        log: f.log,
        localesDirectory: '/unused',
        getBrand: () => null,
        getBrandById: () => null,
      });
      sinon.stub(real as any, 'loadCentralizedMeta').resolves({});
      if (method === 'setBundleApp') sinon.stub(real, 'syncEntriesFromBundle').resolves(0);
      translations[methods[method].service].callsFake((...args: any[]) =>
        (real[methods[method].service] as any)(...args)
      );
      const response = await f.request('/default/portal' + methods[method].url, {
        method: 'POST',
        body: methods[method].body,
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.id, method === 'setEntryApp' ? 'entry-1' : 'bundle-1');
      assert.equal(reload.called, true);
      assert.equal(data().translationReloadFailed, true);
      assert.equal(data().errors?.length, 1);
    });
  }
  it('returns a safe failed local login without password or provider claims in observation', async function () {
    identitySession.resolves(false);
    const response = await f.request('/user/login_local', {
      method: 'POST',
      body: { username: 'user1', password: 'private-password' },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { message: 'Incorrect username/password', user: false });
    assert.equal(data().userLoginSuccess, false);
    assert.equal(data().userLoginType, 'local');
  });
  for (const [method, path, verb, body] of [
    ['localLogin', '/user/login_local', 'POST', { username: 'user1', password: 'private-password' }],
    ['openidConnectLogin', '/user/login_oidc', 'GET', undefined],
    ['aafLogin', '/user/login_aaf', 'POST', { assertion: 'private-token' }],
  ] as const) {
    it(`does not redirect or audit after a ${method} session callback failure`, async function () {
      sessionFailure = new Error('private-token session store unavailable');
      const response = await f.request(path, { method: verb, body });
      assert.equal(response.status, 500);
      assert.equal(response.headers.get('Location'), null);
      assert.equal(audit.called, false);
      assert.equal(data().userLoginSuccess, false);
      assert.equal(data().errors?.length, 1);
      assert(!response.text.includes('private-token'));
    });
  }
  it('returns a safe vocabulary failure even with a cyclic service cause', async function () {
    const error = new Error('Cyclic service failure');
    error.cause = error;
    rva.importRvaVocabulary.rejects(error);
    const response = await f.request('/default/portal/admin/vocabulary/import', {
      method: 'POST',
      body: { rvaId: 'rva-1' },
    });
    assert.equal(response.status, 400);
    assert.equal(data().errors?.length, 1);
    assert.deepEqual(toChronicleError(error).details, [{ message: '[Circular]' }]);
  });
  for (const method of ['import', 'sync'] as const) {
    it(`keeps vocabulary ${method} failure 400 while sanitizing backend details`, async function () {
      rva[method === 'import' ? 'importRvaVocabulary' : 'syncRvaVocabulary'].rejects(
        new Error('private-token RVA version')
      );
      const response = await f.request(
        '/default/portal/admin/vocabulary/' + (method === 'import' ? 'import' : 'vocab-1/sync'),
        { method: 'POST', body: { rvaId: 'rva-1' } }
      );
      assert.equal(response.status, 400);
      assert(!response.text.includes('private-token'));
      assert.equal(data().errors?.length, 1);
    });
  }
  it('returns a truthful sanitized failure when a profile update fails', async function () {
    users.updateUserDetails.returns(throwError(() => new Error('private-token email in use')));
    const response = await f.request('/default/portal/user/update', {
      method: 'POST',
      body: { details: { name: 'New Name', email: 'a@example.com' } },
    });
    assert.equal(response.status, 500);
    assert.equal(data().userDetailsUpdateSuccess, false);
    assert.equal(users.updateUserDetails.calledOnce, true);
    assert.equal(data().errors?.length, 1);
  });
  it('returns a truthful sanitized failure when generating a user key fails', async function () {
    users.setUserKey.returns(throwError(() => new Error('private-token key failed')));
    const response = await f.request('/default/portal/user/genKey', { method: 'POST', body: {} });
    assert.equal(response.status, 500);
    assert.equal(data().errors?.length, 1);
    assert(!response.text.includes('private-token'));
    assert.equal(users.setUserKey.calledOnce, true);
  });
  it('retains the 200 status:false report result failure with safe paging observation', async function () {
    reports.getResults.rejects(new Error('private-token report query failed'));
    const response = await f.request('/default/portal/admin/getReportResults?name=report-1&start=0&rows=5');
    assert.equal(response.status, 200);
    assert.equal(response.body.status, false);
    assert.equal(data().reportName, 'report-1');
    assert.equal(data().reportPagingStart, 0);
    assert.equal(data().reportPagingRows, 5);
    assert.equal(data().errors?.length, 1);
  });
  it('retains CSV failure without capturing exported data', async function () {
    reports.getCSVResult.rejects(new Error('private-token CSV failure'));
    const response = await f.request('/default/portal/admin/downloadReportCSV?name=report-1');
    assert.equal(response.status, 200);
    assert.equal(response.body.status, false);
    assert.equal(data().reportName, 'report-1');
    assert.equal(data().errors?.length, 1);
  });
  it('returns full report data but observes only paging and record counts', async function () {
    const result = { total: 17, pageNum: 2, recordsPerPage: 5, records: [{ value: 'Private report data' }] };
    reports.getResults.resolves(result);
    const response = await f.request('/default/portal/admin/getReportResults?name=report-1&start=5&rows=5');
    assert.deepEqual(response.body, { ...result, success: true });
    assert.deepEqual(data().reportResultPage, {
      total: 17,
      pageNum: 2,
      recordPerPage: 5,
      recordCount: 1,
      success: true,
    });
  });
  it('retains an empty report result with finite defaults and rejects malformed paging', async function () {
    const response = await f.request('/default/portal/admin/getReportResults?name=report-1');
    assert.deepEqual(response.body, { status: false, message: null });
    assert.equal(data().reportPagingStart, 0);
    assert.equal(data().reportPagingRows, 10);
    assert.equal((await f.request('/default/portal/admin/getReportResults?name=report-1&start=invalid')).status, 400);
    assert.equal(reports.getResults.callCount, 1);
  });
  it('does not create a request chronicle when observation is absent', async function () {
    observe = false;
    const response = await f.request('/default/portal/user/update', {
      method: 'POST',
      body: { details: { name: 'New Name', email: 'a@example.com' } },
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.status, true);
    assert.equal(captured.length, 0);
    assert.equal(f.log.warn.called, false);
    assert.equal(f.log.error.called, false);
  });
  it('logs one safe failure when observation is absent', async function () {
    observe = false;
    users.updateUserDetails.returns(throwError(() => new Error('private-token email in use')));
    assert.equal(
      (
        await f.request('/default/portal/user/update', {
          method: 'POST',
          body: { details: { name: 'New Name', email: 'a@example.com' } },
        })
      ).status,
      500
    );
    assert.equal(captured.length, 0);
    assert.equal(f.log.error.callCount, 1);
    assert.equal(f.log.warn.called, false);
  });
  it('correlates a failed owned audit and refuses a misleading logout redirect', async function () {
    audit.rejects(new Error('private-token audit unavailable'));
    const response = await f.request('/default/portal/user/logout', { method: 'POST', body: {} });
    assert.equal(response.status, 500);
    assert.equal(response.headers.get('Location'), null);
    assert.equal(data().errors?.length, 1);
    assert.equal(captured.length, 1);
  });
  it('keeps successful completed audits free of warnings', async function () {
    // fetch follows redirects, so use the transport directly to observe the owned redirect.
    const response = await fetch(f.url + '/default/portal/user/logout', { method: 'POST', redirect: 'manual' });
    await response.text();
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Location'), '/logout-success');
    assert.equal(audit.calledOnce, true);
    assert.equal(f.log.warn.called, false);
    assert.equal(f.log.error.called, false);
  });
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
  it('captures safe email failure metadata while excluding body and subject', async function () {
    const response = await f.request('/default/portal/api/sendNotification', {
      method: 'POST',
      body: { to: 'person@example.com', template: 'tmpl', format: 'html' },
    });
    assert.equal(response.status, 500);
    assert.equal(data().emailProcessStepFailed, 'send');
    assert.equal(data().errors?.length, 1);
  });
  it('does not observe branding preview tokens or urls', async function () {
    const response = await f.request('/default/portal/app/branding/preview', {
      method: 'POST',
      body: { expectedDraftRevision: 2 },
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.previewToken, 'secret-preview');
    assert.equal(data().brandingAppPreviewCreated, true);
  });
});
