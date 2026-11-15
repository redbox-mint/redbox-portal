#!/usr/bin/env node
// Node via nvm. Run serially: timeout 2400 node support/integration-testing/qualify-fastify-packages.cjs
// Optional: FM039_OUTPUT (JSON/log receipts), FM039_SCRATCH_PARENT, FM039_SKIP_BUILD=1.
// FM039_CACHE may point at an externally managed cache; otherwise cleanup removes it.
// Docker, Tailscale and already installed build dependencies are required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const repo = path.resolve(__dirname, '../..');
const packages = [
  ['sails-ng-common', 'compile'],
  ['agenda-sqs-backend', 'build'],
  ['raido', 'build'],
  ['rva-registry', 'build'],
  ['redbox-core', 'build'],
  ['redbox-dev-tools', 'build'],
  ['sails-hook-redbox-storage-mongo', 'build'],
  ['sails-hook-redbox-pdfgen', 'compile'],
  ['redbox-hook-dev', 'build'],
];
const output = path.resolve(process.env.FM039_OUTPUT ?? path.join(repo, '.tmp/fastify-packed-results'));
fs.mkdirSync(output, { recursive: true });
const scratch = fs.mkdtempSync(path.join(process.env.FM039_SCRATCH_PARENT ?? os.homedir(), 'fm039-'));
assert(!scratch.startsWith(repo + path.sep), 'Consumer must be outside the checkout');
const tarballs = path.join(scratch, 'tarballs');
const author = path.join(scratch, 'author');
const consumer = path.join(scratch, 'consumer');
for (const directory of [tarballs, author, consumer]) fs.mkdirSync(directory);
const env = {
  ...process.env,
  NODE_PATH: '',
  NODE_OPTIONS: '',
  NODE_ENV: 'production',
  npm_config_cache: process.env.FM039_CACHE ?? path.join(scratch, 'cache'),
  npm_config_update_notifier: 'false',
  PUPPETEER_SKIP_DOWNLOAD: 'true',
  RBPORTAL_PLAYWRIGHT_SCENARIOS: 'false',
};
const containers = [];
const artifacts = [];
let sequence = 0;
function run(command, args, cwd = scratch, seconds = 300, extra = {}) {
  const start = new Date().toISOString();
  const label = `${String(++sequence).padStart(2, '0')}-${path.basename(command)}`;
  try {
    const result = execFileSync('timeout', ['--signal=TERM', '--kill-after=15', String(seconds), command, ...args], {
      cwd,
      env: { ...env, ...extra },
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    fs.writeFileSync(path.join(output, label + '.log'), result);
    fs.appendFileSync(
      path.join(output, 'commands.jsonl'),
      JSON.stringify({ command, args, cwd, seconds, start, end: new Date().toISOString(), exit: 0 }) + '\n'
    );
    return result;
  } catch (error) {
    fs.writeFileSync(path.join(output, label + '.log'), String(error.stdout ?? '') + String(error.stderr ?? ''));
    fs.appendFileSync(
      path.join(output, 'commands.jsonl'),
      JSON.stringify({
        command,
        args,
        cwd,
        seconds,
        start,
        end: new Date().toISOString(),
        exit: error.status,
        signal: error.signal,
      }) + '\n'
    );
    throw error;
  }
}
function pack(directory) {
  const item = JSON.parse(
    run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', tarballs], directory)
  )[0];
  assert(item.size < 15 * 1024 * 1024, 'Unexpectedly large tarball: ' + item.name);
  for (const file of item.files) {
    assert(
      !/(?:^|\/)(?:node_modules|test|tests|coverage|\.git|\.env)(?:\/|$)|\.(?:pem|key|tgz)$/.test(file.path),
      `${item.name}: unintended published file ${file.path}`
    );
    assert(!file.path.includes('app.express.cjs'), 'Private executable must not be published');
  }
  const filename = path.join(tarballs, item.filename);
  artifacts.push({ ...item, sha256: crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex') });
  fs.writeFileSync(path.join(output, 'tarballs.json'), JSON.stringify(artifacts, null, 2));
  return [item.name, 'file:' + filename];
}
function packCoreTypes() {
  // The backend publisher additionally ships this compatibility copy, merging
  // authoring dependencies into its runtime dependencies. Qualify that exact
  // metadata shape too, without copying source dependencies or rewriting it.
  const source = path.join(repo, 'packages/redbox-core');
  const target = path.join(scratch, 'redbox-core-types');
  fs.mkdirSync(target);
  for (const name of ['dist', 'types', 'bin', 'logfmt-transport.cjs'])
    fs.cpSync(path.join(source, name), path.join(target, name), { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  manifest.name = '@researchdatabox/redbox-core-types';
  manifest.dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  delete manifest.devDependencies;
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(output, 'core-types-manifest.json'), JSON.stringify(manifest, null, 2));
  return pack(target);
}
function writeManifest(directory, dependencies) {
  // Local monorepo file references are deliberately redirected to these exact
  // tarballs. Neither install may resolve a source directory or registry copy of
  // a first-party package; the installed lock and realpaths are audited below.
  const overrides = { ...require(path.join(repo, 'packages/redbox-core/package.json')).overrides };
  for (const name of Object.keys(dependencies)) overrides[name] = '$' + name;
  fs.writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify(
      {
        name: 'fm039-consumer',
        version: '1.0.0',
        private: true,
        dependencies: {
          ...dependencies,
          mongodb: '7.7.0',
          typescript: '5.9.3',
          '@types/node': '24.12.4',
          'import-meta-resolve': '4.2.0',
        },
        overrides,
      },
      null,
      2
    )
  );
}
const installArgs = [
  '--strict-peer-deps',
  '--prefer-offline',
  '--legacy-peer-deps=false',
  '--omit=dev',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
];
function install(directory) {
  run('npm', ['install', ...installArgs], directory, 900);
  fs.rmSync(path.join(directory, 'node_modules'), { recursive: true, force: true });
  run('npm', ['ci', '--offline', ...installArgs], directory, 600);
  const lock = JSON.parse(fs.readFileSync(path.join(directory, 'package-lock.json'), 'utf8'));
  for (const [name, record] of Object.entries(lock.packages)) {
    assert(!record.link, 'Workspace link in installed lock: ' + name);
    if (record.resolved?.startsWith('file:')) assert(record.resolved.endsWith('.tgz'), 'Directory dependency: ' + name);
  }
  fs.copyFileSync(
    path.join(directory, 'package-lock.json'),
    path.join(output, path.basename(directory) + '-lock.json')
  );
}
function compile(directory, args) {
  const listed = run(process.execPath, args, directory, 300);
  const project = directory.startsWith(author + path.sep) ? author : directory;
  for (const file of listed.split('\n').filter(line => /\.[cm]?ts$/.test(line))) {
    assert(file.startsWith(project + path.sep), 'Compiler escaped consumer: ' + file);
    if (file.includes('/node_modules/')) assert(/\.d\.[cm]?ts$/.test(file), 'Compiler used installed source: ' + file);
  }
}
function auditManifests() {
  function archivedManifests(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const file = path.join(directory, entry.name);
      if (
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        !['node_modules', 'dist', 'coverage'].includes(entry.name)
      )
        return archivedManifests(file);
      return entry.isFile() && entry.name === 'package.json' ? [path.relative(repo, file)] : [];
    });
  }
  const tracked = fs.existsSync(path.join(repo, '.git'))
    ? run('git', ['ls-files', '-z', 'package.json', '**/package.json'], repo).split('\0').filter(Boolean)
    : archivedManifests(repo);
  const repository = tracked.map(file => ({
    file,
    manifest: JSON.parse(fs.readFileSync(path.join(repo, file), 'utf8')),
  }));
  for (const { file, manifest } of repository)
    for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'])
      for (const [name, version] of Object.entries(manifest[key] ?? {}))
        assert(
          /^(?:\d+\.\d+\.\d+(?:-[\w.-]+)?|file:.+|workspace:.+|\.\.?\/.+)$/.test(version),
          `${file} ${key} ${name}: unpinned ${version}`
        );
  fs.writeFileSync(path.join(output, 'repository-manifests.json'), JSON.stringify(repository, null, 2));
  const manifests = packages.map(([folder]) => ({
    folder,
    ...require(path.join(repo, 'packages', folder, 'package.json')),
  }));
  for (const item of manifests) {
    assert(item.main && item.types, 'Missing runtime/type entrypoint: ' + item.name);
    assert(item.files?.length, 'No publish allowlist: ' + item.name);
    for (const key of ['dependencies', 'devDependencies', 'peerDependencies'])
      for (const [name, version] of Object.entries(item[key] ?? {}))
        assert(
          /^(?:\d+\.\d+\.\d+(?:-[\w.-]+)?|file:.+|workspace:.+)$/.test(version),
          `${item.name} ${key} ${name}: unpinned ${version}`
        );
  }
  fs.writeFileSync(path.join(output, 'manifests.json'), JSON.stringify(manifests, null, 2));
}
async function main() {
  assert.equal(process.version, 'v26.12.1');
  assert.equal(run('npm', ['--version']).trim(), '11.20.0');
  const dns = JSON.parse(run('tailscale', ['status', '--json'])).Self.DNSName.replace(/\.$/, '');
  assert(dns && dns !== 'localhost');
  const port = Number(process.env.FM039_HOST_PORT ?? 49141);
  const origin = `http://${dns}:${port}`;
  if (process.env.FM039_SKIP_BUILD !== '1')
    for (const [folder, script] of packages) run('npm', ['run', script], path.join(repo, 'packages', folder), 900);
  auditManifests();
  const dependencies = Object.fromEntries(packages.map(([folder]) => pack(path.join(repo, 'packages', folder))));
  const coreTypes = packCoreTypes();
  dependencies[coreTypes[0]] = coreTypes[1];
  const fixtures = Object.fromEntries(
    ['esm-only', 'esm-hook', 'commonjs-hook'].map(folder =>
      pack(path.join(repo, 'packages/redbox-core/test/extensions/fixtures', folder))
    )
  );
  writeManifest(author, { ...dependencies, ...fixtures });
  install(author);
  fs.copyFileSync(path.join(__dirname, 'packed-package-audit.cjs'), path.join(author, 'audit.cjs'));
  const audit = JSON.parse(run(process.execPath, ['audit.cjs'], author).trim());
  fs.writeFileSync(path.join(output, 'package-audit.json'), JSON.stringify(audit, null, 2));
  const control = path.join(author, 'node_modules/@researchdatabox/redbox-core/fm039-control');
  for (const [suffix, source] of [
    ['.js', "require('fm039-undeclared-runtime');"],
    ['.js', "require('../../outside-tarball');"],
    ['.d.ts', "export type Bad = import('express').Request;"],
  ]) {
    fs.writeFileSync(control + suffix, source);
    try {
      assert.throws(() => run(process.execPath, ['audit.cjs'], author), 'Audit accepted a negative control');
    } finally {
      fs.rmSync(control + suffix);
    }
  }
  const hook = path.join(author, 'hook');
  fs.mkdirSync(hook);
  const cli = path.join(author, 'node_modules/@researchdatabox/redbox-dev-tools/bin/cli.js');
  run(process.execPath, [cli, 'init', 'fm039', '--template', 'v6'], hook);
  run(
    process.execPath,
    [cli, '--root', hook, 'generate', 'controller', 'Held', '--public', '--routes', 'read:get:/hooks/fm039/hold'],
    hook
  );
  // No generated source/configuration edits, repository paths or TS paths mapping.
  compile(hook, [
    path.join(author, 'node_modules/typescript/bin/tsc'),
    '-p',
    'tsconfig.json',
    '--skipLibCheck',
    'false',
    '--listFiles',
  ]);
  const generated = pack(hook);
  fs.cpSync(hook, path.join(output, 'generated-hook'), { recursive: true });
  writeManifest(consumer, { ...dependencies, [generated[0]]: generated[1] });
  install(consumer);
  fs.copyFileSync(path.join(__dirname, 'packed-package-audit.cjs'), path.join(consumer, 'audit.cjs'));
  const installedAudit = JSON.parse(run(process.execPath, ['audit.cjs'], consumer).trim());
  fs.copyFileSync(path.join(__dirname, 'packed-fastify-consumer.ts'), path.join(consumer, 'verify.ts'));
  fs.writeFileSync(
    path.join(consumer, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2024',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        skipLibCheck: false,
        esModuleInterop: true,
        types: ['node'],
        outDir: 'compiled',
      },
      files: [
        'verify.ts',
        ...installedAudit.packages.flatMap(item =>
          item.declarations.map(file => path.join('node_modules', item.name, file))
        ),
      ],
    })
  );
  compile(consumer, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json', '--listFiles']);
  const mongoImage = 'mongo:9.0.4@sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8';
  const solrImage = 'solr:10.0.0@sha256:b866a82ef3a0a16ed25005731dd0c5d87541b70783a14a2392ecfa12810541cb';
  const mongoPort = Number(process.env.FM039_MONGO_PORT ?? 49139);
  const solrPort = Number(process.env.FM039_SOLR_PORT ?? 49140);
  for (const [name, args] of [
    [
      `fm039-mongo-${process.pid}`,
      [
        '--memory=1536m',
        '--cpus=0.5',
        '--ulimit',
        'nofile=64000:64000',
        '-p',
        `127.0.0.1:${mongoPort}:27017`,
        mongoImage,
        '--wiredTigerCacheSizeGB',
        '0.25',
        '--setParameter',
        'enableTestCommands=1',
      ],
    ],
    [
      `fm039-solr-${process.pid}`,
      [
        '--memory=1g',
        '--cpus=0.5',
        '-e',
        'SOLR_HEAP=512m',
        '-p',
        `127.0.0.1:${solrPort}:8983`,
        solrImage,
        'solr-precreate',
        'redbox',
      ],
    ],
  ]) {
    containers.push(name);
    run('docker', ['run', '--pull=never', '-d', '--name', name, ...args], scratch, 120);
    fs.writeFileSync(path.join(output, name + '.json'), run('docker', ['inspect', name]));
  }
  const result = run(
    process.execPath,
    ['--test', '--test-reporter=tap', '--test-force-exit', 'compiled/verify.js'],
    consumer,
    360,
    {
      FM039_ORIGIN: origin,
      FM039_MONGO_URL: `mongodb://127.0.0.1:${mongoPort}/fm039_packed`,
      FM039_SOLR_PORT: String(solrPort),
      REDBOX_PUBLIC_URL: origin,
    }
  );
  fs.writeFileSync(path.join(output, 'consumer-result.tap'), result);
  fs.writeFileSync(
    path.join(output, 'result.json'),
    JSON.stringify(
      {
        node: process.version,
        origin,
        packages: artifacts.map(item => ({
          name: item.name,
          sha256: item.sha256,
          files: item.entryCount,
          size: item.size,
        })),
        audit,
        strictInstalledDeclarations: true,
        freshGeneratedHook: true,
        productionFastify: true,
        restart: true,
        retryableDrain: true,
        passing: 1,
        failing: 0,
        pending: 0,
      },
      null,
      2
    )
  );
  console.log(result);
}
function cleanup() {
  for (const name of containers.splice(0).reverse()) {
    try {
      run('docker', ['rm', '-f', '-v', name], scratch, 120);
    } catch (error) {
      console.error(error.stack ?? error);
      process.exitCode = 1;
    }
  }
  fs.rmSync(scratch, { recursive: true, force: true });
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    cleanup();
    process.exit(1);
  });
main()
  .catch(error => {
    console.error(error.stack ?? error);
    process.exitCode = 1;
  })
  .finally(cleanup);
