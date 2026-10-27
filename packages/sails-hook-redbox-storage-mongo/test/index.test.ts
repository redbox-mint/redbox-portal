const { expect } = require('chai');

describe('storage-mongo extension exports', function () {
  it('registers the storage module, migration and configuration from the package entrypoint', () => {
    const extension = require('../src').registerRedboxExtension();
    expect(extension.apiVersion).to.equal(1);
    expect(extension.modules.map((module: any) => module.name)).to.deep.equal(['storage']);
    expect(extension.migrations).to.have.length(1);
    expect(extension.config).to.deep.equal({
      storage: { serviceName: require('../src/config/storage').storage.serviceName },
      record: require('../src/config/record').record,
    });
  });
  it('constructs an offline declaration without installing process handlers or merging configuration', () => {
    const before = process.listeners('SIGTERM');
    const hook = require('../src');
    expect(hook.registerRedboxExtension().modules[0].create).to.be.a('function');
    expect(hook.registerRedboxServices).to.equal(undefined);
    expect(process.listeners('SIGTERM')).to.deep.equal(before);
  });
});
