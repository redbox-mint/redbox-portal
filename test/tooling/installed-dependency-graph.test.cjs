'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {test} = require('node:test');
const verifier = path.resolve(__dirname, '../../packages/redbox-core/test/qualification/installed-dependency-graph.cjs');

for (const [label, packages, accepted] of [
  ['ordinary transitive dependency ranges', {'node_modules/example': {name:'example', version:'1.0.0', dependencies:{other:'^1.0.0'}}}, true],
  ['historical neutral package name', {'node_modules/@researchdatabox/sails-ng-common': {name:'@researchdatabox/sails-ng-common', version:'1.0.0'}}, true],
  ['nested retired runtime', {'node_modules/example/node_modules/waterline': {name:'waterline', version:'1.0.0'}}, false],
  ['scoped name outside the historical exemption', {'node_modules/@other/sails-ng-common': {name:'@other/sails-ng-common', version:'1.0.0'}}, false],
  ['forbidden optional edge even when not installed', {'node_modules/example': {name:'example', version:'1.0.0', optionalDependencies:{skipper:'1.0.0'}}}, false],
  ['forbidden peer edge', {'node_modules/example': {name:'example', version:'1.0.0', peerDependencies:{'sails':'1.0.0'}}}, false],
  ['hook-owned range', {'node_modules/redbox-hook-example': {name:'redbox-hook-example', version:'1.0.0', dependencies:{other:'^1.0.0'}}}, false],
]) {
  test(`installed dependency audit checks ${label}`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-installed-graph-'));
    try {
      const installed = {'': {name:'redbox-portal', version:'1.0.0'}, ...packages};
      // Every parent package must itself be an installed package for traversal.
      if (Object.keys(installed).some(name => name.includes('/example/node_modules/')))
        installed['node_modules/example'] = {name:'example', version:'1.0.0'};
      for (const [relative, pkg] of Object.entries(installed)) {
        const target = path.join(directory, relative);
        fs.mkdirSync(target, {recursive:true});
        fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify(pkg));
      }
      const result = spawnSync(process.execPath, [verifier], {cwd:directory, encoding:'utf8',
        env:{...process.env, SR_EXPECT_WSU:'false', SR_EXPECT_BUNDLED:'false'}});
      assert.equal(result.error, undefined);
      assert.equal(result.status === 0, accepted, result.stdout + result.stderr);
      if (accepted) assert.equal(JSON.parse(result.stdout).forbiddenPackages, 0);
      else assert.match(result.stderr, /AssertionError/);
    } finally {fs.rmSync(directory, {recursive:true, force:true});}
  });
}
