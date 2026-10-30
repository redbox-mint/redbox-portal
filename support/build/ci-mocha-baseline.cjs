'use strict';

// Local evidence only: never uploads coverage or changes the image/test selection.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function main() {
  const [role, archive = '/tmp/docker-images/test/redbox-portal-test.tar'] = process.argv.slice(2);
  assert.ok(['candidate', 'baseline'].includes(role), 'Usage: ci-mocha-baseline.cjs candidate|baseline [image-archive]');
  const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim();
  const revision = run('git', ['rev-parse', 'HEAD']);
  assert.match(revision, /^[0-9a-f]{40}$/);
  assert.equal(revision, process.env.CIRCLE_SHA1, 'Checkout must match the pipeline revision');
  assert.equal(process.env.RBPORTAL_IMAGE, 'redbox-portal:test', 'Use the shared test image');
  const imageId = run('docker', ['image', 'inspect', '--format', '{{.Id}}', 'redbox-portal:test']);
  assert.match(imageId, /^sha256:[0-9a-f]{64}$/);
  const files = [
    'package-lock.json', '.nvmrc', '.circleci/config.yml',
    'support/integration-testing/docker-compose.mocha.yml',
    'support/integration-testing/run-mocha-redbox.sh',
    'support/unit-testing/codecov/prepare-report.cjs',
    'coverage/mocha/lcov.info', '.tmp/junit/backend-mocha/backend-mocha.xml',
  ];
  const hashes = {};
  for (const file of files) {
    assert.ok(fs.statSync(file).size > 0, `Missing or empty comparison evidence: ${file}`);
    hashes[file] = await sha256(file);
  }
  const evidence = {
    role,
    revision,
    source_tree: run('git', ['rev-parse', 'HEAD^{tree}']),
    pipeline_id: process.env.CIRCLE_PIPELINE_ID,
    workflow_id: process.env.CIRCLE_WORKFLOW_ID,
    job_number: process.env.CIRCLE_BUILD_NUM,
    image_archive_sha256: await sha256(archive),
    image_id: imageId,
    rbportal_image: process.env.RBPORTAL_IMAGE,
    node: process.version,
    npm: run('npm', ['--version']),
    compose: run('docker', ['compose', 'version', '--short']),
    files: hashes,
  };
  const directory = '.tmp/ci-mocha-baseline';
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'identity.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`Recorded ${role} at ${revision}, image ${imageId}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
