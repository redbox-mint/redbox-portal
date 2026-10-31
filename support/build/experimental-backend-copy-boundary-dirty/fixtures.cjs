'use strict';
// Synthetic input only. No production dependency graph is installed by tests.
const fs = require('node:fs');
const path = require('node:path');
const e = require('./prepare.cjs');
const file = (data, mode = 0o644) => ({ type: 'file', mode, data: Buffer.from(data) });
function fixture() {
  const files = new Map([
    ['Dockerfile', file(fs.readFileSync(path.join(__dirname, 'audited/Dockerfile')))],
    ['.dockerignore', file(fs.readFileSync(path.join(__dirname, 'audited/dockerignore')))],
    ['.npmrc', file('ignore-scripts=true\nstrict-peer-deps=true\nsave-exact=true\n')],
    ['.npmignore', file('/ignored-by-packing\n')],
    ['api/source.txt', file('source-one\n')],
    ['typescript/source.ts', file('// source-one\n')],
    ['angular/source.ts', file('// web-one\n')],
    ['assets/angular/host-output.js', file('excluded host output')],
    ['support/integration-testing/fixture.txt', file('retained integration context')],
    ['test/fixture.txt', file('retained test context')],
    ['packages/redbox-dev-tools/bin/cli.js', file('#!/usr/bin/env node\nconsole.log("fixture-bin-ok");\n', 0o644)],
    ['packages/agenda-patched/agenda-6.2.6-redbox.1.tgz', file('placeholder (replaced by offline fixture)')],
    ['packages/raido/.npmignore', file('/ignored-by-packing\n')],
    ['packages/raido/source.txt', file('package-one\n', 0o640)],
    ['packages/raido/dist/host.js', file('excluded host output')],
  ]);
  for (const dir of [...e.INSTALL_DIRS, 'packages/redbox-dev-tools']) {
    const prefix = dir ? `${dir}/` : '';
    const manifest = { name: dir ? `fixture-${path.basename(dir)}` : 'fixture-root', version: '1.0.0' };
    if (dir.endsWith('/redbox-dev-tools')) manifest.bin = { 'fixture-cli': 'bin/cli.js' };
    files.set(`${prefix}package.json`, file(JSON.stringify(manifest)));
    files.set(`${prefix}package-lock.json`, file(JSON.stringify({ name: manifest.name, version: '1.0.0',
      lockfileVersion: 3, packages: { '': { name: manifest.name, version: '1.0.0' } } })));
  }
  // Keep explicit empty directories and directory modes in the synthetic context.
  files.set('packages/raido/empty', { type: 'directory', mode: 0o750 });
  for (const name of [...files.keys()]) {
    let parent = path.posix.dirname(name);
    while (parent !== '.') {
      if (!files.has(parent)) files.set(parent, { type: 'directory', mode: 0o755 });
      parent = path.posix.dirname(parent);
    }
  }
  return files;
}
function replace(files, name, data, mode = files.get(name)?.mode ?? 0o644) {
  const result = new Map(files);
  result.set(name, file(data, mode));
  return result;
}
function editJson(files, name, edit) {
  const json = JSON.parse(files.get(name).data);
  edit(json);
  return replace(files, name, JSON.stringify(json));
}
module.exports = { file, fixture, replace, editJson };
