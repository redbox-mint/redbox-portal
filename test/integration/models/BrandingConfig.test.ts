import { fixtureCreate, fixturePatchOne } from '../../helpers/persistenceFixtures';
/* eslint-disable no-unused-expressions */
const chai = require('chai');

const { expect } = chai;


const invalidVariablePattern = /(Invalid|variables|scalar|Persistence)/i;
const invalidAttributesPattern = /(Invalid|variables|scalar|Persistence)/i;
/**
 * Common function to handle the validation rejection expectations.
 */
async function expectValidationRejection(promise, pattern) {
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
    const created = await fixtureCreate("BrandingConfig", { name: 'tenant-a', variables: {} });
    expect(created.variables).to.deep.equal({});
    expect(created.version).to.equal(0);
    expect(created.hash).to.equal('');
  });

  it('accepts whitelisted semantic variable keys', async () => {
    const created = await fixtureCreate("BrandingConfig", {
      name: 'tenant-b',
      variables: {
        'site-branding-area-background-color': '#ffffff',
        'panel-branding-color': '#000000',
        'primary': '#112233'
      }
    });
    expect(created.variables).to.have.keys([
      'site-branding-area-background-color',
      'panel-branding-color',
      'primary'
    ]);
  });

  it('rejects old raw color slot name (branding-color-N not allowed)', async () => {
    await expectValidationRejection(
      fixtureCreate("BrandingConfig", { name: 'tenant-c', variables: { 'branding-color-1': '#123456' } }),
      invalidVariablePattern
    );
  });

  it('rejects completely unknown key', async () => {
    await expectValidationRejection(
      fixtureCreate("BrandingConfig", { name: 'tenant-d', variables: { 'not-allowed-var': '#abcdef' } }),
      invalidVariablePattern
    );
  });

  it('rejects invalid variables type', async () => {
    await expectValidationRejection(
      fixtureCreate("BrandingConfig", { name: 'tenant-e', variables: ['site-branding-area-background'] }),
      invalidAttributesPattern
    );
  });

  it('update enforces whitelist', async () => {
    const created = await fixtureCreate("BrandingConfig", { name: 'tenant-f', variables: {} });
    await expectValidationRejection(
      fixturePatchOne("BrandingConfig", { id: created.id }, { variables: { 'branding-color-2': '#fff' } }),
      invalidAttributesPattern
    );
  });

  it('defaults draftRevision to 0 for new brands', async () => {
    const created = await fixtureCreate("BrandingConfig", { name: 'tenant-typeface-defaults', variables: {} });
    expect(created.draftRevision).to.equal(0);
  });

  it('persists draft typeface state alongside colours', async () => {
    const created = await fixtureCreate("BrandingConfig", { name: 'tenant-typeface-draft', variables: {} });
    const draftTypeface = { mode: 'custom', faces: {} };
    const updated = await fixturePatchOne("BrandingConfig", { id: created.id }, { draftTypeface, draftRevision: 1 });
    expect(updated.draftTypeface).to.deep.equal(draftTypeface);
    expect(updated.draftRevision).to.equal(1);
    expect(updated.typeface == null).to.equal(true);
  });
});
