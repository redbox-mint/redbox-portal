let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import * as fs from 'fs';
import { EventEmitter } from 'node:events';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import { httpRequestChronicle, httpErrorHandler } from '../../src/http/express/middleware';
import type { Request, Response, RequestHandler } from 'express';
import { RequestChronicleHelper } from '../../src/utilities/RequestChronicle';
import { currentRequestChronicle } from '../../src/utilities/RequestChronicleContext';
import { recordServiceChronicle } from '../../src/utilities/serviceChronicle';
import { createSinonStubLogger } from '../logger.test';

type StubLogger = ReturnType<typeof createSinonStubLogger>;

class HTTPTestService {
  constructor(private readonly log: StubLogger) {}
  async recordOwner(owner: string, wait: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, wait));
    recordServiceChronicle(this.log, { serviceOwner: owner });
  }
}

describe('requestChronicle middleware', function () {
  let logger: StubLogger;
  let requestChronicle: RequestHandler;
  let server: http.Server;
  let port: number;
  let uncaught: sinon.SinonSpy;

  beforeEach(async function () {
    logger = createSinonStubLogger(sinon);
    requestChronicle = httpRequestChronicle(logger, { successSampleRate: 1, successSampleExcludePattern: '' });
    uncaught = sinon.spy();
    process.on('uncaughtException', uncaught);

    server = http.createServer((req, res) => {
      const request = req as unknown as Request;
      (request as { path: string }).path = req.url ?? '';
      requestChronicle(request, res as unknown as Response, () => {
        if (req.url?.startsWith('/service/')) {
          const owner = req.url;
          const wait = owner === '/service/20' ? 20 : 1;
          void new HTTPTestService(logger).recordOwner(owner, wait).then(() => res.end('done'));
          return;
        }
        if (req.url === '/abort') {
          res.writeHead(200);
          res.write('partial');
          return;
        }
        if (req.url === '/error') {
          RequestChronicleHelper.fromReq(logger, request).addError(new Error('controller failed'));
        }
        res.statusCode = Number(req.url?.split('/')[1]) || 200;
        res.end('done');
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
  });

  afterEach(async function () {
    process.removeListener('uncaughtException', uncaught);
    sinon.restore();
    await new Promise(resolve => server.close(resolve));
  });

  async function visit(route: string, abort = false): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const request = http.get({ host: '127.0.0.1', port, path: route }, response => {
        response.on('data', () => {
          if (abort) {
            request.destroy();
            resolve();
          }
        });
        response.on('end', resolve);
      });
      request.on('error', error => (abort ? resolve() : reject(error)));
    });
    // Allow the server 'finish' and 'close' events to run.
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  function events() {
    return (['error', 'warn', 'info'] as const).flatMap(level =>
      logger[level]
        .getCalls()
        .filter(call => call.args[1] === 'Request chronicle')
        .map(call => ({ level, record: call.args[0] as any }))
    );
  }

  it('logs one event for a completed successful response', async function () {
    await visit('/200');
    const logged = events();
    expect(logged).to.have.length(1);
    expect(logged[0].level).to.equal('info');
    expect(logged[0].record.req.path).to.equal('/200');
    expect(logged[0].record.res).to.deep.equal({ statusCode: 200, completed: true });
    expect(logged[0].record.result).to.include({ outcome: 'success', classification: 'sample' });
    expect(logged[0].record.requestId).to.be.a('string');
  });

  it('records asynchronous service details on the right event for simultaneous HTTP requests', async function () {
    await Promise.all([visit('/service/20'), visit('/service/1')]);
    const logged = events();
    expect(logged).to.have.length(2);
    expect(new Set(logged.map(item => item.record.requestId)).size).to.equal(2);
    for (const item of logged) {
      expect(item.record.serviceOwner).to.equal(item.record.req.path);
    }
    expect(currentRequestChronicle()).to.equal(undefined);
  });

  it('propagates a downstream exception once and restores context', () => {
    const req = { options: {}, headers: {}, method: 'GET', path: '/throws' } as Request;
    const res = new EventEmitter() as unknown as Response;
    const error = new Error('downstream failed');
    const next = sinon.stub().callsFake(() => {
      expect(currentRequestChronicle()).to.equal(RequestChronicleHelper.existing(req));
      throw error;
    });
    expect(() => requestChronicle(req, res, next)).to.throw(error);
    sinon.assert.calledOnce(next);
    expect(currentRequestChronicle()).to.equal(undefined);
    sinon.assert.notCalled(logger.warn);
  });

  it('logs direct 404 and 500 responses as failures with consistent severity', async function () {
    await visit('/404');
    await visit('/500');
    const logged = events();
    expect(
      logged.map(item => [
        item.level,
        item.record.res.statusCode,
        item.record.result.outcome,
        item.record.result.classification,
      ])
    ).to.deep.equal([
      ['error', 500, 'failure', 'error'],
      ['info', 404, 'failure', 'client-error'],
    ]);
  });

  it('logs recorded errors in the event', async function () {
    await visit('/error');
    const logged = events();
    expect(logged).to.have.length(1);
    expect(logged[0].level).to.equal('error');
    expect(logged[0].record.errors['0']).to.include({ message: 'controller failed' });
  });

  it('logs one aborted event when the client closes the connection', async function () {
    await visit('/abort', true);
    const logged = events();
    expect(logged).to.have.length(1);
    expect(logged[0].record.res.completed).to.equal(false);
    expect(logged[0].record.result).to.include({ outcome: 'aborted', classification: 'aborted' });
  });

  it('does not break the response or crash when logging fails', async function () {
    logger.info.throws(new Error('transport failed'));
    logger.warn.throws(new Error('transport failed'));
    await visit('/200');
    await visit('/201');
    expect(uncaught.called).to.equal(false);
  });

  it('isolates both a completion failure and a failing fallback logger', async function () {
    sinon.stub(RequestChronicleHelper.prototype, 'finish').throws(new Error('finish failed'));
    logger.warn.throws(new Error('warning transport failed'));
    await visit('/200');
    expect(uncaught.called).to.equal(false);
  });

  it('still processes the request when the chronicle cannot start', async function () {
    sinon.stub(RequestChronicleHelper, 'fromReq').throws(new Error('broken'));
    await visit('/200');
    expect(uncaught.called).to.equal(false);
    expect(logger.warn.calledWithMatch('Request chronicle: could not start the request chronicle.')).to.equal(true);
  });
});

describe('request chronicle default log output', function () {
  this.timeout(20000);

  it('renders readable logfmt fields for the event, errors, and stack', async function () {
    const pino = require('pino');
    const { log, logfmtTransportTarget, logfmtTransportOptions } = require('../../src/config/log.config');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'request-chronicle-'));
    const file = path.join(dir, 'out.log');
    const transport = pino.transport({
      target: logfmtTransportTarget,
      options: { ...logfmtTransportOptions, destination: file, sync: true },
    });
    const logger = log.createPinoLogger('info', transport);
    try {
      const req = {
        method: 'GET',
        path: '/default/rdmp/preview/token123.css',
        hostname: 'localhost',
        headers: {},
      } as unknown as Request;
      const rc = RequestChronicleHelper.fromReq(logger, req, { generateRequestId: () => 'request-1' });
      rc.start();
      rc.updateReq(req);
      rc.addInfo({ level: 'info', name: 'shadowed', userId: 'u1' });
      const error = new Error('first failure', { cause: new Error('root cause') });
      error.stack = 'Error: first failure\n    at C:\\new\\test.ts:1:1';
      rc.addError(error);
      rc.finish({ statusCode: 500, headersSent: true, writableFinished: true });
      rc.log(logger);

      await new Promise<void>(resolve => {
        transport.on('close', () => resolve());
        transport.end();
      });
      const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
      const line = lines.find(item => item.includes('msg="Request chronicle"')) ?? '';

      expect(lines.filter(item => item.includes('Request chronicle'))).to.have.length(1);
      expect(line).to.match(/^level=error /);
      expect(line).to.not.include('[object Object]');
      expect(line).to.not.include('shadowed');
      expect(line).to.not.include('token123');
      expect(line).to.include('request_id=request-1');
      expect(line).to.include('res_status_code=500');
      expect(line).to.include('result_outcome=failure');
      expect(line).to.include('errors_0_message="first failure"');
      expect(line).to.include('errors_0_details_0_message="root cause"');
      expect(lines.every(item => /^level=/.test(item))).to.equal(true);
      // Quoted logfmt values must decode to the original stack, including newlines and literal backslashes.
      const stack = line.match(/(?:^| )errors_0_stack=("(?:\\.|[^"\\])*")/);
      expect(stack).to.not.equal(null);
      expect(JSON.parse(stack![1])).to.equal(error.stack);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('request chronicle Express error capture', () => {
  it('captures a pre-routing error once without process events or raw error disclosure', () => {
    const logger = createSinonStubLogger(sinon);
    const req = { options: {}, headers: {}, path: '/malformed' } as unknown as Request;
    const helper = RequestChronicleHelper.fromReq(logger, req);
    helper.start();
    const res = {
      status: sinon.stub().returnsThis(),
      set: sinon.stub().returnsThis(),
      json: sinon.stub().returnsThis(),
    } as unknown as Response;
    const handler = httpErrorHandler(logger);
    handler(new SyntaxError('PRIVATE-PARSER-CONTENT'), req, res, () => {});
    handler(new Error('PRIVATE-SECOND-ERROR'), req, res, () => {});
    expect(helper.data.errors).to.have.length(1);
    expect(helper.data.errors?.[0].message).to.equal('HTTP request failed');
    expect(JSON.stringify(helper.data)).not.to.include('PRIVATE');
    expect(() => handler(new Error('Virtual'), {} as Request, res, () => {})).not.to.throw();
  });
});
