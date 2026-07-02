/* eslint-disable no-unused-expressions */
const chai = require('chai');
const { expect } = chai;

declare const Vocabulary: any;
declare const VocabularyEntry: any;

describe('Vocabulary Models', () => {
  it('creates local vocab with normalized explicit slug', async () => {
    const created = await Vocabulary.create({
      name: 'My Test Vocabulary',
      slug: `My Test Vocabulary ${Date.now()}`,
      branding: 'default'
    }).fetch();

    expect(created.slug).to.match(/^my-test-vocabulary/);
    expect(created.type).to.equal('flat');
    expect(created.source).to.equal('local');
  });

  it('rejects invalid vocabulary type', async () => {
    try {
      await Vocabulary.create({
        name: `Bad Type ${Date.now()}`,
        slug: `bad-type-${Date.now()}`,
        branding: 'default',
        type: 'invalid-type'
      }).fetch();
      expect.fail('expected invalid type to fail');
    } catch (err) {
      expect(String(err.message || err)).to.match(/Vocabulary.type must be one of/i);
    }
  });

  it('sets rvaSourceKey when source=rva and sourceId is provided', async () => {
    const created = await Vocabulary.create({
      name: `RVA With SourceId ${Date.now()}`,
      slug: `rva-with-sourceid-${Date.now()}`,
      branding: 'default',
      source: 'rva',
      sourceId: '316'
    }).fetch();

    expect(created.source).to.equal('rva');
    expect(created.sourceId).to.equal('316');
    expect(created.rvaSourceKey).to.equal('rva:316');
  });

  it('normalizes labelLower/valueLower for entries', async () => {
    const vocab = await Vocabulary.create({
      name: `Entry Norm ${Date.now()}`,
      slug: `entry-norm-${Date.now()}`,
      branding: 'default'
    }).fetch();
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
