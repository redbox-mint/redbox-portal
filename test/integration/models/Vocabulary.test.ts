/* eslint-disable no-unused-expressions */
const chai = require('chai');
const { expect } = chai;

declare const Vocabulary: any;
declare const VocabularyEntry: any;

describe('Vocabulary Models', () => {
  it('creates local vocab with auto-generated slug', async () => {
    const created = await Vocabulary.create({
      name: 'My Test Vocabulary',
      branding: 'default'
    }).fetch();

    expect(created.slug).to.equal('my-test-vocabulary');
    expect(created.type).to.equal('flat');
    expect(created.source).to.equal('local');
  });

  it('rejects invalid vocabulary type', async () => {
    try {
      await Vocabulary.create({
        name: `Bad Type ${Date.now()}`,
        branding: 'default',
        type: 'invalid-type'
      }).fetch();
      expect.fail('expected invalid type to fail');
    } catch (err) {
      expect(String(err.message || err)).to.match(/Vocabulary.type must be one of/i);
    }
  });

  it('requires sourceId when source=rva', async () => {
    try {
      await Vocabulary.create({
        name: `RVA Missing SourceId ${Date.now()}`,
        branding: 'default',
        source: 'rva'
      }).fetch();
      expect.fail('expected missing sourceId to fail');
    } catch (err) {
      expect(String(err.message || err)).to.match(/sourceId is required/i);
    }
  });

  it('normalizes labelLower/valueLower for entries', async () => {
    const vocab = await Vocabulary.create({ name: `Entry Norm ${Date.now()}`, branding: 'default' }).fetch();
    const entry = await VocabularyEntry.create({
      vocabulary: vocab.id,
      label: 'Science',
      value: 'HTTP://EXAMPLE.ORG/SCI'
    }).fetch();

    expect(entry.labelLower).to.equal('science');
    expect(entry.valueLower).to.equal('http://example.org/sci');
    expect(entry.historical === true).to.equal(false);
  });
});
