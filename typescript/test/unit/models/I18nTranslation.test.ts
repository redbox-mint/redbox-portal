/* eslint-disable no-unused-expressions */
const chai = require('chai');
const { expect } = chai;

declare var I18nTranslation: any;

describe('I18nTranslation Model', () => {

  it('should create a translation with a valid string value', async () => {
    const translation = await I18nTranslation.create({
      key: 'test.valid.string',
      value: 'Valid String',
      locale: 'en',
      namespace: 'test'
    }).fetch();
    expect(translation.value).to.equal('Valid String');
  });

  it('should create a translation with an empty string value', async () => {
    const translation = await I18nTranslation.create({
      key: 'test.empty.string',
      value: '',
      locale: 'en',
      namespace: 'test'
    }).fetch();
    expect(translation.value).to.equal('');
  });

  it('should create a translation with a structured object value', async () => {
    const objValue = { foo: 'bar', baz: 123 };
    const translation = await I18nTranslation.create({
      key: 'test.object.value',
      value: objValue,
      locale: 'en',
      namespace: 'test'
    }).fetch();
    expect(translation.value).to.deep.equal(objValue);
  });

  it('should fail to create a translation with a null value', async () => {
    try {
      await I18nTranslation.create({
        key: 'test.null.value',
        value: null,
        locale: 'en',
        namespace: 'test'
      }).fetch();
      expect.fail('Should have thrown an error');
    } catch (err) {
      expect(err.code).to.equal('E_INVALID_NEW_RECORD');
    }
  });

  it('should fail to create a translation when value is missing (undefined)', async () => {
    try {
      await I18nTranslation.create({
        key: 'test.missing.value',
        // value is omitted
        locale: 'en',
        namespace: 'test'
      }).fetch();
      expect.fail('Should have thrown an error');
    } catch (err) {
      expect(err.code).to.equal('E_INVALID_NEW_RECORD');
    }
  });
});
