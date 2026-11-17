import { expect } from 'chai';
import * as sinon from 'sinon';

describe('Translation import body parser', () => {
  let oldSails: any;
  let httpPath: string;
  let skipperPath: string;
  let oldHttp: any;
  let oldSkipper: any;
  let options: any;
  let parserError: any;
  let http: any;
  beforeEach(() => {
    oldSails = (global as any).sails;
    (global as any).sails = { config: { custom: { bodyParser: { skipPaths: {} } } } };
    httpPath = require.resolve('../../src/config/http.config');
    skipperPath = require.resolve('skipper');
    require(skipperPath);
    oldHttp = require.cache[httpPath];
    oldSkipper = require.cache[skipperPath].exports;
    parserError = undefined;
    require.cache[skipperPath].exports = (input: any) => {
      options = input;
      return (_req: any, _res: any, next: any) => next(parserError);
    };
    delete require.cache[httpPath];
    http = require(httpPath).http;
  });
  afterEach(() => {
    (global as any).sails = oldSails;
    require.cache[skipperPath].exports = oldSkipper;
    if (oldHttp) require.cache[httpPath] = oldHttp;
    else delete require.cache[httpPath];
    sinon.restore();
  });
  function run(path: string) {
    const next = sinon.stub();
    const res = { status: sinon.stub(), json: sinon.stub() };
    res.status.returns(res);
    http.middleware.myBodyParser({ originalUrl: path, url: path }, res, next);
    return { next, res };
  }
  it('allows the escaped import envelope while retaining limits on other routes', () => {
    for (const action of ['preview', 'apply']) {
      const { next } = run('/default/rdmp/admin/translation/en/translation/import/' + action);
      expect(options.limit).to.equal(5 * 1024 * 1024);
      expect(next.calledOnce).to.equal(true);
    }
    run('/default/rdmp/app/i18n/bundles/en/translation');
    expect(options.limit).to.equal(undefined);
  });
  for (const status of [400, 413]) {
    it(`returns a safe ${status} for import parser failures without forwarding the raw body`, () => {
      parserError = Object.assign(new Error('SECRET RAW JSON'), { status, body: 'SECRET RAW JSON' });
      const { next, res } = run('/default/rdmp/admin/translation/en/translation/import/preview');
      expect(res.status.calledWith(status)).to.equal(true);
      expect(JSON.stringify(res.json.firstCall.args)).not.to.contain('SECRET');
      expect(next.called).to.equal(false);
    });
  }
});
