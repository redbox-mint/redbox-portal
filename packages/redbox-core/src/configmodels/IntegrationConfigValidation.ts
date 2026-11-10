import Ajv from 'ajv';
import { ONI_PUBLISHING_SCHEMA } from './OniPublishing';
import { RAID_PUBLISHING_SCHEMA } from './RaidPublishing';
import { INTEGRATION_NOTIFICATION_SCHEMA } from './IntegrationNotificationConfig';

const ajv = new Ajv({ strict: false, allErrors: false, useDefaults: false, coerceTypes: false, removeAdditional: false });
const validators = Object.fromEntries(Object.entries({
  oniPublishing: ONI_PUBLISHING_SCHEMA,
  raidPublishing: RAID_PUBLISHING_SCHEMA,
  integrationNotification: INTEGRATION_NOTIFICATION_SCHEMA,
}).map(([key, schema]) => [key, ajv.compile({ ...schema, required: [] })]));

/** Saved overrides may be partial. Validate supplied values without filling defaults or pruning extensions. */
export function validateIntegrationConfig(key: string, value: unknown): void {
  if (validators[key] && !validators[key](value)) {
    // Values and detailed AJV errors can contain credentials; never include them in errors or logs.
    throw Object.assign(new Error('Invalid integration configuration'), { status: 400 });
  }
}
