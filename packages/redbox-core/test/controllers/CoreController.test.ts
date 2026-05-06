let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { Controllers } from '../../src/CoreController';
import {BuildResponseType} from "../../src";

describe('CoreController sendResp wrappers', () => {
  let controller: any;
  let originalSails: any;
  let originalTranslationService: any;

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalTranslationService = (global as any).TranslationService;

    (global as any).sails = {
      config: {},
      log: { verbose: sinon.stub(), error: sinon.stub(), debug: sinon.stub() }
    };

    (global as any).TranslationService = { t: (s: any) => s };
    (global as any)._ = require('lodash');

    class TestController extends Controllers.Core.Controller {
      public callSendResp(req: any, res: any, buildResponse?: any) {
        return this.sendResp(req, res, buildResponse);
      }
    }

    controller = new TestController();
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).TranslationService = originalTranslationService;
  });

  it('sends v1 success with data when no v1 provided', () => {
    const req: any = { headers: { 'X-ReDBox-Api-Version': '1.0' }, query: {} };
    const res: any = { set: sinon.stub(), status: sinon.stub().returnsThis(), json: sinon.stub() };
    const buildResponse: BuildResponseType = { format: 'json', data: { a: 1 } };

    controller.callSendResp(req, res, buildResponse);

    expect(res.status.calledWith(200)).to.be.true;
    expect(res.json.calledWith({ a: 1 })).to.be.true;
  });

  it('sends v1 success with v1 body when provided', () => {
    const req: any = { headers: { 'X-ReDBox-Api-Version': '1.0' }, query: {} };
    const res: any = { set: sinon.stub(), status: sinon.stub().returnsThis(), json: sinon.stub() };
    const buildResponse: BuildResponseType = { format: 'json', data: { a: 1 }, v1: { special: true } };

    controller.callSendResp(req, res, buildResponse);

    expect(res.status.calledWith(200)).to.be.true;
    expect(res.json.calledWith({ special: true })).to.be.true;
  });

  it('sends v1 error format when displayErrors provided', () => {
    const req: any = { headers: { 'X-ReDBox-Api-Version': '1.0' }, query: {} };
    const res: any = { set: sinon.stub(), status: sinon.stub().returnsThis(), json: sinon.stub() };
    const buildResponse: BuildResponseType = { format: 'json', displayErrors: [{ title: 'T', detail: 'D' }], status: 400 };

    controller.callSendResp(req, res, buildResponse);

    expect(res.json.called).to.be.true;
    const arg = res.json.firstCall.args[0];
    expect(arg).to.be.an('object');
    expect(arg.message || arg).to.exist;
  });

  it('sends v2 success with data/meta', () => {
    const req: any = { headers: { 'X-ReDBox-Api-Version': '2.0' }, query: {} };
    const res: any = { set: sinon.stub(), status: sinon.stub().returnsThis(), json: sinon.stub() };
    const buildResponse: BuildResponseType = { format: 'json', data: { b: 2 }, meta: { page: 1 } };

    controller.callSendResp(req, res, buildResponse);

    expect(res.status.calledWith(200)).to.be.true;
    expect(res.json.calledWith({ data: { b: 2 }, meta: { page: 1 } })).to.be.true;
  });

  it('sends v2 error array when displayErrors provided', () => {
    const req: any = { headers: { 'X-ReDBox-Api-Version': '2.0' }, query: {} };
    const res: any = { set: sinon.stub(), status: sinon.stub().returnsThis(), json: sinon.stub() };
    const buildResponse: BuildResponseType = { format: 'json', displayErrors: [{ code: 'ERR' }], status: 500, meta: { ok: false } };

    controller.callSendResp(req, res, buildResponse);

    expect(res.json.called).to.be.true;
    const arg = res.json.firstCall.args[0];
    expect(arg).to.have.property('errors');
    expect(arg).to.have.property('meta');
  });

  it('sends error response when given a display error with status 200 and no overall status (unexpected but possible)', () => {
    const req: any = { headers: { 'X-ReDBox-Api-Version': '2.0' }, query: {} };
    const res: any = { set: sinon.stub(), status: sinon.stub().returnsThis(), json: sinon.stub() };
    const buildResponse: BuildResponseType = { format: 'json', displayErrors: [{ code: 'ERR', status: "200" }] };

    controller.callSendResp(req, res, buildResponse);

    expect(res.status.calledWith(500)).to.be.true;
    expect(res.json.calledOnce).to.be.true;
    const arg = res.json.firstCall.args[0];
    expect(arg).to.have.property('errors');
  });

  it('sends error response when given an error with status 200 (unexpected but possible)', () => {
    const req: any = { headers: { 'X-ReDBox-Api-Version': '2.0' }, query: {} };
    const res: any = { set: sinon.stub(), status: sinon.stub().returnsThis(), json: sinon.stub() };
    const buildResponse: BuildResponseType = { format: 'json', errors: [new Error()], status: 200 };

    controller.callSendResp(req, res, buildResponse);

    expect(res.status.calledWith(500)).to.be.true;
    expect(res.json.calledOnce).to.be.true;
    const arg = res.json.firstCall.args[0];
    expect(arg).to.have.property('errors');
  });
});
