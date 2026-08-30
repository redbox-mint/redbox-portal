import { strict as assert } from 'node:assert';

import { describe, it } from 'mocha';

// Load the transport-agnostic schema first to reproduce the service-before-route module order.
import '../../src/authorization/configuration-schema';
import { authorizationConfigurationDocumentSchema } from '../../src/api-routes/schemas/authorization';

describe('authorization schema module', () => {
  it('loads directly before the route barrel and preserves configuration validation', () => {
    assert.equal(
      authorizationConfigurationDocumentSchema.safeParse({
        schemaVersion: 1,
        templates: [
          {
            key: 'researcher',
            displayName: 'Researchers',
            description: 'Researcher template',
            protectedKind: 'none',
            status: 'active',
            version: 1,
            revisions: [{ revision: 1, scopeKeys: ['record.read'] }],
          },
        ],
        roles: [],
      }).success,
      true
    );
  });
});
