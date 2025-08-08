const fieldComponentMap = require('./fieldComponentMap');
const config = require('./config');

function parseFields(fields) {
  return fields.map(field => {
    let mapper;

    // Step 1: Decide which mapper to use
    if (field.class === 'Container' && field.compClass) {
      mapper = fieldComponentMap[field.compClass];
    } else {
      mapper = fieldComponentMap[field.class];
    }

    let parsedField;
    if (mapper) {
      parsedField = mapper(field);
    } else {
      if (!config.config.skipUnparsablefields) {
        parsedField = {
          class: 'Unparsable Component: ' + field.class,
          originalField: field
        };
      } else {
        parsedField = {};
      }
    }

    // Step 2: Recursively parse nested fields if they exist
    if (field.definition?.fields && Array.isArray(field.definition.fields)) {
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
