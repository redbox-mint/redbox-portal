import { RBValidationError } from '../../src';

let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import * as sinon from 'sinon';
import {
  RequestChronicleHelper,
  RequestChronicleLimits,
  RequestChronicleOptions,
  sanitizeChroniclePath,
  sanitizeChronicleValue,
  toChronicleError,
  toChronicleLogRecord,
} from '../../src/utilities/RequestChronicle';
import { createSinonStubLogger } from '../logger.test';

type StubLogger = ReturnType<typeof createSinonStubLogger>;

describe('RequestChronicleHelper', () => {
  let logger: StubLogger;
  let clockMs: number;

  beforeEach(() => {
    logger = createSinonStubLogger(sinon);
    (globalThis as any).sails = { config: {}, log: logger };
    clockMs = 1000;
  });

  afterEach(() => {
    sinon.restore();
    delete (globalThis as any).sails;
  });

  function createHelper(options: RequestChronicleOptions = {}, req: Record<string, unknown> = {}) {
    const request = { method: 'GET', path: '/default/rdmp/home', hostname: 'localhost', headers: {}, ...req };
    const rc = RequestChronicleHelper.fromReq(logger, request as unknown as Sails.Req, {
      now: () => clockMs,
      random: () => 0.99,
      generateRequestId: () => 'request-1',
      ...options,
    });
    return { rc, req: request as unknown as Sails.Req };
  }

  function startedHelper(options: RequestChronicleOptions = {}, req: Record<string, unknown> = {}) {
    const created = createHelper(options, req);
    created.rc.start();
    created.rc.updateReq(created.req);
    return created;
  }

  const completed = (statusCode: number) => ({ statusCode, headersSent: true, writableFinished: true });

  function loggedCalls() {
    return {
      error: logger.error.getCalls().map(c => c.args),
      warn: logger.warn.getCalls().map(c => c.args),
      info: logger.info.getCalls().map(c => c.args),
      debug: logger.debug.getCalls().map(c => c.args),
    };
  }

  describe('lifecycle', () => {
    it('stores one helper instance on the request, which survives the sails route options merge', () => {
      const sailsLodash = require('@sailshq/lodash');
      const { rc, req } = createHelper();

      expect(RequestChronicleHelper.fromReq(logger, req)).to.equal(rc);
      req.options = sailsLodash.merge({}, { action: 'user/info' }, req.options);
      expect(RequestChronicleHelper.existing(req)).to.equal(rc);
    });

    it('recognises a helper created by another loaded copy of the module', () => {
      const { rc, req } = startedHelper();
      const moduleId = require.resolve('../../src/utilities/RequestChronicle');
      const cached = require.cache[moduleId];
      try {
        delete require.cache[moduleId];
        const second = require(moduleId) as typeof import('../../src/utilities/RequestChronicle');
        expect(rc instanceof second.RequestChronicleHelper).to.equal(false);
        expect(second.RequestChronicleHelper.existing(req)).to.equal(rc);
        second.RequestChronicleHelper.existing(req)?.addInfo({ fromSecondModule: true });
        expect(rc.data.fromSecondModule).to.equal(true);
      } finally {
        require.cache[moduleId] = cached;
      }
    });

    it('does not create a helper when looking up an existing helper', () => {
      const req = {} as Sails.Req;
      expect(RequestChronicleHelper.existing(req)).to.equal(undefined);
      expect(req.options).to.equal(undefined);
    });

    it('records the request, a request id, and a monotonic duration', () => {
      const { rc } = startedHelper({}, { headers: { 'x-request-id': 'upstream-1' } });
      clockMs += 1234;
      expect(rc.finish(completed(200))).to.equal(true);

      const data = rc.data;
      expect(data.requestId).to.equal('request-1');
      expect(rc.requestId).to.equal('request-1');
      expect(data.req).to.deep.equal({
        method: 'GET',
        path: '/default/rdmp/home',
        hostname: 'localhost',
        upstreamRequestId: 'upstream-1',
      });
      expect(data.res).to.deep.equal({ statusCode: 200, completed: true });
      expect(data.result?.durationMs).to.equal(1234);
      expect(data.result?.timestamp).to.be.a('string');
      expect(data.result?.outcome).to.equal('success');
    });

    it('ignores invalid upstream request ids', () => {
      const { rc } = startedHelper({}, { headers: { 'x-request-id': 'bad id\nwith newline' } });
      expect(rc.data.req).to.not.have.property('upstreamRequestId');
    });

    it('finishes and logs exactly once', () => {
      const { rc } = startedHelper({ settings: { successSampleRate: 1 } });
      expect(rc.finish(completed(200))).to.equal(true);
      expect(rc.finish({ statusCode: 500, headersSent: true, writableFinished: false })).to.equal(false);
      rc.log();
      rc.log();

      expect(rc.data.res).to.deep.equal({ statusCode: 200, completed: true });
      expect(logger.info.callCount).to.equal(1);
      expect(logger.warn.called).to.equal(false);
    });

    it('does not log before it is finished', () => {
      const { rc } = startedHelper({ settings: { successSampleRate: 1 } });
      rc.log();
      expect(logger.info.called).to.equal(false);
      expect(logger.error.called).to.equal(false);
    });

    it('never throws when the logger throws', () => {
      const { rc } = startedHelper({ settings: { successSampleRate: 1 } });
      logger.info.throws(new Error('transport failed'));
      logger.warn.throws(new Error('transport failed'));
      rc.finish(completed(200));
      expect(() => rc.log()).to.not.throw();
    });
  });

  describe('outcome, classification, and severity', () => {
    const cases: {
      name: string;
      res: { statusCode?: number; headersSent?: boolean; writableFinished?: boolean };
      errors?: unknown[];
      expected: { outcome: string; classification: string; severity: string; statusCode?: number; completed: boolean };
    }[] = [
      {
        name: 'successful response',
        res: completed(200),
        expected: { outcome: 'success', classification: 'discard', severity: 'none', statusCode: 200, completed: true },
      },
      {
        name: 'direct 404 response',
        res: completed(404),
        expected: {
          outcome: 'failure',
          classification: 'client-error',
          severity: 'info',
          statusCode: 404,
          completed: true,
        },
      },
      {
        name: '400 response with a recorded error',
        res: completed(400),
        errors: [new Error('import failed')],
        expected: {
          outcome: 'failure',
          classification: 'client-error',
          severity: 'warn',
          statusCode: 400,
          completed: true,
        },
      },
      {
        name: 'direct 500 response',
        res: completed(500),
        expected: { outcome: 'failure', classification: 'error', severity: 'error', statusCode: 500, completed: true },
      },
      {
        name: '200 response with a recorded error',
        res: completed(200),
        errors: ['handled failure'],
        expected: { outcome: 'failure', classification: 'error', severity: 'error', statusCode: 200, completed: true },
      },
      {
        name: 'connection aborted before headers were sent',
        res: { statusCode: 200, headersSent: false, writableFinished: false },
        expected: { outcome: 'aborted', classification: 'aborted', severity: 'info', completed: false },
      },
      {
        name: 'connection aborted while streaming a response',
        res: { statusCode: 200, headersSent: true, writableFinished: false },
        expected: {
          outcome: 'aborted',
          classification: 'aborted',
          severity: 'info',
          statusCode: 200,
          completed: false,
        },
      },
    ];

    for (const testCase of cases) {
      it(`classifies a ${testCase.name}`, () => {
        const { rc } = startedHelper();
        (testCase.errors ?? []).forEach(error => rc.addError(error));
        rc.finish(testCase.res);
        rc.log();

        const data = rc.data;
        expect({
          outcome: data.result?.outcome,
          classification: data.result?.classification,
          severity: data.result?.severity,
        }).to.deep.equal({
          outcome: testCase.expected.outcome,
          classification: testCase.expected.classification,
          severity: testCase.expected.severity,
        });
        expect(data.res).to.deep.equal({
          ...(testCase.expected.statusCode !== undefined ? { statusCode: testCase.expected.statusCode } : {}),
          completed: testCase.expected.completed,
        });
        const levels = (['error', 'warn', 'info'] as const).filter(level => logger[level].called);
        expect(levels).to.deep.equal(testCase.expected.severity === 'none' ? [] : [testCase.expected.severity]);
      });
    }

    it('classifies slow requests using the configured threshold', () => {
      const { rc } = startedHelper({ settings: { slowThresholdMs: '50' } });
      clockMs += 51;
      rc.finish(completed(200));
      rc.log();
      expect(rc.data.result?.classification).to.equal('slow');
      expect(logger.warn.callCount).to.equal(1);
    });

    it('samples successful requests using the configured rate', () => {
      const sampled = startedHelper({ settings: { successSampleRate: 0.5 }, random: () => 0.49 }).rc;
      sampled.finish(completed(200));
      expect(sampled.data.result?.classification).to.equal('sample');

      const discarded = startedHelper({ settings: { successSampleRate: 0.5 }, random: () => 0.5 }).rc;
      discarded.finish(completed(200));
      expect(discarded.data.result?.classification).to.equal('discard');
    });

    it('uses the default retention settings, and reads the sails config', () => {
      expect(createHelper().rc.settings).to.include({ successSampleRate: 0.1, slowThresholdMs: 2000 });

      (globalThis as any).sails.config.log = { requestChronicle: { successSampleRate: '1', slowThresholdMs: 'oops' } };
      const settings = RequestChronicleHelper.fromReq(logger, {} as Sails.Req).settings;
      expect(settings.successSampleRate).to.equal(1);
      expect(settings.slowThresholdMs).to.equal(2000);
    });

    it('can retain every request', () => {
      const { rc } = startedHelper(
        { settings: { successSampleRate: 1, successSampleExcludePattern: '' }, random: () => 0.999999 },
        { path: '/default/rdmp/styles/style.css' }
      );
      rc.finish(completed(200));
      expect(rc.data.result?.classification).to.equal('sample');
    });

    it('does not sample successful static asset requests by default', () => {
      const { rc } = startedHelper({ settings: { successSampleRate: 1 } }, { path: '/default/rdmp/js/app.js' });
      rc.finish(completed(200));
      expect(rc.data.result?.classification).to.equal('discard');

      const failed = startedHelper({ settings: { successSampleRate: 1 } }, { path: '/default/rdmp/js/missing.js' }).rc;
      failed.finish(completed(404));
      expect(failed.data.result?.classification).to.equal('client-error');
    });
  });

  describe('capture safeguards on every logging path', () => {
    it('redacts sensitive top-level details before and after completion', () => {
      const { rc } = startedHelper();
      rc.addInfo({ password: 'private-password', accessToken: 'private-token', safe: 'ok' });
      expect(rc.data.password).to.equal('REDACTED');
      expect(rc.data.accessToken).to.equal('REDACTED');
      rc.finish(completed(200));
      rc.addInfo({ password: 'late-password', nested: { secret: 'late-secret' } });
      const rendered = JSON.stringify(logger.debug.firstCall.args);
      expect(rendered).to.not.include('late-password');
      expect(rendered).to.not.include('late-secret');
      expect(rendered).to.include('REDACTED');
    });

    it('bounds single-line stacks and sanitises error text and validation details', () => {
      const tokenPath = '/default/rdmp/preview/private-preview-token.css';
      const error = new Error(`Request failed at ${tokenPath}`);
      error.name = `Failure ${tokenPath}`;
      (error as Error & { code: string }).code = tokenPath;
      error.stack = `${tokenPath} ${'x'.repeat(1_000_000)}`;
      const recorded = toChronicleError(error);
      expect(JSON.stringify(recorded)).to.not.include('private-preview-token');
      expect(recorded.stack!.length).to.be.lessThan(RequestChronicleLimits.maxStackLength + 100);
      expect(JSON.stringify(recorded).length).to.be.lessThan(RequestChronicleLimits.maxErrorJsonLength);
      const validation = new RBValidationError({ displayErrors: [{ title: tokenPath, detail: tokenPath }] });
      expect(JSON.stringify(toChronicleError(validation))).to.not.include('private-preview-token');
    });

    it('retains readable bounded details for very large aggregate errors', () => {
      const errors = Array.from({ length: 200_000 }, () => 'same error');
      const recorded = toChronicleError(new AggregateError(errors, 'batch failed'));
      expect(recorded.message).to.equal('batch failed');
      expect(recorded.details).to.have.length.at.most(RequestChronicleLimits.maxErrorDetails + 1);
      expect(JSON.stringify(recorded)).to.include('more errors omitted');
      expect(JSON.stringify(recorded).length).to.be.lessThan(RequestChronicleLimits.maxErrorJsonLength);
    });

    it('keeps late error chains readable by the default flattened transport', () => {
      const { rc } = startedHelper();
      rc.finish(completed(200));
      rc.addOperationResult('audit.login', new Error('audit failed', { cause: new Error('database unavailable') }));
      const record = logger.error.firstCall.args[0] as any;
      expect(record.requestId).to.equal('request-1');
      expect(record.error.details).to.not.be.an('array');
      expect(record.error.details['0'].message).to.equal('database unavailable');
    });
  });

  describe('details', () => {
    it('rejects reserved and pino core keys without logging their values', () => {
      const { rc } = startedHelper();
      rc.addInfo({ level: 'info', name: 'shadowed', requestId: 'x', msg: 'secret-value', ok: true });

      const data = rc.data;
      expect(data.ok).to.equal(true);
      expect(data.requestId).to.equal('request-1');
      expect(data).to.not.have.any.keys('level', 'name', 'msg');
      const warnings = logger.warn.getCalls().map(c => String(c.args[0]));
      expect(warnings).to.have.length(4);
      expect(warnings.join(' ')).to.not.include('secret-value');
      expect(warnings.join(' ')).to.not.include('shadowed');
    });

    it('sanitises and bounds the details', () => {
      const { rc } = startedHelper();
      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;
      rc.addInfo({
        previewUrl: '/default/rdmp/preview/0123456789abcdef.css',
        callback: '/callback?code=abc123&state=ok',
        nested: { password: 'p', apiKey: 'k', authorizationHeader: 'Bearer abc', safe: 'value' },
        jwt: 'aaa.bbb.ccc',
        long: 'x'.repeat(2000),
        many: Array.from({ length: 50 }, (_v, i) => i),
        circular,
        func: () => 'value',
        deep: { a: { b: { c: { d: { e: 'too deep' } } } } },
      });

      const data = rc.data;
      expect(data.previewUrl).to.equal('/default/rdmp/preview/REDACTED.css');
      expect(data.callback).to.equal('/callback?code=REDACTED&state=ok');
      expect(data.nested).to.deep.equal({
        password: 'REDACTED',
        apiKey: 'REDACTED',
        authorizationHeader: 'REDACTED',
        safe: 'value',
      });
      expect(data.jwt).to.equal('REDACTED');
      expect((data.long as string).length).to.be.lessThan(600);
      expect(data.many).to.have.length(RequestChronicleLimits.maxArrayItems + 1);
      expect(data.circular).to.deep.equal({ a: 1, self: '[Circular]' });
      expect(data.func).to.equal('[Function]');
      expect(data.deep).to.deep.equal({ a: { b: { c: { d: '[Object]' } } } });
    });

    it('replaces values that are too large with a size summary', () => {
      const value = Object.fromEntries(Array.from({ length: 30 }, (_v, i) => [`key${i}`, 'y'.repeat(400)]));
      expect(sanitizeChronicleValue(value)).to.deep.include({ truncated: true });
    });

    it('sanitises token-bearing request paths', () => {
      const { rc } = startedHelper({}, { path: '/default/rdmp/preview/abc123def.css' });
      expect(rc.data.req?.path).to.equal('/default/rdmp/preview/REDACTED.css');
      expect(sanitizeChroniclePath('/a/b?token=t1&x=1')).to.equal('/a/b?token=REDACTED&x=1');
    });

    it('ignores details when there is no running chronicle', () => {
      const { rc } = createHelper();
      rc.addInfo({ ignored: true });
      expect(rc.data).to.deep.equal({});
      expect(loggedCalls()).to.deep.equal({ error: [], warn: [], info: [], debug: [] });
    });

    it('logs late details at debug level only, with the request id', () => {
      const { rc } = startedHelper();
      rc.finish(completed(200));
      rc.addInfo({ userAuditEventLogout: 'success' });

      expect(logger.warn.called).to.equal(false);
      expect(logger.debug.callCount).to.equal(1);
      expect(logger.debug.firstCall.args[0]).to.deep.include({ requestId: 'request-1' });
    });
  });

  describe('errors', () => {
    it('records errors as bounded plain objects', () => {
      const { rc } = startedHelper();
      const rbError = new RBValidationError({
        message: 'RB error message',
        displayErrors: [{ title: 'Processing failed', code: 'processing-failed', meta: { oid: 'oid-1' } }],
      });
      rc.addError(new Error('My error'));
      rc.addError(rbError);
      rc.addError('Some error');
      rc.addError(new SuppressedError('suppressed error', 'contained error', 'the message'));
      rc.addError(new AggregateError(['contained error'], 'the message', { cause: 'cause error' }));

      const errors = rc.data.errors ?? [];
      expect(errors[0]).to.include({ name: 'Error', message: 'My error' });
      expect(errors[0].stack).to.be.a('string').and.include('RequestChronicle.test.ts');
      expect(errors[1]).to.deep.equal({
        name: 'RBValidationError',
        message: 'RB error message',
        details: [{ name: 'Processing failed', message: 'code: processing-failed' }],
      });
      expect(errors[2]).to.deep.equal({ message: 'Some error' });
      expect(errors[3]).to.deep.include({
        name: 'SuppressedError',
        message: 'the message',
        details: [{ message: 'suppressed error' }, { message: 'contained error' }],
      });
      expect(errors[4]).to.deep.include({
        name: 'AggregateError',
        message: 'the message',
        details: [{ message: 'cause error' }, { message: 'contained error' }],
      });
    });

    it('handles cyclic causes without throwing or writing to the console', () => {
      const consoleDebug = sinon.stub(console, 'debug');
      const error = new Error('self referential') as Error & { cause?: unknown };
      error.cause = error;
      const outer = new Error('outer', { cause: new Error('middle', { cause: error }) });

      const result = toChronicleError(outer);

      expect(consoleDebug.called).to.equal(false);
      expect(result.details?.[0].details?.[0].details).to.deep.equal([{ message: '[Circular]' }]);
    });

    it('bounds nested errors and the stack trace', () => {
      let error: Error = new Error('level 0');
      for (let i = 1; i < 10; i++) {
        error = new Error(`level ${i}`, { cause: error });
      }
      const many = new AggregateError(
        Array.from({ length: 30 }, (_v, i) => new Error(`e${i}`)),
        'many'
      );

      const nested = toChronicleError(error);
      expect(JSON.stringify(nested)).to.include('nested errors omitted');
      expect(nested.stack?.split('\n').length).to.be.at.most(RequestChronicleLimits.maxStackLines);
      const aggregate = toChronicleError(many);
      expect(aggregate.details).to.have.length(RequestChronicleLimits.maxErrorDetails + 1);
    });

    it('limits the number of errors', () => {
      const { rc } = startedHelper();
      for (let i = 0; i < RequestChronicleLimits.maxErrors + 5; i++) {
        rc.addError(`error ${i}`);
      }
      expect(rc.data.errors).to.have.length(RequestChronicleLimits.maxErrors);
      expect(rc.data.errorsOmitted).to.equal(5);
    });

    it('logs errors recorded after the request finished, with the request id', () => {
      const { rc } = startedHelper();
      rc.finish(completed(302));
      rc.addError(new Error('audit database unavailable'));

      expect(logger.error.callCount).to.equal(1);
      const [details, message] = logger.error.firstCall.args as [any, string];
      expect(details).to.deep.include({ requestId: 'request-1' });
      expect(details.error).to.include({ message: 'audit database unavailable' });
      expect(message).to.include('after the request finished');
    });
  });

  describe('operation results', () => {
    it('adds operation results to the running chronicle', () => {
      const { rc } = startedHelper();
      rc.addOperationResult('userAuditEventLogin');
      rc.addOperationResult('userAuditEventLogout', new Error('failed'));

      const data = rc.data;
      expect(data.userAuditEventLogin).to.equal('success');
      expect(data.userAuditEventLogout).to.equal('failure');
      expect(data.errors?.[0]).to.include({ message: 'failed' });
    });

    it('logs late failures separately and keeps late successes quiet', () => {
      const { rc } = startedHelper();
      rc.finish(completed(302));
      rc.log();
      rc.addOperationResult('userAuditEventLogout');
      rc.addOperationResult('userAuditEventLogout', new Error('audit database unavailable'));

      expect(logger.warn.called).to.equal(false);
      expect(logger.debug.callCount).to.equal(1);
      expect(logger.error.callCount).to.equal(1);
      expect(logger.error.firstCall.args[0]).to.deep.include({
        requestId: 'request-1',
        operation: 'userAuditEventLogout',
        outcome: 'failure',
      });
      expect((logger.error.firstCall.args[0] as any).error).to.include({ message: 'audit database unavailable' });
    });
  });

  describe('log record', () => {
    it('logs arrays as objects keyed by index, so flattening log formats keep the structure', () => {
      const { rc } = startedHelper();
      rc.addError(new Error('first'));
      rc.finish(completed(500));
      rc.log();

      const [record, message] = logger.error.firstCall.args as [any, string];
      expect(message).to.equal('Request chronicle');
      expect(record.errors['0']).to.include({ name: 'Error', message: 'first' });
      expect(toChronicleLogRecord({ a: [1, [2]] })).to.deep.equal({ a: { 0: 1, 1: { 0: 2 } } });
    });
  });
});
