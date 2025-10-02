/* eslint-disable no-unused-expressions */
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

const chaiAsPromisedPlugin = chaiAsPromised?.default || chaiAsPromised;

chai.use(chaiAsPromisedPlugin);

const { expect } = chai;

describe('BrandingConfig Model (semantic variables whitelist)', () => {
  it('creates with empty variables map (defaults)', async () => {
    const created = await BrandingConfig.create({ name: 'tenant-a', variables: {} }).fetch();
    expect(created.variables).to.deep.equal({});
    expect(created.version).to.equal(0);
    expect(created.hash).to.equal('');
  });

  it('accepts whitelisted semantic variable keys', async () => {
    const created = await BrandingConfig.create({
      name: 'tenant-b',
      variables: {
        'site-branding-area-background-color': '#ffffff',
        'panel-branding-color': '#000000',
        'branding-font-family': 'Arial, sans-serif'
      }
    }).fetch();
    expect(created.variables).to.have.keys([
      'site-branding-area-background-color',
      'panel-branding-color',
      'branding-font-family'
    ]);
  });

  it('rejects old raw color slot name (branding-color-N not allowed)', async () => {
    await expect(
      BrandingConfig.create({ name: 'tenant-c', variables: { 'branding-color-1': '#123456' } }).fetch()
    ).to.be.rejectedWith(Error, /Invalid (new record|variable key)|E_INVALID_NEW_RECORD/i);
  });

  it('rejects completely unknown key', async () => {
    await expect(
      BrandingConfig.create({ name: 'tenant-d', variables: { 'not-allowed-var': '#abcdef' } }).fetch()
    ).to.be.rejectedWith(Error, /Invalid (new record|variable key)|E_INVALID_NEW_RECORD/i);
  });

  it('rejects invalid variables type', async () => {
    await expect(
      BrandingConfig.create({ name: 'tenant-e', variables: ['site-branding-area-background'] }).fetch()
    ).to.be.rejectedWith(Error, /Invalid (new record|variable key|attributes)|E_INVALID_NEW_RECORD/i);
  });

  it('update enforces whitelist', async () => {
    const created = await BrandingConfig.create({ name: 'tenant-f', variables: {} }).fetch();
    await expect(
      BrandingConfig.updateOne({ id: created.id }).set({ variables: { 'branding-color-2': '#fff' } })
    ).to.be.rejectedWith(Error, /Invalid (new record|variable key|attributes)|E_INVALID_NEW_RECORD/i);
  });
});
