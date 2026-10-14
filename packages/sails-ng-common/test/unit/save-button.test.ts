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
    };
    const config = Object.assign(new SaveButtonFieldComponentConfig(), frame);

    assert.equal(config.operation, 'submit');
    assert.equal(config.targetStep, 'review');
    assert.deepEqual(config.enabledValidationGroups, ['all', 'submit-for-review']);
  });

  it('keeps operation optional for existing buttons', function () {
    const frame: SaveButtonFieldComponentConfigFrame = {
      enabledValidationGroups: ['all'],
    };
    const config = Object.assign(new SaveButtonFieldComponentConfig(), frame);

    assert.equal(config.operation, undefined);
    assert.deepEqual(config.enabledValidationGroups, ['all']);
  });
});
