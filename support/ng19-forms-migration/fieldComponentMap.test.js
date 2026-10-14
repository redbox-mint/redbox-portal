const assert = require('node:assert/strict');
const fieldComponentMap = require('./fieldComponentMap');

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
