/* eslint-disable no-unused-expressions */
const chai = require('chai');

const { expect } = chai;


const invalidVariablePattern = /(Invalid (new record|variable key)|E_INVALID_NEW_RECORD)/i;
const invalidAttributesPattern = /(Invalid (new record|variable key|attributes)|E_INVALID_NEW_RECORD|Cannot perform update)/i;
/**
 * Common function to handle the waterline rejection expectations.
 */
async function expectWaterlineRejection(promise, pattern) {
  let caught;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught, 'expected promise to reject').to.exist;
  const message = typeof caught?.message === 'string'
    ? caught.message
    : typeof caught?.code === 'string'
      ? caught.code
      : (() => {
          try {
            return JSON.stringify(caught);
          } catch (_err) {
            return String(caught);
          }
        })();
  expect(message).to.match(pattern);
}

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
    await expectWaterlineRejection(
      BrandingConfig.create({ name: 'tenant-c', variables: { 'branding-color-1': '#123456' } }).fetch(),
      invalidVariablePattern
    );
  });

  it('rejects completely unknown key', async () => {
    await expectWaterlineRejection(
      BrandingConfig.create({ name: 'tenant-d', variables: { 'not-allowed-var': '#abcdef' } }).fetch(),
      invalidVariablePattern
    );
  });

  it('rejects invalid variables type', async () => {
    await expectWaterlineRejection(
      BrandingConfig.create({ name: 'tenant-e', variables: ['site-branding-area-background'] }).fetch(),
      invalidAttributesPattern
    );
  });

  it('update enforces whitelist', async () => {
    const created = await BrandingConfig.create({ name: 'tenant-f', variables: {} }).fetch();
    await expectWaterlineRejection(
      BrandingConfig.updateOne({ id: created.id }).set({ variables: { 'branding-color-2': '#fff' } }),
      invalidAttributesPattern
    );
  });
});
