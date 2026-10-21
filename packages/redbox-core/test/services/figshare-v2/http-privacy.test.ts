import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { inspect } from 'node:util';
import * as sinon from 'sinon';
import { createSinonStubLogger } from '../../logger.test';
import { trace, type Span, type SpanOptions, type Context } from '@opentelemetry/api';
import { FigsharePublishing } from '../../../src/configmodels/FigsharePublishing';
import { makeLiveClient, FigshareHttpError } from '../../../src/services/figshare-v2/http';

/** Real HTTP failures must not export private metadata or Axios credentials to telemetry. */
describe('Figshare HTTP privacy boundary', function () {
  let server: Server;
  let baseUrl: string;
  let previousSails: PropertyDescriptor | undefined;
  const confidential = 'private-publication-description-927';
  const credential = 'private-upload-signature-498';
  const token = 'private-account-token-625';
  const context = {
    recordOid: 'record',
    brandId: 'brand',
    brandName: 'brand',
    correlationId: 'test',
    triggerSource: 'test',
  };
  before(async function () {
    server = createServer((_req, res) => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 'BadRequest', message: confidential }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async function () {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  beforeEach(() => {
    previousSails = Object.getOwnPropertyDescriptor(globalThis, 'sails');
    Reflect.set(globalThis, 'sails', { log: createSinonStubLogger(sinon) });
  });
  afterEach(() => {
    sinon.restore();
    if (previousSails) Object.defineProperty(globalThis, 'sails', previousSails);
    else Reflect.deleteProperty(globalThis, 'sails');
  });
  function client() {
    const config = new FigsharePublishing();
    config.connection.baseUrl = baseUrl;
    config.connection.token = token;
    config.connection.retry.maxAttempts = 1;
    return makeLiveClient(config, context);
  }
  it('keeps private request and response bodies out of ordinary logs and raw Axios internals out of errors', async function () {
    const captured: unknown[] = [];
    sinon.replace(sails.log, 'debug', (...args: unknown[]) => {
      captured.push(args);
    });
    sinon.replace(sails.log, 'error', (...args: unknown[]) => {
      captured.push(args);
    });
    await assert.rejects(client().updateArticle('51', { description: confidential }), error => {
      assert.ok(error instanceof FigshareHttpError);
      assert.equal(error.statusCode, 400);
      // Provider reconciliation still receives its explicit response evidence.
      assert.deepEqual(error.responseBody, { code: 'BadRequest', message: confidential });
      assert.equal('cause' in error, false);
      assert.equal(inspect(error).includes(token), false);
      assert.equal(inspect(error).includes(confidential), false);
      assert.equal(JSON.stringify(error).includes(confidential), false);
      return true;
    });
    assert.ok(captured.length > 0, 'the failed HTTP request must emit transport logs');
    const logs = inspect(captured, { depth: 20 });
    assert.equal(logs.includes(confidential), false);
    assert.equal(logs.includes(token), false);
  });
  it('keeps signed URLs and provider exception text out of spans and propagated error messages', async function () {
    const attributes: unknown[] = [];
    const events: unknown[] = [];
    const tracer = trace.getTracer('privacy-test');
    const span = tracer.startSpan('test');
    sinon.stub(span, 'recordException').callsFake(exception => {
      events.push(exception);
      return undefined;
    });
    sinon.stub(span, 'setStatus').callsFake(status => {
      events.push(status);
      return span;
    });
    function active<T>(name: string, fn: (span: Span) => T): T;
    function active<T>(name: string, options: SpanOptions, fn: (span: Span) => T): T;
    function active<T>(name: string, options: SpanOptions, context: Context, fn: (span: Span) => T): T;
    function active<T>(
      _name: string,
      options: SpanOptions | ((span: Span) => T),
      ctx?: Context | ((span: Span) => T),
      fn?: (span: Span) => T
    ): T {
      if (typeof options === 'function') return options(span);
      attributes.push(options.attributes);
      if (typeof ctx === 'function') return ctx(span);
      assert.ok(fn);
      return fn(span);
    }
    sinon.stub(trace, 'getTracer').returns({ startSpan: () => span, startActiveSpan: active });
    await assert.rejects(client().getLocation(`${baseUrl}/upload?signature=${credential}`), error => {
      assert.ok(error instanceof FigshareHttpError);
      assert.equal(error.statusCode, 400);
      assert.equal(error.message.includes(credential), false);
      return true;
    });
    assert.ok(attributes.length > 0, 'the failed HTTP request must emit span attributes');
    assert.ok(events.length > 0, 'the failed HTTP request must emit span failure events');
    const telemetry = inspect({ attributes, events }, { depth: 20 });
    assert.equal(telemetry.includes(credential), false);
    assert.equal(telemetry.includes(token), false);
    assert.equal(telemetry.includes(confidential), false);
  });
});
