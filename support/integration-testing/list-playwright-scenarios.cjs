#!/usr/bin/env node
'use strict';
const catalogue = require('./playwright-catalogue.cjs');
const base = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${process.env.RBPORTAL_PLAYWRIGHT_PORT || 1500}`;
const scenarios = catalogue.scenarios.map(scenario => {
  const names = catalogue.namesForScenario(scenario.id);
  return { id: scenario.id, description: scenario.description, ...names,
    editUrl: `${base}/default/rdmp/record/${names.recordType}/edit`,
    viewUrlTemplate: `${base}/default/rdmp/record/view/<oid>`,
    initialMetadata: scenario.initialMetadata,
  };
});
if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(scenarios, null, 2)}\n`);
else
  for (const scenario of scenarios)
    process.stdout.write(
      `${scenario.id}\t${scenario.description}\n  edit: ${scenario.editUrl}\n  view:  ${scenario.viewUrlTemplate}\n`
    );
