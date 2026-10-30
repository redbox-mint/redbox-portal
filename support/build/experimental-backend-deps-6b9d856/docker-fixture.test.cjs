'use strict';
// Opt-in and offline. The caller must supply an ALREADY LOCAL image containing
// node, npm, bash and tar. No image pulls, registry writes or global cache prune.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const e = require('./prepare.cjs');
const image = process.env.BACKEND_DEPS_FIXTURE_IMAGE;
const run = (cmd, args, options = {}) => execFileSync(cmd, args, {
  encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 180000, ...options,
});
const write = (root, name, data, mode = 0o644) => {
  const dest = path.join(root, name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, data, { mode });
};
const load = root => {
  const files = new Map();
  const walk = rel => {
    for (const item of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const name = path.posix.join(rel, item.name);
      if (item.isDirectory()) walk(name);
      else files.set(name, { data: fs.readFileSync(path.join(root, name)),
        mode: fs.statSync(path.join(root, name)).mode & 0o111 ? '100755' : '100644' });
    }
  };
  walk('');
  return files;
};
const materialize = (root, files) => {
  fs.mkdirSync(root);
  for (const [name, file] of files) write(root, name, file.data, file.mode === '100755' ? 0o755 : 0o644);
};

test('offline Docker parity: real npm installs, lifecycle, local links/tarball, executable bins and warm source edit',
  { skip: !image && 'Set BACKEND_DEPS_FIXTURE_IMAGE to an already local Node image' }, () => {
    const imageId = run('docker', ['image', 'inspect', image, '--format', '{{.Id}}']).trim();
    assert.match(imageId, /^sha256:[a-f0-9]{64}$/);
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-deps-docker-'));
    const tags = [`backend-deps-fixture-${process.pid}:control`, `backend-deps-fixture-${process.pid}:split`];
    try {
      const repo = run('git', ['rev-parse', '--show-toplevel']).trim();
      const committed = e.readCommit(repo, e.BASELINE).files;
      const full = path.join(temp, 'full');
      fs.mkdirSync(full);
      for (const name of ['Dockerfile', '.dockerignore', '.npmrc']) write(full, name, committed.get(name).data);
      write(full, 'api/source.txt', 'first source\n');
      const dirs = [...e.INSTALL_DIRS.slice(1), 'packages/redbox-dev-tools'];
      const dependencies = {};
      for (const dir of dirs) {
        const name = `fixture-${path.basename(dir)}`;
        dependencies[name] = `file:${dir}`;
        const manifest = { name, version: '1.0.0' };
        if (dir.endsWith('/agenda-sqs-backend')) manifest.dependencies = { 'lifecycle-probe': 'file:../agenda-patched/probe.tgz' };
        if (dir.endsWith('/redbox-dev-tools')) manifest.bin = { 'fixture-cli': './bin/cli.js' };
        write(full, `${dir}/package.json`, JSON.stringify(manifest));
      }
      write(full, 'packages/redbox-dev-tools/bin/cli.js', '#!/usr/bin/env node\nconsole.log("fixture-bin-ok");\n', 0o644);
      write(full, 'package.json', JSON.stringify({ name: 'backend-deps-fixture', version: '1.0.0', dependencies }));
      const tarRoot = path.join(temp, 'tarball');
      const script = 'node -e "require(\'fs\').appendFileSync(process.env.INIT_CWD+\'/probe.log\',\'ran\\n\')"';
      write(tarRoot, 'package/package.json', JSON.stringify({ name: 'lifecycle-probe', version: '1.0.0', scripts: { install: script } }));
      fs.mkdirSync(path.join(full, 'packages/agenda-patched'));
      run('tar', ['-czf', path.join(full, 'packages/agenda-patched/probe.tgz'), '-C', tarRoot, 'package']);
      // tar follows the host umask (e.g. 0664); Git stores this input as 0644.
      fs.chmodSync(path.join(full, 'packages/agenda-patched/probe.tgz'), 0o644);
      // Generate real lockfiles using the same local image, with no networking.
      // --ignore-scripts is ONLY for creating synthetic fixtures, not builds.
      const locks = ['', ...dirs].map(dir =>
        `(cd /fixture/${dir} && npm install --package-lock-only --ignore-scripts --offline --no-audit --fund=false)`).join(' && ');
      run('docker', ['run', '--rm', '--network', 'none', '--user', '0:0', '-e', 'NODE_ENV=development',
        '-v', `${full}:/fixture`, '--workdir', '/fixture', '--entrypoint', 'bash', imageId, '-c', locks]);
      const parts = e.partition(load(full));
      const inputs = path.join(temp, 'inputs');
      const overlay = path.join(temp, 'overlay');
      materialize(inputs, parts.inputs);
      materialize(overlay, parts.overlay);
      // Use the actual transformed seven-command block. Only fixture toolchain
      // and workdir are substituted so this test cannot pull the production base.
      assert.match(image, /^[a-zA-Z0-9][a-zA-Z0-9./:@_-]*$/);
      const base = `FROM ${image} AS base\nUSER root\nENV NODE_ENV=development\nWORKDIR /backend-deps-fixture\nSHELL ["bash", "-o", "pipefail", "-c"]\n\n`;
      const original = committed.get('Dockerfile').data.toString();
      const installStart = original.indexOf('RUN npm ci --no-audit');
      const installEnd = original.indexOf('\n\nRUN cd packages/agenda-sqs-backend', installStart);
      const install = original.slice(installStart, installEnd);
      // Simulate npm's permitted lock rewrite; the overlay must retain it.
      const mutate = '\nRUN node -e "const fs=require(\'fs\');const p=JSON.parse(fs.readFileSync(\'package-lock.json\'));p.fixtureInstallState=true;fs.writeFileSync(\'package-lock.json\',JSON.stringify(p))"\n';
      const control = path.join(temp, 'Control.Dockerfile');
      const split = path.join(temp, 'Split.Dockerfile');
      fs.writeFileSync(control, base + 'FROM base AS builder\nCOPY . .\n' + install + mutate);
      let stage = parts.dockerfile.slice(parts.dockerfile.indexOf('FROM base AS backend_dependencies'));
      stage = stage.slice(0, stage.indexOf('\n\nRUN cd packages/agenda-sqs-backend'));
      stage = stage.replace('/opt/redbox-portal/', '/backend-deps-fixture/')
        .replace('\n\nFROM backend_dependencies', mutate + '\nFROM backend_dependencies');
      fs.writeFileSync(split, base + stage + '\n');
      const build = (dockerfile, context, tag, extra = []) => run('docker', ['buildx', 'build', '--builder', 'default',
        '--network', 'none', '--pull=false', '--progress', 'plain', '--load', '-f', dockerfile,
        '-t', tag, ...extra, context], { stdio: ['ignore', 'pipe', 'pipe'] });
      build(control, full, tags[0]);
      const splitArgs = ['--build-context', `backend_dependency_inputs=${inputs}`];
      build(split, overlay, tags[1], splitArgs);
      const snapshot = String.raw`
        const fs=require('fs'),path=require('path'),crypto=require('crypto');
        const root='/backend-deps-fixture', rows=[];
        const walk=p=>{for(const n of fs.readdirSync(path.join(root,p)).sort()){
          const name=path.posix.join(p,n),abs=path.join(root,name),s=fs.lstatSync(abs);
          if(s.isSymbolicLink())rows.push([name,'link',fs.readlinkSync(abs)]);
          else if(s.isDirectory())walk(name);
          else rows.push([name,s.mode&511,crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex')]);
        }};
        if(fs.existsSync(root+'/probe.log'))throw Error('root ignore-scripts was lost');
        if(fs.readFileSync(root+'/packages/agenda-sqs-backend/probe.log','utf8')!=='ran\n')throw Error('nested lifecycle did not run');
        if(!fs.lstatSync(root+'/node_modules/fixture-redbox-dev-tools').isSymbolicLink())throw Error('lost local link');
        fs.accessSync(root+'/node_modules/.bin/fixture-cli',fs.constants.X_OK);
        if(!JSON.parse(fs.readFileSync(root+'/package-lock.json')).fixtureInstallState)throw Error('overlay reverted lock');
        walk('');console.log(JSON.stringify({node:process.version,digest:crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex'),files:rows.length,rows}));
      `;
      const inspect = tag => JSON.parse(run('docker', ['run', '--rm', '--network', 'none', '--entrypoint', 'node', tag, '-e', snapshot]));
      const controlResult = inspect(tags[0]);
      const splitResult = inspect(tags[1]);
      assert.deepEqual(splitResult.rows, controlResult.rows);
      assert.equal(splitResult.digest, controlResult.digest);
      assert.equal(run('docker', ['run', '--rm', '--network', 'none', '--entrypoint', '/backend-deps-fixture/node_modules/.bin/fixture-cli', tags[1]]).trim(), 'fixture-bin-ok');

      // A real BuildKit hit after changing only excluded application source.
      write(overlay, 'api/source.txt', 'second source\n');
      // execFileSync returns stdout, while BuildKit's cache evidence is stderr.
      const { spawnSync } = require('node:child_process');
      const warm = spawnSync('docker', ['buildx', 'build', '--builder', 'default', '--network', 'none',
        '--pull=false', '--progress', 'plain', '--load', '-f', split, '-t', tags[1], ...splitArgs, overlay],
      { encoding: 'utf8', timeout: 180000 });
      assert.equal(warm.status, 0, warm.stderr);
      const log = warm.stdout + warm.stderr;
      const step = log.match(/#(\d+) \[backend_dependencies \d+\/\d+\] RUN npm ci --no-audit/);
      assert.ok(step, log);
      assert.match(log, new RegExp(`#${step[1]} CACHED`));
      assert.notEqual(inspect(tags[1]).digest, controlResult.digest);
      const { rows, ...summary } = controlResult;
      console.log(`Offline fixture parity: ${JSON.stringify(summary)}; input stage CACHED after source edit; image ${imageId}`);
    } catch (error) {
      if (error.stderr) console.error(error.stderr.toString());
      throw error;
    } finally {
      for (const tag of tags) {
        try { run('docker', ['image', 'rm', tag]); } catch { /* A failed build may not have produced a tag. */ }
      }
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

test('pinned ignore-policy model matches Docker COPY on representative root/nested paths',
  { skip: !image && 'Set BACKEND_DEPS_FIXTURE_IMAGE to an already local Node image' }, () => {
    const imageId = run('docker', ['image', 'inspect', image, '--format', '{{.Id}}']).trim();
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-deps-ignore-'));
    const tag = `backend-deps-fixture-${process.pid}:ignore`;
    try {
      const repo = run('git', ['rev-parse', '--show-toplevel']).trim();
      const files = e.readCommit(repo, e.BASELINE).files;
      const context = path.join(temp, 'context');
      fs.mkdirSync(context);
      write(context, '.dockerignore', files.get('.dockerignore').data);
      const names = ['root.log', 'nested/root.log', 'root.tgz', 'nested/root.tgz',
        'root.tsbuildinfo', 'nested/root.tsbuildinfo', '.tmp/a', 'nested/.tmp/a',
        'test/a', 'packages/example/test/a', 'support/development/a',
        'nested/support/development/a', 'dist/a', 'packages/example/dist/a',
        'node_modules/a', 'nested/node_modules/a', 'coverage/a', 'nested/coverage/a',
        '.angular/a', 'nested/.angular/a', 'packages/agenda-patched/agenda-6.2.6-redbox.1.tgz',
        'packages/agenda-patched/agenda-6.2.5-redbox.1.tgz', 'nested/.DS_Store', 'Thumbs.db'];
      for (const name of names) write(context, name, 'probe');
      const dockerfile = path.join(temp, 'Ignore.Dockerfile');
      assert.match(image, /^[a-zA-Z0-9][a-zA-Z0-9./:@_-]*$/);
      fs.writeFileSync(dockerfile, `FROM ${image}\nUSER root\nCOPY . /backend-deps-ignore-fixture/\n`);
      run('docker', ['buildx', 'build', '--builder', 'default', '--network', 'none', '--pull=false', '--load',
        '-f', dockerfile, '-t', tag, context], { stdio: ['ignore', 'pipe', 'pipe'] });
      const present = JSON.parse(run('docker', ['run', '--rm', '--network', 'none', '--entrypoint', 'node', tag, '-e',
        `console.log(JSON.stringify(${JSON.stringify(names)}.filter(p=>require('fs').existsSync('/backend-deps-ignore-fixture/'+p))))`]));
      assert.deepEqual(present, names.filter(name => !e.ignored(name)));
    } finally {
      try { run('docker', ['image', 'rm', tag]); } catch { /* failed build */ }
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
