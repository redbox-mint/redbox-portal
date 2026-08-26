import assert from 'node:assert/strict';
import * as sinon from 'sinon';

import { Controllers } from '../../src/CoreController';
import type { BuildResponseType } from '../../src/model';

class TestController extends Controllers.Core.Controller {
  public callSendResp(req: Sails.Req, res: Sails.Res, response: BuildResponseType) {
    return this.sendResp(req, res, response);
  }
}

describe('CoreController bodyless not-modified responses', function () {
  let priorSails: unknown;

  beforeEach(function () {
    priorSails = Reflect.get(globalThis, 'sails');
    Reflect.set(globalThis, 'sails', {
      config: {},
      log: {
        verbose: sinon.stub(),
        error: sinon.stub(),
        debug: sinon.stub(),
      },
    });
  });

  afterEach(function () {
    sinon.restore();
    if (priorSails === undefined) {
      Reflect.deleteProperty(globalThis, 'sails');
    } else {
      Reflect.set(globalThis, 'sails', priorSails);
    }
  });

  it('ends a 304 without serializing an API body for either API version', function () {
    const controller = new TestController();
    const headers = {
      ETag: `"sha256:${'a'.repeat(64)}"`,
      'Cache-Control': 'private, no-cache',
      Vary: 'Authorization',
    };

    for (const apiVersion of ['1.0', '2.0']) {
      const req = {
        headers: { 'X-ReDBox-Api-Version': apiVersion },
        query: {},
        url: '/default/rdmp/api/records/schemas/create/dataset',
      } as unknown as Sails.Req;
      const res = {
        set: sinon.stub(),
        status: sinon.stub().returnsThis(),
        json: sinon.stub(),
        end: sinon.stub().returnsThis(),
      } as unknown as Sails.Res;

      controller.callSendResp(req, res, { status: 304, headers });

      assert.equal((res.set as sinon.SinonStub).calledOnceWithExactly(headers), true);
      assert.equal((res.status as sinon.SinonStub).calledOnceWithExactly(304), true);
      assert.equal((res.end as sinon.SinonStub).calledOnceWithExactly(), true);
      assert.equal((res.json as sinon.SinonStub).notCalled, true);
    }
  });
});
