import {RBValidationError} from "../../src";

let expect: Chai.ExpectStatic;
import('chai').then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import {RequestChronicleHelper} from "../../src/utilities/RequestChronicle";
import {ILogger} from "@researchdatabox/sails-ng-common";


describe('RequestChronicleHelper', () => {
  let clock: sinon.SinonFakeTimers;
  beforeEach(() => {
    (globalThis as any).sails = {
      config: {},
      log: {
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
      }
    };
    clock = sinon.useFakeTimers({shouldAdvanceTime: true});
  });

  afterEach(() => {
    sinon.restore();
    delete (globalThis as any).sails;
    clock.restore();
  });

  it('should get same instance from request', () => {
    const logger = (globalThis as any).sails.log as ILogger;
    const req = {} as unknown as Sails.Req;

    expect(RequestChronicleHelper.fromReq(logger, req)).to.equal(RequestChronicleHelper.fromReq(logger, req));

    expect((globalThis as any).sails.log.info.called).to.equal(false);
    expect((globalThis as any).sails.log.warn.called).to.equal(false);
    expect((globalThis as any).sails.log.error.called).to.equal(false);
  });

  it('should have the expected automatically added data', () => {
    const logger = (globalThis as any).sails.log as ILogger;
    const req = {} as unknown as Sails.Req;

    const rc = RequestChronicleHelper.fromReq(logger, req);
    expect(rc.data).to.deep.equal({});
    expect(rc.isFinished).to.be.false;
    expect(rc.isRunning).to.be.false;

    rc.start();
    expect(Array.from(Object.keys(rc.data))).to.eql(['result']);
    expect(Array.from(Object.keys(rc.data.result ?? {}))).to.eql(['timestamp']);
    expect(rc.data.result?.timestamp).to.contain('T');
    expect(rc.isFinished).to.be.false;
    expect(rc.isRunning).to.be.true;

    clock.tick(1000);

    rc.finish();
    expect(Array.from(Object.keys(rc.data))).to.eql(['result']);
    expect(Array.from(Object.keys(rc.data.result ?? {})).sort()).to.eql(['classification', 'durationMs', 'outcome', 'timestamp'].sort());
    expect(rc.isFinished).to.be.true;
    expect(rc.isRunning).to.be.false;

    expect((globalThis as any).sails.log.info.called).to.equal(false);
    expect((globalThis as any).sails.log.warn.called).to.equal(false);
    expect((globalThis as any).sails.log.error.called).to.equal(false);
  });

  it('should add and log the expected data', () => {
    const logger = (globalThis as any).sails.log as ILogger;
    const req = {hostname: 'hostname', method: 'GET', path: '/the/path'} as unknown as Sails.Req;
    const res = {statusCode: 200} as unknown as Sails.Res;
    const info = {};
    const error = new Error("My error");
    const errorRb = new RBValidationError({
      message: 'RB error message',
      displayErrors: [{title: 'Processing failed', meta: {oid: 'oid-1', relatedOid: 'related-1'}}]
    });
    const errorUnknown: unknown = "Some error";
    const errorSuppressed = new SuppressedError("suppressed error", "contained error", "the message");
    const errorAggregate = new AggregateError(["contained error"], "the message", {cause: "cause error"});

    const rc = RequestChronicleHelper.fromReq(logger, req);
    rc.start();

    rc.updateReq(req);
    rc.updateRes(res);
    rc.addInfo(info);
    rc.addError(error);
    rc.addError(errorRb);
    rc.addError(errorUnknown);
    rc.addError(errorSuppressed);
    rc.addError(errorAggregate);

    clock.tick(1000);

    rc.finish();

    rc.log(logger);

    const expectedData = {
      errors: [
        {name: "Error", message: "My error"},
        {name: "RBValidationError", message: 'RB error message', details: [{name: "Processing failed", message: ""}]},
        {message: "Some error"},
        {
          name: "SuppressedError",
          message: "the message",
          details: [{message: "suppressed error"}, {message: "contained error"}]
        },
        {
          name: "AggregateError",
          message: "the message",
          details: [{message: "cause error"}, {message: "contained error"}]
        },
      ],
      req: {hostname: 'hostname', method: 'GET', path: '/the/path'},
      res,
      result: {
        classification: 'error',
        durationMs: 1000,
        outcome: 'error',
        timestamp: "1970-01-01T00:00:00.000Z",
      }
    };
    expect(rc.data).to.deep.equal(expectedData);

    expect((globalThis as any).sails.log.info.called).to.equal(false);
    expect((globalThis as any).sails.log.warn.called).to.equal(false);
    expect((globalThis as any).sails.log.error.getCalls().map((c: any) => c.args)).to.deep.equal([
      [expectedData],
    ]);
  });

  it('should log but not throw when methods called in unexpected ways', () => {
    const logger = (globalThis as any).sails.log as ILogger;
    const req = {} as unknown as Sails.Req;
    const res = {} as unknown as Sails.Res;
    const info = {myInfo: true};
    const error = new Error("My error");

    const rc = RequestChronicleHelper.fromReq(logger, req);

    // not running and not finished
    rc.updateReq(req);
    rc.updateRes(res);
    rc.log(logger);
    rc.addError(error);
    rc.addInfo(info);

    expect(rc.data).to.deep.equal({});

    expect((globalThis as any).sails.log.info.getCalls().map((c: any) => c.args)).to.deep.equal([]);
    expect((globalThis as any).sails.log.warn.getCalls().map((c: any) => c.args)).to.deep.equal([
      ["Request Chronicle Helper: Cannot update request chronicle that is not running or finished or has existing req."],
      ["Request Chronicle Helper: Cannot update request chronicle that is not running or finished or has existing res."],
      ["Request Chronicle Helper: Cannot log request chronicle that is not finished"],
      ["Request Chronicle Helper: Cannot add error to request chronicle that is not running or finished."],
      ["Request Chronicle Helper: Cannot add info to request chronicle that is not running or finished."],
    ]);
    expect((globalThis as any).sails.log.error.getCalls().map((c: any) => c.args)).to.deep.equal([]);

    (globalThis as any).sails.log.info.reset();
    (globalThis as any).sails.log.warn.reset();
    (globalThis as any).sails.log.error.reset();

    // running and not finished
    rc.start();

    rc.updateReq(req);
    rc.updateRes(res);
    rc.log(logger);
    rc.addError(error);
    rc.addInfo(info);

    expect(rc.data).to.deep.equal({
      "errors": [
        {
          "message": "My error",
          "name": "Error"
        }
      ],
      "req": {
        "hostname": undefined,
        "method": undefined,
        "path": undefined,
      },
      "res": {
        "statusCode": undefined,
      },
      "result": {
        "timestamp": "1970-01-01T00:00:00.000Z"
      },
      "myInfo": true,
    });

    expect((globalThis as any).sails.log.info.getCalls().map((c: any) => c.args)).to.deep.equal([]);
    expect((globalThis as any).sails.log.warn.getCalls().map((c: any) => c.args)).to.deep.equal([
      ["Request Chronicle Helper: Cannot log request chronicle that is not finished"],
    ]);
    expect((globalThis as any).sails.log.error.getCalls().map((c: any) => c.args)).to.deep.equal([]);

    (globalThis as any).sails.log.info.reset();
    (globalThis as any).sails.log.warn.reset();
    (globalThis as any).sails.log.error.reset();

    // not running and finished
    clock.tick(1000);
    rc.finish();

    rc.updateReq(req);
    rc.updateRes(res);
    rc.addError(error);
    rc.addInfo(info);

    expect(rc.data).to.deep.equal({
      "errors": [
        {
          "message": "My error",
          "name": "Error",
        }
      ],
      "req": {
        "hostname": undefined,
        "method": undefined,
        "path": undefined,
      },
      "res": {
        "statusCode": undefined,
      },
      "result": {
        "classification": "error",
        "durationMs": 1000,
        "outcome": "error",
        "timestamp": "1970-01-01T00:00:00.000Z",
      },
      "myInfo": true,
    });

    expect((globalThis as any).sails.log.info.getCalls().map((c: any) => c.args)).to.deep.equal([]);
    expect((globalThis as any).sails.log.warn.getCalls().map((c: any) => c.args)).to.deep.equal([
      ["Request Chronicle Helper: Cannot update request chronicle that is not running or finished or has existing req."],
      ["Request Chronicle Helper: Cannot update request chronicle that is not running or finished or has existing res."],
      ["Request Chronicle Helper: Cannot add error to request chronicle that is not running or finished."],
      ["Request Chronicle Helper: Cannot add info to request chronicle that is not running or finished."],
    ]);
    expect((globalThis as any).sails.log.error.getCalls().map((c: any) => c.args)).to.deep.equal([]);

    (globalThis as any).sails.log.info.reset();
    (globalThis as any).sails.log.warn.reset();
    (globalThis as any).sails.log.error.reset();

    // log result
    rc.log(logger);

    rc.updateReq(req);
    rc.updateRes(res);
    rc.addError(error);
    rc.addInfo(info);

    const expectedData = {
      "errors": [
        {
          "message": "My error",
          "name": "Error",
        }
      ],
      "req": {
        "hostname": undefined,
        "method": undefined,
        "path": undefined,
      },
      "res": {
        "statusCode": undefined,
      },
      "result": {
        "classification": "error",
        "durationMs": 1000,
        "outcome": "error",
        "timestamp": "1970-01-01T00:00:00.000Z",
      },
      "myInfo": true,
    }
    expect(rc.data).to.deep.equal(expectedData);

    expect((globalThis as any).sails.log.info.getCalls().map((c: any) => c.args)).to.deep.equal([]);
    expect((globalThis as any).sails.log.warn.getCalls().map((c: any) => c.args)).to.deep.equal([
      ["Request Chronicle Helper: Cannot update request chronicle that is not running or finished or has existing req."],
      ["Request Chronicle Helper: Cannot update request chronicle that is not running or finished or has existing res."],
      ["Request Chronicle Helper: Cannot add error to request chronicle that is not running or finished."],
      ["Request Chronicle Helper: Cannot add info to request chronicle that is not running or finished."],
    ]);
    expect((globalThis as any).sails.log.error.getCalls().map((c: any) => c.args)).to.deep.equal([
      [expectedData],
    ]);

    (globalThis as any).sails.log.info.reset();
    (globalThis as any).sails.log.warn.reset();
    (globalThis as any).sails.log.error.reset();
  });

  it('should log slow chronicle as expected', () => {
    const logger = (globalThis as any).sails.log as ILogger;
    const req = {} as unknown as Sails.Req;

    const rc = RequestChronicleHelper.fromReq(logger, req);
    rc.start();
    clock.tick(4000);
    rc.finish();
    rc.log(logger);

    expect((globalThis as any).sails.log.info.getCalls().map((c: any) => c.args)).to.deep.equal([]);
    expect((globalThis as any).sails.log.warn.getCalls().map((c: any) => c.args)).to.deep.equal([
      [
        {
          "result": {
            "classification": "slow",
            "durationMs": 4000,
            "outcome": "success",
            "timestamp": "1970-01-01T00:00:00.000Z",
          }
        }
      ]
    ]);
    expect((globalThis as any).sails.log.error.getCalls().map((c: any) => c.args)).to.deep.equal([]);

    (globalThis as any).sails.log.info.reset();
    (globalThis as any).sails.log.warn.reset();
    (globalThis as any).sails.log.error.reset();
  });

  it('should log sample chronicle as expected', () => {
    const logger = (globalThis as any).sails.log as ILogger;
    const req = {} as unknown as Sails.Req;

    const rc = RequestChronicleHelper.fromReq(logger, req);
    sinon.stub(rc as any, 'classify').returns("sample");

    rc.start();
    rc.finish();
    rc.log(logger);

    expect((globalThis as any).sails.log.info.getCalls().map((c: any) => c.args)).to.deep.equal([
      [
        {
          "result": {
            "classification": "sample",
            "durationMs": 0,
            "outcome": "success",
            "timestamp": "1970-01-01T00:00:00.000Z",
          }
        }
      ]
    ]);
    expect((globalThis as any).sails.log.warn.getCalls().map((c: any) => c.args)).to.deep.equal([]);
    expect((globalThis as any).sails.log.error.getCalls().map((c: any) => c.args)).to.deep.equal([]);

    (globalThis as any).sails.log.info.reset();
    (globalThis as any).sails.log.warn.reset();
    (globalThis as any).sails.log.error.reset();
  });
});
