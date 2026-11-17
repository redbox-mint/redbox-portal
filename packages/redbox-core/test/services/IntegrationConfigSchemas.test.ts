import { expect } from 'chai';
import Ajv from 'ajv';
import { OniPublishing, ONI_PUBLISHING_SCHEMA } from '../../src/configmodels/OniPublishing';
import { RaidPublishing, RAID_PUBLISHING_SCHEMA } from '../../src/configmodels/RaidPublishing';
import { INTEGRATION_NOTIFICATION_SCHEMA } from '../../src/configmodels/IntegrationNotificationConfig';
import { raid } from '../../src/config/raid.config';
import { validateIntegrationConfig } from '../../src/configmodels/IntegrationConfigValidation';

const ajv = new Ajv({ strict: false, allErrors: true });

/** Every runtime default leaf must have a real schema, including dictionary and array values. */
function covered(schema: any, value: any, path = ''): void {
  if (schema && Object.keys(schema).length === 0) return; // Explicit arbitrary JSON editor.
  if (value === null || typeof value !== 'object') {
    expect(schema?.type || schema?.allOf || Object.keys(schema || {}).length === 0, path).to.be.ok;
    return;
  }
  if (Array.isArray(value)) {
    expect(schema.items, path).to.exist;
    value.forEach((item, index) => covered(schema.items, item, `${path}/${index}`));
  } else {
    for (const [key, item] of Object.entries(value)) {
      const node = schema.properties?.[key] || Object.entries(schema.patternProperties || {}).find(([pattern]) => new RegExp(pattern).test(key))?.[1] || schema.additionalProperties;
      expect(node, `${path}/${key}`).to.be.an('object');
      covered(node, item, `${path}/${key}`);
    }
  }
}

describe('Integration dictionary schemas', () => {
  const raidDefaults = { ...new RaidPublishing(), types: raid.types, mapping: raid.mapping };
  const defaults: [string, any, any][] = [
    ['oniPublishing', ONI_PUBLISHING_SCHEMA, new OniPublishing()],
    ['raidPublishing', RAID_PUBLISHING_SCHEMA, raidDefaults],
    ['integrationNotification', INTEGRATION_NOTIFICATION_SCHEMA, { enabled: false, statuses: ['failed'], recipients: [], perIntegration: { oni: { statuses: ['failed'], recipients: [], channels: [{ type: 'email', enabled: true, recipients: ['admin@example.test'], template: 'integration' }], throttle: { enabled: false, windowSeconds: 300 }, recoveryAlerts: false, recordUrlBase: '' } } }],
  ];
  for (const [key, schema, model] of defaults) {
    it(`${key}: runtime defaults validate and all their leaves are editable`, () => {
      const validate = ajv.compile(schema);
      expect(validate(model), JSON.stringify(validate.errors)).to.equal(true);
      covered(schema, model);
    });
    it(`${key}: preserves partial overrides and unknown nested values exactly`, () => {
      const value = JSON.parse(JSON.stringify(model));
      value.extension = { 'literal.key[0]': { future: [false, null, { x: 0 }] } };
      const original = JSON.stringify(value);
      validateIntegrationConfig(key, value);
      expect(JSON.stringify(value)).to.equal(original);
      expect(() => validateIntegrationConfig(key, {})).not.to.throw();
    });
  }
  it('rejects wrong value types at arbitrary dictionary depths without revealing values', () => {
    for (const [key, value] of [
      ['oniPublishing', { sites: { test: { storage: { diskName: 42 } } } }],
      ['raidPublishing', { mapping: { dmp: { title: { dest: 'title', engine: 'invalid-secret' } } } }],
      ['raidPublishing', { types: { contributor: { flags: { leader: 'bad' } } } }],
      ['integrationNotification', { perIntegration: { raid: { statuses: 42 } } }],
    ] as [string, object][]) {
      expect(() => validateIntegrationConfig(key, value)).to.throw('Invalid integration configuration');
    }
  });
});
