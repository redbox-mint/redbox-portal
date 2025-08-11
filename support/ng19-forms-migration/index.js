const config = require('./config');
const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const parseTabs = require('./parseTabs');
const { parseTabFields } = require('./parseTabFields');
const { parseFields } = require('./parseTabFields');

function processDataRecord(form) {

  let hasTabOrAccordion = false;
  if(!_.isUndefined(form.fields) && _.isArray(form.fields)) {
    hasTabOrAccordion = form.fields.some(f => f.class === 'TabOrAccordionContainer');
  }

  if (hasTabOrAccordion) {

    const topComponentDefinitions = [];
    for(let f of form.fields) {
      if(f.class === 'TabOrAccordionContainer') {
        //skip
      } else {
        let parsed = parseFields([f]);
        // console.log(`Parsed: ${JSON.stringify(parsed)}`);
        topComponentDefinitions.push(parsed[0]);
      }
    }

    // First level pass through in TabOrAccordionContainer
    const tabStructure = parseTabs(form);

    // Second pass through inner fields and its nested levels
    const tabs = tabStructure.componentDefinitions[0].component.config.tabs;
    const enrichedTabs = parseTabFields(tabs);

    // Inject the processed tabs back
    tabStructure.componentDefinitions[0].component.config.tabs = enrichedTabs;

    const componentDefinitions = topComponentDefinitions.concat(tabStructure.componentDefinitions);
    return {
     componentDefinitions: componentDefinitions
    };

  } else if(!_.isUndefined(form?.definition?.fields) && _.isArray(form?.definition?.fields)) {
    // No TabOrAccordionContainer — go straight to parsing fields
    return parseTabFields(form?.definition?.fields);

  } else if(_.isArray(form)) {
    let first = form[0];
    if(!_.isUndefined(first?.definition?.fields) && _.isArray(first?.definition?.fields)) {
      // No TabOrAccordionContainer — go straight to parsing fields
      return parseFields(first?.definition?.fields);

    } else {
      return {};
    }
  } else {
    return {};
  }
}

function processModulesFromDir(dirPath) {
  const files = fs.readdirSync(dirPath).filter(file => file.endsWith('.js'));

  files.forEach(file => {
    const fullPath = path.join(__dirname, dirPath + '/' +file);
    const input = require(fullPath);

    //Run the processing
    const output = processDataRecord(input);
    fs.writeFileSync(`${config.settings.outputFilesFolderPath}/parsed-${file}`, JSON.stringify(output, null, 2));

  });
}

processModulesFromDir(config.settings.inputFilesFolderPath);
console.log('=== done ===');