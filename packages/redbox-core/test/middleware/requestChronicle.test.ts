import sinon from 'sinon';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyRequest as Request } from 'fastify';
import { RequestChronicleHelper } from '../../src/utilities/RequestChronicle';
let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));

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
        url: '/default/rdmp/preview/token123.css',
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
  afterEach(() => sinon.restore());
});
