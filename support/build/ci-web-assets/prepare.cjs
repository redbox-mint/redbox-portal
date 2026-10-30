const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { buildEnv, check } = require('./identity.cjs');

// The webpack wrapper needs compiled core hooks/config, and Angular/client JS
// needs sails-ng-common. Core's type graph also needs Agenda, RAiD and RVA.
// No PDF/dev hook, Chromium, production pruning or runtime image preparation.
const STEPS = [
  ['.', 'npm', ['ci', '--include=dev', '--no-audit']],
  ...['agenda-sqs-backend', 'raido', 'rva-registry', 'sails-ng-common', 'redbox-core'].map(name =>
    [`packages/${name}`, 'npm', ['ci', '--include=dev', '--no-audit']]),
  ['packages/agenda-sqs-backend', 'npm', ['run', 'build']],
  ['packages/raido', 'npm', ['run', 'build']],
  ['packages/rva-registry', 'npm', ['run', 'build']],
  ['packages/sails-ng-common', 'npm', ['run', 'compile:clean']],
  ['packages/sails-ng-common', 'npm', ['run', 'compile']],
  ['packages/redbox-core', 'npm', ['run', 'build']],
  ['.', 'node_modules/.bin/tsc', ['--project', 'tsconfig.json']],
  ['.', 'bash', ['support/build/compileProductionAngular.sh']],
  ['.', 'npm', ['run', 'webpack']],
];

function installedTools(root, expected) {
  for (const [key, version] of Object.entries(expected)) {
    const separator = key.indexOf(':');
    const directory = key.slice(0, separator);
    const name = key.slice(separator + 1);
    const from = createRequire(path.join(root, directory, 'package.json'));
    // Some packages do not export package.json. Resolve their entry and walk to
    // their own manifest instead of depending on package export exceptions.
    let filename;
    try { filename = from.resolve(`${name}/package.json`); }
    catch {
      let current = path.dirname(from.resolve(name));
      while (true) {
        const candidate = path.join(current, 'package.json');
        if (fs.existsSync(candidate) && JSON.parse(fs.readFileSync(candidate)).name === name) {
          filename = candidate; break;
        }
        const parent = path.dirname(current);
        check(parent !== current, `Cannot resolve installed tool ${key}`);
        current = parent;
      }
    }
    check(JSON.parse(fs.readFileSync(filename)).version === version, `Installed tool differs from lock: ${key}`);
  }
}

function build(root, identity, run = spawnSync) {
  const env = buildEnv(identity.flags, identity.sourceDateEpoch);
  // The wrapper prefers this generated shim over compiled core configuration;
  // an old local shim can import unbuilt hooks or change the webpack graph.
  check(!fs.existsSync(path.join(root, 'config/webpack.js')) && !fs.existsSync(path.join(root, 'config/local.js')),
    'Use a fresh CI checkout: generated config/webpack.js or config/local.js would override build inputs');
  const ignoredAssets = require('node:child_process').execFileSync('git', ['-C', root,
    'ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', 'assets'], { encoding: 'utf8' })
    .split('\0').filter(Boolean);
  check(ignoredAssets.every(filename => filename.startsWith('assets/angular/') ||
    ['assets/default/default/js/client-script.js', 'assets/default/default/js/client-script.js.map'].includes(filename)),
  'Unexpected ignored asset inputs: use a fresh CI checkout');
  // These trees are the only web outputs. Clearing both prevents stale extra
  // applications/files from masquerading as outputs of this revision.
  for (const directory of ['assets/angular', '.tmp/public']) {
    fs.rmSync(path.join(root, directory), { recursive: true, force: true });
  }
  for (const [directory, command, args] of STEPS) {
    console.error(`web-assets build: ${directory}: ${command} ${args.join(' ')}`);
    // Keep stdout machine-readable for the final producer JSON receipt.
    const result = run(command, args, { cwd: path.join(root, directory), env, stdio: ['ignore', 2, 2] });
    if (result.error) throw result.error;
    check(result.status === 0, `Build failed: ${command} ${args.join(' ')} (exit ${result.status})`);
  }
  installedTools(root, identity.toolchain.tools);
}

module.exports = { build, STEPS, installedTools };
