const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
require('ts-node').register({ skipProject: true, transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { createPlaywrightScenarios, getPlaywrightScenario } = require('../../packages/redbox-hook-dev/src/playwright/catalogue.ts');
const { buildScenarioRegistration } = require('../../packages/redbox-hook-dev/src/playwright/builders.ts');

test('catalogue objects and generated form graphs are independent between consumers', () => {
  const first = createPlaywrightScenarios(); const second = createPlaywrightScenarios();
  const original = JSON.stringify(second);
  first[0].initialMetadata.title = 'mutated fixture';
  assert.equal(JSON.stringify(second), original);
  const a = buildScenarioRegistration(second); const b = buildScenarioRegistration(second);
  const form = Object.keys(a.forms)[0]; a.forms[form].componentDefinitions.length = 0;
  assert.ok(b.forms[form].componentDefinitions.length > 0);
  a.recordtype['e2e-initialisation-modes'].searchFilters[0].name = 'mutated registration';
  assert.equal(b.recordtype['e2e-initialisation-modes'].searchFilters[0].name, 'text_title');
  assert.equal(second[0].recordTypeOverrides.searchFilters[0].name, 'text_title');
  assert.equal(Object.keys(b.recordtype).length, 30);
  const lookup = getPlaywrightScenario('initialisation-modes');
  lookup.recordTypeOverrides.searchFilters[0].name = 'changed filter';
  assert.equal(getPlaywrightScenario('initialisation-modes').recordTypeOverrides.searchFilters[0].name, 'text_title');
});
test('generated-name collisions and broken override references fail registration', () => {
  const scenario = createPlaywrightScenarios()[0];
  assert.throws(() => buildScenarioRegistration([scenario, { ...scenario, id: scenario.id.toUpperCase() }]), /Duplicate generated/);
  assert.throws(() => buildScenarioRegistration([{ ...scenario, workflowOverrides: { config: { form: 'missing-form' } } }]), /broken form reference/);
  assert.throws(() => buildScenarioRegistration([{ ...scenario, workflowOverrides: { starting: false } }]), /exactly one starting/);
});
test('fresh registration processes require both the exact opt-in flag and an allowed environment', () => {
  const modulePath = path.resolve('packages/redbox-hook-dev/src/playwright/registration.ts');
  const code = `require('ts-node').register({skipProject:true,transpileOnly:true,compilerOptions:{module:'commonjs',moduleResolution:'node'}});
const registration=require(${JSON.stringify(modulePath)}).getPlaywrightRegistration();
console.log(JSON.stringify({scenarios:Object.keys(registration.recordtype).filter(k=>k.startsWith('e2e-')).length,demo:!!registration.recordtype.rdmp}));`;
  for (const [environment, flag, expected] of [['development','true',30], ['integrationtest','true',30], ['integrationtest','false',0], ['development','',0], ['production','true',0]]) {
    const output = execFileSync(process.execPath, ['-e', code], { env: { ...process.env, NODE_ENV: environment, RBPORTAL_PLAYWRIGHT_SCENARIOS: flag }, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(output), { scenarios: expected, demo: true });
  }
});
