import { expect } from 'chai';
import * as sinon from 'sinon';
const { runWebpack } = require('../../../redbox-dev-tools/bin/wrapper-webpack.js');

describe('Explicit webpack build command', () => {
  let compiler: any, webpack: sinon.SinonStub, options: any, log: any;
  beforeEach(() => {
    compiler = { run: sinon.stub().callsFake(done => done(null, { toString: () => 'compiled', hasErrors: () => false })), close: sinon.stub().yields() };
    webpack = sinon.stub().returns(compiler);
    options = { config: [{ optimization: { minimize: false, concatenateModules: true } }] };
    log = { log: sinon.stub() };
  });
  afterEach(() => sinon.restore());
  for (const invalid of [undefined, {}, { config: [] }]) {
    it(`fails before acquiring a compiler for invalid configuration ${JSON.stringify(invalid)}`, async () => {
      try { await runWebpack(webpack, invalid, {}, log); expect.fail('Expected failure'); }
      catch (error) { expect(String(error)).to.contain('explicit nonempty config array'); }
      sinon.assert.notCalled(webpack);
    });
  }
  it('builds in development without an implicit runtime environment gate', async () => {
    await runWebpack(webpack, options, { NODE_ENV: 'development' }, log);
    sinon.assert.calledOnce(compiler.run); sinon.assert.calledOnce(compiler.close);
  });
  it('honors the explicit WEBPACK_SKIP command option', async () => {
    await runWebpack(webpack, options, { WEBPACK_SKIP: 'true' }, log);
    sinon.assert.notCalled(webpack);
  });
  for (const value of [undefined, 'false', '0', 'true']) {
    it(`sets CSS minification only for the explicit true option (${value})`, async () => {
      await runWebpack(webpack, options, { WEBPACK_CSS_MINI: value }, log);
      expect(webpack.firstCall.args[0][0].optimization).to.deep.equal({ minimize: value === 'true', concatenateModules: true });
      expect(options.config[0].optimization.minimize).to.equal(false);
    });
  }
  it('awaits compilation and closes the compiler on success', async () => {
    let done: any; compiler.run.callsFake(callback => { done = callback; });
    let settled = false; const work = runWebpack(webpack, options, {}, log).then(() => { settled = true; });
    await Promise.resolve(); expect(settled).to.equal(false); sinon.assert.notCalled(compiler.close);
    done(null, { toString: () => 'compiled', hasErrors: () => false }); await work;
    sinon.assert.calledOnce(compiler.close); sinon.assert.calledOnceWithExactly(log.log, 'compiled');
  });
  it('propagates a compiler error and closes the compiler', async () => {
    const error = new Error('compile failure'); compiler.run.yields(error);
    let caught: unknown; try { await runWebpack(webpack, options, {}, log); } catch (failure) { caught = failure; }
    expect(caught).to.equal(error); sinon.assert.calledOnce(compiler.close);
  });
  it('fails on compilation statistics errors and closes the compiler', async () => {
    compiler.run.yields(null, { toString: () => 'errors', hasErrors: () => true });
    try { await runWebpack(webpack, options, {}, log); expect.fail('Expected failure'); }
    catch (error) { expect(String(error)).to.contain('Webpack compilation failed'); }
    sinon.assert.calledOnce(compiler.close);
  });
  it('reports compiler cleanup failure', async () => {
    const error = new Error('close failure'); compiler.close.yields(error);
    let caught: unknown; try { await runWebpack(webpack, options, {}, log); } catch (failure) { caught = failure; }
    expect(caught).to.equal(error);
  });
});
