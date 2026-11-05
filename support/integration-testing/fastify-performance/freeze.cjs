'use strict';
// Freeze the already-built current Express tree; this is not a release-image qualifier.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { hash, protocol, cells } = require('./protocol.cjs');
const root = path.resolve(__dirname, '../../..');
const destination = path.resolve(process.env.FM007_ARTIFACTS || '/home/ubuntu/work/fm007-artifacts');
const evidence = path.join(root, 'support/specs/fastify-migration/evidence/FM-007-data');
function command(args, seconds, includeStderr = false) {
  const result = spawnSync('timeout', [String(seconds), ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: seconds * 1000 + 2000,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  return (result.stdout + (includeStderr ? result.stderr : '')).trim();
}
async function main() {
  assert.equal(process.version, 'v26.12.1');
  assert.equal(command(['docker', 'ps', '-q', '--filter', 'name=^fm007-portal$'], 10), '', 'freeze between owners');
  fs.mkdirSync(destination, { recursive: true });
  fs.mkdirSync(evidence, { recursive: true });
  const baseImage = 'sha256:9e87833133322a9d4e9bf7baf64b6d17e2a15598b05706b07c917fffce833cd7';
  assert.equal(
    command(['docker', 'image', 'inspect', '-f', '{{.Id}}', 'redbox-current-overlay-validation:mocha-fixed'], 10),
    baseImage
  );
  const context = fs.mkdtempSync(path.join(destination, 'build-'));
  const snapshot = path.join(context, 'snapshot');
  fs.mkdirSync(snapshot);
  try {
    for (const name of [
      'node_modules',
      'packages',
      'assets',
      'views',
      'config',
      'bootstrap-data',
      'language-defaults',
      'api',
      '.tmp/public',
      'app.express.cjs',
      'app.js',
      'package.json',
      'package-lock.json',
      '.nvmrc',
      '.npmrc',
      'support/integration-testing/fastify-performance',
    ]) {
      const target = path.join(snapshot, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      console.log(`copy ${name}`);
      command(['cp', '-a', '--no-preserve=ownership', '--reflink=auto', path.join(root, name), target], 300);
    }
    const locks = {},
      harness = {},
      installed = [];
    for (const name of command(['git', 'ls-files', '*package-lock.json'], 10).split('\n'))
      locks[name] = hash(fs.readFileSync(path.join(root, name)));
    for (const name of fs.readdirSync(__dirname))
      if (fs.statSync(path.join(__dirname, name)).isFile())
        harness[name] = hash(fs.readFileSync(path.join(__dirname, name)));
    function scan(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) scan(full);
        else if (entry.name === 'package.json') {
          try {
            const body = JSON.parse(fs.readFileSync(full));
            if (body.name && body.version)
              installed.push({
                path: path.relative(snapshot, full),
                name: body.name,
                version: body.version,
                sha256: hash(fs.readFileSync(full)),
              });
          } catch {}
        }
      }
    }
    scan(path.join(snapshot, 'node_modules'));
    scan(path.join(snapshot, 'packages'));
    fs.writeFileSync(path.join(evidence, 'installed-packages.json'), JSON.stringify(installed, null, 2) + '\n');
    fs.copyFileSync(path.join(__dirname, 'Dockerfile'), path.join(context, 'Dockerfile'));
    console.log('build immutable overlay');
    const build = command(
      ['docker', 'build', '--pull=false', '--network=none', '-t', 'fm007-express:baseline', context],
      1800,
      true
    );
    assert.equal(
      command(['docker', 'image', 'inspect', '-f', '{{.Id}}', 'redbox-current-overlay-validation:mocha-fixed'], 10),
      baseImage
    );
    fs.writeFileSync(path.join(evidence, 'image-build.log'), build + '\n');
    const image = command(['docker', 'image', 'inspect', '-f', '{{.Id}}', 'fm007-express:baseline'], 10);
    fs.writeFileSync(
      path.join(evidence, 'express-image.json'),
      command(['docker', 'image', 'inspect', image], 10) + '\n'
    );
    const archive = path.join(destination, 'express-image.tar.gz');
    assert(!fs.existsSync(archive), 'do not overwrite a retained artifact');
    console.log('save image archive');
    const save = spawnSync(
      'timeout',
      ['600', 'bash', '-o', 'pipefail', '-c', 'docker image save "$1" | gzip -1 > "$2"', 'fm007-save', image, archive],
      { encoding: 'utf8', timeout: 602000 }
    );
    assert.equal(save.status, 0, save.stderr);
    const digest = createHash('sha256');
    for await (const chunk of fs.createReadStream(archive)) digest.update(chunk);
    const identity = {
      capturedUtc: new Date().toISOString(),
      sourceHead: command(['git', 'rev-parse', 'HEAD'], 10),
      sourceTree: command(['git', 'rev-parse', 'HEAD^{tree}'], 10),
      base: 'f7ebc45fb5b7c837b66dd309e879f89b87065f7e',
      trackedDiff: command(['git', 'diff', '--name-only'], 10),
      locks,
      harness,
      protocol,
      cells,
      node: process.version,
      npm: command(['npm', '--version'], 10),
      image,
      baseImage,
      archive,
      archiveBytes: fs.statSync(archive).size,
      archiveSha256: digest.digest('hex'),
      installedManifestSha256: hash(fs.readFileSync(path.join(evidence, 'installed-packages.json'))),
      host: command(['uname', '-a'], 10),
      cpu: command(['lscpu'], 10),
      disk: command(['df', '-B1', destination], 10),
      memory: fs.readFileSync('/proc/meminfo', 'utf8'),
      processes: command(['ps', '-eo', 'pid,ppid,comm,pcpu,pmem'], 10),
      clockTicksPerSecond: Number(command(['getconf', 'CLK_TCK'], 10)),
    };
    fs.writeFileSync(path.join(evidence, 'artifact.json'), JSON.stringify(identity, null, 2) + '\n');
    console.log(JSON.stringify({ image, archive, sha256: identity.archiveSha256, bytes: identity.archiveBytes }));
  } finally {
    fs.rmSync(context, { recursive: true, force: true });
  }
}
main().catch(error => {
  console.error(error.stack);
  process.exitCode = 1;
});
