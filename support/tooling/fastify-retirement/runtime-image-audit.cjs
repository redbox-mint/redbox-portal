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
`;
function run(control) {
  const bootstrap = `
const fs = require('node:fs'), Module = require('node:module');
${control ? copyBuildTree : ''}
const auditor = new Module('/opt/redbox-portal/.runtime-inventory.cjs');
auditor.filename = '/opt/redbox-portal/.runtime-inventory.cjs';
auditor.paths = Module._nodeModulePaths('/opt/redbox-portal');
auditor._compile(fs.readFileSync(0, 'utf8'), auditor.filename);
const result = auditor.exports.auditRuntimeFilesystem('/', '/opt/redbox-portal');
console.log(JSON.stringify({control:${control},...result}, null, 2));
${
  control
    ? `
for (const name of ['@angular-devkit/build-angular','webpack-dev-server','express'])
  if (!result.violations.some(v => v.name === name)) throw new Error('Runtime negative control missed ' + name);
if (!result.violations.some(v => v.dependency === 'express' && v.file.endsWith('/webpack-dev-server/index.js')))
  throw new Error('Runtime negative control missed physical require site');
`
    : 'if (result.violations.length) process.exitCode = 1;'
}
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
      input: fs.readFileSync(path.join(__dirname, 'express-closure.cjs')),
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
