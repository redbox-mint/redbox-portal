const assert = require('node:assert/strict');
const fieldComponentMap = require('./fieldComponentMap');

const draft = fieldComponentMap.SaveButton({ definition: { name: 'save', disableWhenInvalid: false } });
const submit = fieldComponentMap.SaveButton({ definition: { name: 'submit', disableWhenPristine: true } });
const forceDraft = fieldComponentMap.SaveButton({ definition: { name: 'force-save', disableWhenPristine: false } });
assert.equal(draft.component.config.disableWhenInvalid, false);
assert.equal('disableWhenPristine' in draft.component.config, false);
assert.equal('disableWhenInvalid' in submit.component.config, false);
assert.equal(submit.component.config.disableWhenPristine, true);
assert.equal(forceDraft.component.config.disableWhenPristine, false);

const definition = {
  name: 'workspace',
  open: '@open-workspace',
  saveFirst: '@save-first',
  displayType: 'cards',
  shouldSaveForm: false,
  allowAddTemplate: '<%= imports.rdmp ? "true" : "false" %>',
  defaultSelection: [{ name: 'gitlab', label: 'GitLab' }],
};
const migrated = fieldComponentMap.WorkspaceSelectorComponent({ definition });

assert.equal(migrated.component.class, 'WorkspaceSelectorComponent');
assert.equal('layout' in migrated, false);
assert.equal('model' in migrated, false);
assert.deepEqual(migrated.component.config, {
  open: '@open-workspace',
  saveFirst: '@save-first',
  displayType: 'cards',
  shouldSaveForm: false,
  allowAddTemplate: '<%= imports.rdmp ? "true" : "false" %>',
  defaultSelection: [{ name: 'gitlab', label: 'GitLab' }],
});
