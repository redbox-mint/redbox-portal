const { expect } = require('chai');

describe('storage-mongo hook exports', function () {
  this.timeout(10000);

  it('registers models, services, and config from the package entrypoint', function () {
    const hook = require('../src');

    expect(hook.registerRedboxModels()).to.have.keys(['Record', 'DeletedRecord', 'RecordAudit', 'IntegrationAudit']);
    expect(hook.registerRedboxServices()).to.have.property('MongoStorageService');
    expect(hook.ServiceExports).to.have.property('MongoStorageService');
    expect(hook.registerRedboxConfig()).to.deep.equal({
      storage: require('../src/config/storage').storage,
      record: require('../src/config/record').record,
    });
  });

  it('returns a no-op hook definition without mergeHookConfig side effects', function () {
    const hookFactory = require('../src');
    const hook = hookFactory({ services: { configservice: { mergeHookConfig: () => undefined } } });

    expect(hook).to.have.property('initialize');
    expect(hook).to.have.nested.property('routes.before');
    expect(hook).to.have.nested.property('routes.after');
  });
});
