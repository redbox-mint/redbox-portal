import { expect } from 'chai';
import { Services } from '../../src/CoreService';

class BaseReports extends Services.Core.Service {
  protected override _exportedMethods = ['bootstrapData', 'translate'];
  public bootstrapData() { return this.translate(); }
  public translate() { return 'base'; }
}

class HookReports extends BaseReports {
  public override translate() { return 'hook'; }
  public unlistedTestHelper() { return 'helper'; }
  public get unsafeGetter(): never { throw new Error('Getters must not be evaluated to enumerate test methods'); }
}

describe('CoreService exports for hook subclasses', () => {
  let originalMode: string | undefined;

  beforeEach(() => { originalMode = process.env.sails_redbox__mochaTesting; });
  afterEach(() => {
    if (originalMode === undefined) delete process.env.sails_redbox__mochaTesting;
    else process.env.sails_redbox__mochaTesting = originalMode;
  });

  function call(exports: Record<string, unknown>, name: string): unknown {
    const method = exports[name];
    if (typeof method !== 'function') throw new Error(`Missing exported method ${name}`);
    return method();
  }

  it('retains inherited bootstrap and the hook override in Mocha mode', () => {
    process.env.sails_redbox__mochaTesting = 'true';
    const methods = new HookReports().exports();
    expect(call(methods, 'bootstrapData')).to.equal('hook');
    expect(call(methods, 'unlistedTestHelper')).to.equal('helper');
    expect(Object.hasOwn(methods, 'hasOwnProperty')).to.equal(false);
    expect(Object.hasOwn(methods, 'constructor')).to.equal(false);
    expect(methods).not.to.have.property('unsafeGetter');
  });

  it('keeps the declared production export surface on hook subclasses', () => {
    delete process.env.sails_redbox__mochaTesting;
    const methods = new HookReports().exports();
    expect(call(methods, 'bootstrapData')).to.equal('hook');
    expect(methods).not.to.have.property('unlistedTestHelper');
    expect(methods).not.to.have.property('unsafeGetter');
  });
});
