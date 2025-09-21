/* eslint-disable no-unused-expressions */
const { expect } = require('chai');

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
    let error;
    try {
      await BrandingConfig.create({ name: 'tenant-c', variables: { 'branding-color-1': '#123456' } }).fetch();
    } catch (e) { error = e; }
    expect(error).to.exist;
  // Waterline wraps our custom error; just assert it is a validation failure without depending on message text
  expect(String(error.message || error)).to.match(/Invalid new record|Invalid variable key|E_INVALID_NEW_RECORD/i);
  });

  it('rejects completely unknown key', async () => {
    let error;
    try {
      await BrandingConfig.create({ name: 'tenant-d', variables: { 'not-allowed-var': '#abcdef' } }).fetch();
    } catch (e) { error = e; }
    expect(error).to.exist;
  });

  it('rejects invalid variables type', async () => {
    let error;
    try {
      await BrandingConfig.create({ name: 'tenant-e', variables: ['site-branding-area-background'] }).fetch();
    } catch (e) { error = e; }
    expect(error).to.exist;
  });

  it('update enforces whitelist', async () => {
    const created = await BrandingConfig.create({ name: 'tenant-f', variables: {} }).fetch();
    let error;
    try {
      await BrandingConfig.updateOne({ id: created.id }).set({ variables: { 'branding-color-2': '#fff' } });
    } catch (e) { error = e; }
    expect(error).to.exist;
  });
});
