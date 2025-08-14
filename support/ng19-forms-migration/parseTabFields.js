const fieldComponentMap = require('./fieldComponentMap');
const config = require('./config');
const _ = require('lodash');

function parseFields(fields) {
  return fields.map(field => {
    let mapper;

    // Step 1: Decide which mapper to use
    if ((field.class === 'Container' || field.class === 'RepeatableContributor' || field.class === 'SelectionField' ||
         field.class === 'RepeatableContainer' || field.class === 'RepeatableVocab' || field.class === 'NotInFormField' ||
         field.class === 'WorkspaceSelectorField') && field.compClass) {
      mapper = fieldComponentMap[field.compClass];
    } else {
      mapper = fieldComponentMap[field.class];
    }

    let parsedField;
    if (mapper) {
      parsedField = mapper(field);
    } else {
      if (!config.settings.skipUnparsablefields) {
        parsedField = {
          class: 'Unparsable Component: ' + field.class,
          originalField: field
        };
      } else {
        parsedField = { class: 'Unparsable Component: ' + field.class };
      }
    }

    // Step 2: Recursively parse nested fields if they exist
    if (!_.isUndefined(field?.definition?.fields) && _.isArray(field?.definition?.fields)) {
      // console.log(JSON.stringify(field));
      parsedField.componentDefinitions = parseFields(field.definition.fields);
    }

    return parsedField;
  });
}

function parseTabFields(tabs) {
  return tabs.map(tab => ({
    ...tab,
    componentDefinitions: parseFields(tab.componentDefinitions)
  }));
}

module.exports = {
  parseTabFields,
  parseFields
};
