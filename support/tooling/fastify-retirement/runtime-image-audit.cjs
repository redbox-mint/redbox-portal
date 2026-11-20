'use strict';
// Feed the checked-in auditor to Node in the production image. The normal pass
// is read-only and has no application/tooling mounts. The separate control uses
// a disposable writable container overlay to copy the reviewer's invisible
// standalone Angular install into that same image.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const image = process.argv[2];
if (!image) throw new Error('Provide the built production runtime image');
const dependenciesOnly = process.argv.includes('--dependencies-only');
const copyBuildTree = `
const path = require('node:path');
const buildRoot = '/opt/redbox-portal/angular/node_modules';
for (const [name, pkg] of Object.entries({
  '@angular-devkit/build-angular': {version:'22.2.0',dependencies:{'webpack-dev-server':'6.0.0'}},
  'webpack-dev-server': {version:'6.0.0',dependencies:{express:'5.3.0'}},
  express: {version:'5.3.0'},
})) {
  const directory = path.join(buildRoot, name);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({name,...pkg}));
}
fs.writeFileSync(path.join(buildRoot, 'webpack-dev-server/index.js'), "module.exports = require('express');");
const lockPath = '/opt/redbox-portal/package-lock.json';
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const workspace = 'packages/fm044-control';
const workspaceLink = 'node_modules/fm044-control';
const writePackage = (key, entry) => {
  const directory = path.join('/opt/redbox-portal', key);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(entry));
  lock.packages[key] = entry;
};
lock.packages[''].dependencies['fm044-control'] = 'file:' + workspace;
const manifestPath = '/opt/redbox-portal/package.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.dependencies['fm044-control'] = 'file:' + workspace;
manifest.overrides['fm044-control'] = {'fm044-overridden-peer':'2.0.0', 'fm044-wrong-override':'2.0.0'};
fs.writeFileSync(manifestPath, JSON.stringify(manifest));
lock.packages[workspaceLink] = {link: true, resolved: workspace};
writePackage(workspace, {name:'fm044-control', version:'1.0.0',
  optionalDependencies: {'fm044-optional-parent':'1.0.0'},
  peerDependencies: {'fm044-incompatible-peer':'^3.3.0', 'fm044-overridden-peer':'^1.0.0', 'fm044-wrong-override':'^1.0.0'},
  peerDependenciesMeta: {
    'fm044-incompatible-peer':{optional:true}, 'fm044-overridden-peer':{optional:true}, 'fm044-wrong-override':{optional:true}
  }});
fs.symlinkSync('../' + workspace, '/opt/redbox-portal/' + workspaceLink);
writePackage(workspace + '/node_modules/fm044-dev', {name:'fm044-dev', version:'1.0.0', dev:true});
writePackage(workspace + '/node_modules/fm044-dev-optional',
  {name:'fm044-dev-optional', version:'1.0.0', devOptional:true});
writePackage(workspace + '/node_modules/fm044-optional-parent',
  {name:'fm044-optional-parent', version:'1.0.0', optional:true, dependencies:{'fm044-optional-child':'1.0.0'}});
writePackage(workspace + '/node_modules/fm044-optional-child',
  {name:'fm044-optional-child', version:'1.0.0', devOptional:true});
writePackage('node_modules/fm044-incompatible-peer', {name:'fm044-incompatible-peer', version:'4.0.3',
  devOptional:true, dependencies:{'fm044-incompatible-child':'^4.0.1'}});
writePackage('node_modules/fm044-incompatible-child', {name:'fm044-incompatible-child', version:'4.1.2', devOptional:true});
writePackage('node_modules/fm044-overridden-peer', {name:'fm044-overridden-peer', version:'2.0.0', devOptional:true});
writePackage('node_modules/fm044-wrong-override', {name:'fm044-wrong-override', version:'1.0.0', devOptional:true});
writePackage(workspace + '/node_modules/fm044-alias-dev', {name:'fm044-alias-dev', version:'1.0.0'});
lock.packages[workspaceLink + '/node_modules/fm044-alias-dev'] = {version:'1.0.0', dev:true};
writePackage('packages/redbox-dev-tools', {name:'@researchdatabox/redbox-dev-tools', version:'4.5.1', dev:true});
fs.writeFileSync(lockPath, JSON.stringify(lock));
`;
function run(control) {
  const bootstrap = `
const fs = require('node:fs'), Module = require('node:module');
${control ? copyBuildTree : ''}
const sources = JSON.parse(fs.readFileSync(0, 'utf8'));
function load(name) {
  const filename = '/opt/redbox-portal/' + name + '.cjs';
  const auditor = new Module(filename);
  auditor.filename = filename;
  auditor.paths = Module._nodeModulePaths('/opt/redbox-portal');
  auditor._compile(sources[name], filename);
  return auditor.exports;
}
async function main() {
const result = ${dependenciesOnly} ? {violations: []} :
  load('express-closure').auditRuntimeFilesystem('/', '/opt/redbox-portal');
const developmentDependencies = await load('runtime-dependencies').auditRuntimeDependencies('/', '/opt/redbox-portal');
console.log(JSON.stringify({control:${control},...result,developmentDependencies}, null, 2));
${
  control
    ? `
if (!${dependenciesOnly}) {
for (const name of ['@angular-devkit/build-angular','webpack-dev-server','express'])
  if (!result.violations.some(v => v.name === name)) throw new Error('Runtime negative control missed ' + name);
if (!result.violations.some(v => v.dependency === 'express' && v.file.endsWith('/webpack-dev-server/index.js')))
  throw new Error('Runtime negative control missed physical require site');
}
const flags = developmentDependencies.violations;
for (const [name, reason] of [['fm044-dev','dev'], ['fm044-alias-dev','dev'], ['fm044-dev-optional','devOptional'],
  ['fm044-incompatible-peer','devOptional'], ['fm044-incompatible-child','devOptional'], ['fm044-wrong-override','devOptional'],
  ['@researchdatabox/redbox-dev-tools','dev'], ['@angular-devkit/build-angular','build/test tooling']])
  if (!flags.some(v => v.name === name && v.reason === reason)) throw new Error('Runtime negative control missed ' + name);
for (const name of ['fm044-optional-child', 'fm044-overridden-peer'])
  if (flags.some(v => v.name === name)) throw new Error('An optional production dependency was rejected: ' + name);
`
    : 'if (result.violations.length || developmentDependencies.violations.length) process.exitCode = 1;'
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
`;
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--pull=never',
      ...(control ? [] : ['--read-only']),
      '--network',
      'none',
      '--memory',
      '3g',
      '--cpus',
      '1',
      '--user',
      '0:0',
      '-i',
      '--entrypoint',
      'node',
      image,
      '-e',
      bootstrap,
    ],
    {
      input: JSON.stringify(
        Object.fromEntries(
          ['express-closure', 'runtime-dependencies'].map(name => [
            name,
            fs.readFileSync(path.join(__dirname, name + '.cjs'), 'utf8'),
          ])
        )
      ),
      timeout: 540000,
      maxBuffer: 64 * 1024 * 1024,
    }
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  return result.status ?? 1;
}
const status = run(false);
process.exitCode = status || (process.argv.includes('--negative-control') ? run(true) : 0);
