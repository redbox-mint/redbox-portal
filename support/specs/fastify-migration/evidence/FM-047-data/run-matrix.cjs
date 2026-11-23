'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const [adapter, output, batch, ...selected] = process.argv.slice(2);
assert(adapter && output && /^[a-z0-9-]+$/.test(batch));
const { protocol, cells, hash } = require(path.resolve(adapter, 'protocol.cjs'));
assert(process.env.FM007_STATE);
assert.equal(process.version, 'v26.12.1');

const image = process.env.FM047_IMAGE ??
  'redbox-fm044@sha256:530f75cd2da35d79a55d20fd15f9858a5f4ced26fabcc48d1ace83cc5140203f';
assert(/^redbox-fm044@sha256:[a-f0-9]{64}$/.test(image));
const inspect = spawnSync('timeout', ['15', 'docker', 'image', 'inspect', image], { stdio: 'ignore' });
assert.equal(inspect.status, 0, `missing image ${image}`);
const schedule = selected.length ? selected.map(id => cells.find(cell => cell.id === id)) : cells;
assert(schedule.every(Boolean));
assert.equal(new Set(schedule).size, schedule.length);
const manifest = path.join(output, 'attempts.jsonl');

function record(entry, state, details = {}) {
  const row = JSON.stringify({ ...entry, state, utc: new Date().toISOString(), ...details });
  fs.appendFileSync(manifest, row + '\n');
  console.log(row);
}

for (const cell of schedule) {
  for (let repetition = 1; repetition <= protocol.repetitions; repetition++) {
    const directory = `${batch}-${cell.id}-${repetition}`;
    const target = path.join(output, directory);
    const entry = { batch, image, cell: cell.id, repetition, directory };
    assert(!fs.existsSync(target), `attempt exists: ${directory}`);
    const log = fs.openSync(target + '.log', 'wx');
    record(entry, 'started');
    const execution = spawnSync(
      'timeout',
      ['--foreground', '--kill-after=10s', String(protocol.outerSeconds), process.execPath,
        path.join(adapter, 'sample.cjs'), cell.id, target],
      {
        env: {
          ...process.env,
          FM007_IMAGE: image,
          FM047_CANDIDATE: 'true',
        },
        stdio: ['ignore', log, log],
      }
    );
    fs.closeSync(log);
    const resultFile = path.join(target, 'result.json');
    const bytes = fs.existsSync(resultFile) ? fs.readFileSync(resultFile) : null;
    const result = bytes ? JSON.parse(bytes) : {};
    record(entry, 'finished', {
      exit: execution.status,
      signal: execution.signal,
      valid: result.valid === true,
      error: result.error ?? (bytes ? null : 'no result written'),
      resultSha256: bytes ? hash(bytes) : null,
    });
    assert.equal(execution.status, 0, `attempt failed: ${directory}`);
    assert(result.valid, `attempt invalid: ${directory}`);
  }
}
