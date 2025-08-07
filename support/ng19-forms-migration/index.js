const config = require('./config');
const fs = require('fs');

const parseTabs = require('./parseTabs');
const parseTabFields = require('./parseTabFields');

const input = require('./test-only-dataRecord-1.0-draft.js');

const tabStructure = parseTabs(input);
const tabs = tabStructure.componentDefinitions[0].component.config.tabs;

const enrichedTabs = parseTabFields(tabs);

// Inject the processed tabs back
tabStructure.componentDefinitions[0].component.config.tabs = enrichedTabs;

fs.writeFileSync(`parseTabs.json`, JSON.stringify(tabStructure, null, 2));

console.log('=== done ===');