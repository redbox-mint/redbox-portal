import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import {
  encodeConfiguration,
  decodeConfiguration,
  configurationFields,
  type ConfigurationCollection,
} from '../../src/persistence/configuration/physical';
import { namedQueryFieldType } from '../../src/persistence/reference/NamedQueryExecution';
import {
  initializeConfigurationPersistence,
  getConfigurationRepositories,
} from '../../src/persistence/configuration/runtime';
import { cleanupPersistence } from '../../src/persistence/runtime';

describe('configuration persistence boundaries', () => {
  const brand = '012345678901234567890123';
  it('refuses fixture-only fields in configuration writes and named-query predicates', () => {
    for (const collection of Object.keys(configurationFields) as ConfigurationCollection[]) {
      for (const field of ['syntheticUnknown', 'institutionUnknown', 'extension', 'unknown']) {
        assert.throws(() => encodeConfiguration(collection, { [field]: 'fixture' }, true), /Undeclared Q field/);
        assert.throws(() => namedQueryFieldType(field, configurationFields[collection]), /Unsupported named-query/);
      }
    }
    assert.throws(
      () =>
        encodeConfiguration('appconfig', {
          branding: brand,
          configKey: 'fixture',
          syntheticUnknown: 'fixture',
        }),
      /Undeclared Q field/
    );
  });
  it('preserves submitted-field UID callbacks on every partial-update combination', () => {
    for (const patch of [{ value: '' }, { key: 'new' }, { locale: 'fr' }, { branding: brand, value: 'v' }])
      assert.equal(encodeConfiguration('i18ntranslation', patch, true).uid, undefined);
    assert.equal(
      encodeConfiguration('i18ntranslation', { locale: 'fr', key: 'new' }, true).uid,
      'global:fr:translation:new'
    );
    assert.equal(
      encodeConfiguration('i18ntranslation', { branding: brand, locale: 'fr', key: 'new', namespace: '' }, true).uid,
      `${brand}:fr:translation:new`
    );
    assert.equal(encodeConfiguration('i18nbundle', { locale: 'fr', branding: brand }, true).uid, undefined);
    assert.equal(encodeConfiguration('i18nbundle', { locale: 'en', data: {} }).uid, 'global:en:translation');
  });
  it('accepts empty translation values and rejects null/missing creates and null patches', () => {
    assert.equal(encodeConfiguration('i18ntranslation', { locale: 'en', key: 'x', value: '' }).value, '');
    for (const value of [null, undefined])
      assert.throws(() => encodeConfiguration('i18ntranslation', { locale: 'en', key: 'x', value }));
    assert.throws(() => encodeConfiguration('i18ntranslation', { value: null }, true));
  });
  it('keeps dashboard branding strings, Q association BSON private and unknown JSON intact', () => {
    const row = encodeConfiguration('i18ntranslation', { branding: brand, locale: 'en', key: 'x', value: false });
    assert(row.branding instanceof ObjectId);
    const decoded = decodeConfiguration<Record<string, unknown>>('i18ntranslation', {
      ...row,
      _id: new ObjectId(),
      extra: { keep: true },
    })!;
    assert.equal(decoded.branding, brand);
    assert.deepEqual(decoded.extra, { keep: true });
    assert.equal(
      encodeConfiguration('dashboardconfiguration', { branding: brand, revision: 1, configData: {} }).branding,
      brand
    );
    assert.throws(() => decodeConfiguration('appconfig', { _id: new ObjectId(), data: new Date() }), /plain JSON/);
    assert.throws(
      () => decodeConfiguration('appconfig', { _id: new ObjectId(), branding: brand }),
      /physical relationship/
    );
  });
  it('refuses non-JSON configuration members without invoking accessors', () => {
    let reads = 0;
    const accessor = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get() {
        reads++;
        return 'must not read';
      },
    });
    for (const configData of [accessor, { [Symbol('hidden')]: 'value' }, Object.assign([], { extra: true })])
      assert.throws(() => encodeConfiguration('appconfig', { branding: brand, configKey: 'x', configData }));
    assert.throws(() => encodeConfiguration('appconfig', accessor));
    assert.equal(reads, 0);
  });
});
