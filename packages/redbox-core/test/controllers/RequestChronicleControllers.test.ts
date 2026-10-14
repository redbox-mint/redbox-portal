let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import * as sinon from 'sinon';
import { of, throwError } from 'rxjs';
import { Controllers as UserControllers } from '../../src/controllers/UserController';
import { Controllers as VocabularyControllers } from '../../src/controllers/VocabularyController';
import { Controllers as ReportControllers } from '../../src/controllers/ReportController';
import { Controllers as EmailControllers } from '../../src/controllers/EmailController';
import { Controllers as BrandingAppControllers } from '../../src/controllers/BrandingAppController';
import { RequestChronicleHelper } from '../../src/utilities/RequestChronicle';
import { createSinonStubLogger } from '../logger.test';

type StubLogger = ReturnType<typeof createSinonStubLogger>;

/**
 * Regression tests for the controllers that record details in the request chronicle:
 * response contracts are unchanged, and captured details are safe and correlated.
 */
describe('Request chronicle controller integration', function () {
  const globalNames = [
    'sails',
    'BrandingService',
    'UsersService',
    'RvaImportService',
    'ReportsService',
    'TranslationService',
  ];
  let originals: Record<string, unknown>;
  let logger: StubLogger;

  beforeEach(function () {
    originals = Object.fromEntries(globalNames.map(name => [name, (global as any)[name]]));
    logger = createSinonStubLogger(sinon);
    (global as any).sails = {
      config: {
        auth: { loginPath: 'login', postLogoutRedir: '/logout-success' },
        http: { rootContext: '' },
        appUrl: 'http://localhost',
        log: {},
      },
      log: logger,
      services: {},
    };
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand-1' }),
      getBrandNameFromReq: sinon.stub().returns('default'),
      getBrandAndPortalPath: sinon.stub().returns('/default/rdmp'),
    };
    (global as any).sails.services.brandingservice = (global as any).BrandingService;
    (global as any).TranslationService = { t: (value: string) => value };
  });

  afterEach(function () {
    sinon.restore();
    for (const name of globalNames) {
      (global as any)[name] = originals[name];
    }
  });

  function createReq(values: Record<string, unknown> = {}, startChronicle = true) {
    const params = (values.params ?? {}) as Record<string, unknown>;
    const req = {
      method: 'POST',
      path: '/default/rdmp/test',
      hostname: 'localhost',
      headers: {},
      query: {},
      body: {},
      session: { branding: 'default' },
      param: (name: string) => params[name],
      isAuthenticated: () => true,
      user: { id: 'user-1', username: 'user1', type: 'local' },
      ...values,
    } as unknown as Sails.Req;
    if (startChronicle) {
      const rc = RequestChronicleHelper.fromReq(logger, req, { generateRequestId: () => 'request-1' });
      rc.start();
      rc.updateReq(req);
    }
    return req;
  }

  function createRes() {
    const res = {
      statusCode: 200,
      body: undefined as unknown,
      location: undefined as string | undefined,
      writableEnded: false,
      set() {
        return res;
      },
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      json(body: unknown) {
        res.body = body;
        return res;
      },
      send(body: unknown) {
        res.body = body;
        return res;
      },
      end() {
        return res;
      },
      redirect(url: string) {
        res.statusCode = 302;
        res.location = url;
        return res;
      },
    };
    return res;
  }

  const chronicle = (req: Sails.Req) => RequestChronicleHelper.existing(req)!.data;
  const flush = () => new Promise(resolve => setImmediate(resolve));

  describe('response contracts', function () {
    for (const method of ['import', 'sync'] as const) {
      it(`returns 400 with the failure detail when vocabulary ${method} fails`, async function () {
        (global as any).RvaImportService = {
          importRvaVocabulary: sinon.stub().rejects(new Error('Unknown RVA version')),
          syncRvaVocabulary: sinon.stub().rejects(new Error('Unknown RVA version')),
        };
        const controller = new VocabularyControllers.Vocabulary();
        const req = createReq({ body: { rvaId: 'rva-1' }, params: { id: 'vocab-1' } });
        const res = createRes();

        await controller[method](req, res as unknown as Sails.Res);

        expect(res.statusCode).to.equal(400);
        expect(res.body).to.deep.include({ message: 'Unknown RVA version' });
        expect(chronicle(req).errors?.[0]).to.include({ message: 'Unknown RVA version' });
        expect(logger.error.called).to.equal(false);
      });
    }

    it('keeps the 200 status:false response when a profile update fails', function () {
      (global as any).UsersService = {
        updateUserDetails: sinon.stub().returns(throwError(() => new Error('Email already in use'))),
      };
      const controller = new UserControllers.User();
      const req = createReq({ body: { details: { name: 'New Name', email: 'a@example.com' } } });
      const res = createRes();

      controller.update(req, res as unknown as Sails.Res);

      expect(res.statusCode).to.equal(200);
      expect(res.body).to.deep.equal({ status: false, message: 'Email already in use' });
      expect(chronicle(req)).to.deep.include({ userDetailsUpdateSuccess: false });
      expect(chronicle(req).errors?.[0]).to.include({ message: 'Email already in use' });
    });

    it('keeps the 200 status:false response when generating a user key fails', function () {
      (global as any).UsersService = { setUserKey: sinon.stub().returns(throwError(() => new Error('key failed'))) };
      const controller = new UserControllers.User();
      const req = createReq();
      const res = createRes();

      controller.generateUserKey(req, res as unknown as Sails.Res);

      expect(res.statusCode).to.equal(200);
      expect(res.body).to.deep.equal({ status: false, message: 'key failed' });
    });

    it('keeps the 200 status:false response when report results fail', async function () {
      (global as any).ReportsService = { getResults: sinon.stub().rejects(new Error('report query failed')) };
      const controller = new ReportControllers.Report();
      const req = createReq({ params: { name: 'report-1', start: '0', rows: '5' } });
      const res = createRes();

      controller.getResults(req, res as unknown as Sails.Res);
      await flush();

      expect(res.statusCode).to.equal(200);
      expect(res.body).to.deep.equal({ status: false, message: 'report query failed' });
      expect(chronicle(req)).to.deep.include({ reportName: 'report-1', reportPagingStart: 0, reportPagingRows: 5 });
      expect(chronicle(req).errors?.[0]).to.include({ message: 'report query failed' });
    });
  });

  describe('requests without a request chronicle', function () {
    it('does not warn or create a request chronicle for socket and virtual requests', function () {
      (global as any).UsersService = { updateUserDetails: sinon.stub().returns(of({})) };
      const controller = new UserControllers.User();
      const req = createReq({ body: { details: { name: 'New Name' } } }, false);
      const res = createRes();

      controller.update(req, res as unknown as Sails.Res);

      expect(res.body).to.deep.equal({ status: true, message: 'Profile updated successfully.' });
      expect(RequestChronicleHelper.existing(req)).to.equal(undefined);
      expect(logger.warn.called).to.equal(false);
      expect(logger.error.called).to.equal(false);
      expect(logger.debug.called).to.equal(false);
    });

    it('still logs errors for socket and virtual requests', function () {
      (global as any).UsersService = {
        updateUserDetails: sinon.stub().returns(throwError(() => new Error('Email already in use'))),
      };
      const controller = new UserControllers.User();
      const req = createReq({ body: { details: { name: 'New Name' } } }, false);

      controller.update(req, createRes() as unknown as Sails.Res);

      expect(logger.error.callCount).to.equal(1);
      expect((logger.error.firstCall.args[0] as any).error).to.include({ message: 'Email already in use' });
      expect(logger.warn.called).to.equal(false);
    });
  });

  describe('background audit events', function () {
    function logout(audit: Promise<unknown>) {
      (global as any).UsersService = { addUserAuditEvent: sinon.stub().returns(audit) };
      const controller = new UserControllers.User();
      const req = createReq({
        session: { user: { id: 'user-1', type: 'local' } },
        logout: (cb: (err?: unknown) => void) => cb(),
      });
      const res = createRes();
      controller.logout(req, res as unknown as Sails.Res);
      return { req, res };
    }

    it('logs an audit failure after the response with the request id, without delaying the redirect', async function () {
      let rejectAudit: (error: Error) => void = () => undefined;
      const { req, res } = logout(new Promise((_resolve, reject) => (rejectAudit = reject)));
      expect(res.location).to.equal('/logout-success');

      const rc = RequestChronicleHelper.existing(req)!;
      rc.finish({ statusCode: 302, headersSent: true, writableFinished: true });
      rc.log(logger);
      rejectAudit(new Error('audit database unavailable'));
      await flush();

      expect(logger.error.callCount).to.equal(1);
      expect(logger.error.firstCall.args[0]).to.deep.include({
        requestId: 'request-1',
        operation: 'userAuditEventLogout',
        outcome: 'failure',
      });
      expect((logger.error.firstCall.args[0] as any).error).to.include({ message: 'audit database unavailable' });
      expect(logger.warn.called).to.equal(false);
    });

    it('does not warn when an audit event succeeds after the response', async function () {
      let resolveAudit: () => void = () => undefined;
      const { req } = logout(new Promise<void>(resolve => (resolveAudit = resolve)));
      RequestChronicleHelper.existing(req)!.finish({ statusCode: 302, headersSent: true, writableFinished: true });
      resolveAudit();
      await flush();

      expect(logger.warn.called).to.equal(false);
      expect(logger.error.called).to.equal(false);
    });

    it('records an audit event result that settles before the response finishes', async function () {
      const { req } = logout(Promise.resolve());
      await flush();
      expect(chronicle(req)).to.deep.include({ userLogoutSuccess: true, userAuditEventLogout: 'success' });
    });
  });

  describe('captured details', function () {
    it('records safe metadata, not the email body or subject, when sending fails', function () {
      const emailService = {
        evaluateProperties: sinon.stub().returns({
          formatRendered: 'html',
          toRendered: 'person@example.com',
          subjectRendered: 'Private subject',
          templateRendered: of({ status: 200, body: '<p>private body</p>' }),
        }),
        sendMessage: sinon.stub().returns(of({ success: false, msg: 'Email unable to be submitted' })),
      };
      (global as any).sails.services.emailservice = emailService;
      const controller = new EmailControllers.Email();
      controller.init();
      const req = createReq({ apiRequest: { body: { to: 'person@example.com', template: 'tmpl', format: 'html' } } });
      const res = createRes();

      controller.sendNotification(req, res as unknown as Sails.Res);

      const data = chronicle(req);
      expect(res.statusCode).to.equal(500);
      expect(data).to.deep.include({
        emailProcessStepFailed: 'send',
        emailSendMessage: 'Email unable to be submitted',
      });
      expect(JSON.stringify(data)).to.not.include('private body');
      expect(JSON.stringify(data)).to.not.include('Private subject');
    });

    it('does not record branding preview tokens or urls', async function () {
      (global as any).BrandingService = {
        ...(global as any).BrandingService,
        preview: sinon.stub().resolves({ token: 'secret-token', url: '/default/rdmp/preview/secret-token.css' }),
      };
      const controller = new BrandingAppControllers.BrandingApp();
      const req = createReq({
        path: '/default/rdmp/app/branding/preview',
        params: { branding: 'default', portal: 'rdmp' },
        body: { variables: {} },
      });
      const res = createRes();

      await controller.preview(req, res as unknown as Sails.Res);

      expect(res.body).to.deep.include({ previewToken: 'secret-token' });
      expect(JSON.stringify(chronicle(req))).to.not.include('secret-token');
      expect(chronicle(req)).to.deep.include({ brandingAppPreviewCreated: true });
    });
  });
});
