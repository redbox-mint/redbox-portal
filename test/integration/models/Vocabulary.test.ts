import { fixtureCreate } from '../../helpers/persistenceFixtures';
/* eslint-disable no-unused-expressions */
const chai = require('chai');
const { expect } = chai;


describe('Vocabulary Models', () => {
  it('creates local vocab with auto-generated slug', async () => {
    const created = await fixtureCreate("Vocabulary", {
      name: 'My Test Vocabulary',
      branding: 'default'
    });

    expect(created.slug).to.equal('my-test-vocabulary');
    expect(created.type).to.equal('flat');
    expect(created.source).to.equal('local');
  });

  it('rejects invalid vocabulary type', async () => {
    try {
      await fixtureCreate("Vocabulary", {
        name: `Bad Type ${Date.now()}`,
        branding: 'default',
        type: 'invalid-type'
      });
      expect.fail('expected invalid type to fail');
    } catch (err) {
      expect(String(err.message || err)).to.match(/Vocabulary.type must be one of/i);
    }
  });

  it('requires sourceId when source=rva', async () => {
    try {
      await fixtureCreate("Vocabulary", {
        name: `RVA Missing SourceId ${Date.now()}`,
        branding: 'default',
        source: 'rva'
      });
      expect.fail('expected missing sourceId to fail');
    } catch (err) {
      expect(String(err.message || err)).to.match(/sourceId is required/i);
    }
  });

  it('normalizes labelLower/valueLower for entries', async () => {
    const vocab = await fixtureCreate("Vocabulary", { name: `Entry Norm ${Date.now()}`, branding: 'default' });
    const entry = await fixtureCreate("VocabularyEntry", {
      vocabulary: vocab.id,
      label: 'Science',
      value: 'HTTP://EXAMPLE.ORG/SCI'
    });

    expect(entry.labelLower).to.equal('science');
    expect(entry.valueLower).to.equal('http://example.org/sci');
    expect(entry.historical === true).to.equal(false);
  });
});
