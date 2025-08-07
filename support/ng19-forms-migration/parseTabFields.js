const fieldComponentMap = require('./fieldComponentMap');
const config = require('./config');

module.exports = function parseTabFields(tabs) {
  return tabs.map(tab => ({
    ...tab,
    componentDefinitions: tab.componentDefinitions.map(field => {
      
      let mapper;

      // Case 1: field.class === 'Container' and has a compClass
      if (field.class === 'Container' && field.compClass) {
        mapper = fieldComponentMap[field.compClass];
      } else {
        // Default: use field.class
        mapper = fieldComponentMap[field.class];
      }

      if (mapper) {
        return mapper(field);
      }

      if(!config.config.skipUnparsablefields) {
        // fallback if class is unknown
        return {
            class: 'Unparsable Component: '+field.class,
            originalField: field
        };
      } else {
        return {};
      }

    })
  }));
};
