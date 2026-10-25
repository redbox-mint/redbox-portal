import { strict as assert } from 'node:assert';

import {
  SaveButtonFieldComponentConfig,
  SaveButtonFieldComponentConfigFrame,
} from '../../src';

describe('save-button validation operation contract', function () {
  it('retains operation intent alongside legacy client validation groups', function () {
    const frame: SaveButtonFieldComponentConfigFrame = {
      operation: 'submit',
      targetStep: 'review',
      enabledValidationGroups: ['all', 'submit-for-review'],
      allowValidationAttempt: true,
    };
    const config = Object.assign(new SaveButtonFieldComponentConfig(), frame);

    assert.equal(config.operation, 'submit');
    assert.equal(config.targetStep, 'review');
    assert.deepEqual(config.enabledValidationGroups, ['all', 'submit-for-review']);
    assert.equal(config.allowValidationAttempt, true);
    assert.equal(config.forceSave, undefined);
  });

  it('keeps operation optional for existing buttons', function () {
    const frame: SaveButtonFieldComponentConfigFrame = {
      enabledValidationGroups: ['all'],
    };
    const config = Object.assign(new SaveButtonFieldComponentConfig(), frame);

    assert.equal(config.operation, undefined);
    assert.equal(config.allowValidationAttempt, undefined);
    assert.deepEqual(config.enabledValidationGroups, ['all']);
  });
});
