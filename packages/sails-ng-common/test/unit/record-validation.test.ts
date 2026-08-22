import { strict as assert } from 'node:assert';

import {
  sanitizeValidationOperationDiscovery,
} from '../../src/validation/record-validation.model';

describe('record validation discovery contracts', () => {
  it('projects hostile values onto bounded caller-authorized metadata', () => {
    const result = sanitizeValidationOperationDiscovery({
      name: ' submit ',
      label: ' Submit ',
      description: 'Send for review',
      allowedTargetSteps: ['review', 'private', '../invalid', 'review'],
      roles: ['Admin'],
      enabledValidationGroups: ['secret'],
      exceptionText: 'private failure',
    }, new Set(['review']));

    assert.deepEqual(result, {
      name: 'submit',
      label: 'Submit',
      description: 'Send for review',
      allowedTargetSteps: ['review'],
    });
    assert.equal(JSON.stringify(result).includes('secret'), false);
    assert.equal(JSON.stringify(result).includes('private failure'), false);
  });

  it('rejects malformed names and drops invalid display metadata', () => {
    assert.equal(sanitizeValidationOperationDiscovery({ name: 'bad operation' }), undefined);
    assert.deepEqual(sanitizeValidationOperationDiscovery({
      name: 'draft',
      label: 'x'.repeat(257),
      description: { raw: 'secret' },
    }), { name: 'draft' });
  });
});
