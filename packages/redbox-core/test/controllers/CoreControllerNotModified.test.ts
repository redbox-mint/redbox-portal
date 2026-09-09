import assert from 'node:assert/strict';
import * as sinon from 'sinon';

import { Controllers } from '../../src/CoreController';
import type { BuildResponseType } from '../../src/model';

class TestController extends Controllers.Core.Controller {
  public callSendResp(req: Sails.Req, res: Sails.Res, response: BuildResponseType) {
    return this.sendResp(req, res, response);
  }
}

interface ResponseStubs {
  readonly set: sinon.SinonStub<[headers: Record<string, string>], Sails.Res>;
  readonly status: sinon.SinonStub<[status: number], Sails.Res>;
  readonly json: sinon.SinonStub<[body?: unknown], Sails.Res>;
  readonly end: sinon.SinonStub<[], Sails.Res>;
}

function requestAdapter(apiVersion: string): Sails.Req {
  const request: Sails.Req = Object.create(null);
  Reflect.set(request, 'headers', { 'X-ReDBox-Api-Version': apiVersion });
  Reflect.set(request, 'query', {});
  Reflect.set(request, 'url', '/default/rdmp/api/records/schemas/create/dataset');
  return request;
}

function responseAdapter(stubs: ResponseStubs): Sails.Res {
  const response: Sails.Res = Object.create(null);
  Reflect.set(response, 'set', stubs.set);
  Reflect.set(response, 'status', stubs.status);
  Reflect.set(response, 'json', stubs.json);
  Reflect.set(response, 'end', stubs.end);
  return response;
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
      const set = sinon.stub<[headers: Record<string, string>], Sails.Res>();
      const status = sinon.stub<[status: number], Sails.Res>().returnsThis();
      const json = sinon.stub<[body?: unknown], Sails.Res>();
      const end = sinon.stub<[], Sails.Res>().returnsThis();
      const req = requestAdapter(apiVersion);
      const res = responseAdapter({ set, status, json, end });

      controller.callSendResp(req, res, { status: 304, headers });

      assert.equal(set.calledOnceWithExactly(headers), true);
      assert.equal(status.calledOnceWithExactly(304), true);
      assert.equal(end.calledOnceWithExactly(), true);
      assert.equal(json.notCalled, true);
    }
  });
});
