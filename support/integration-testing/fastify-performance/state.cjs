'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const marker = '.fm007-disposable-state';
const signature = 'FM007 disposable benchmark state\n';

// Call before acquisition/reset and immediately before recursive deletion.
function assertDisposableState(directory, { create = false } = {}) {
  const state = path.resolve(directory);
  const message = 'unsafe FM007_STATE: require an owned, marked fm007-state directory without symlinks';
  assert(/^fm007-state(?:-[A-Za-z0-9_-]+)?$/.test(path.basename(state)), message);
  let existing = state;
  while (!fs.existsSync(existing)) {
    assert(!fs.lstatSync(existing, { throwIfNoEntry: false }), message); // dangling symlink
    existing = path.dirname(existing);
  }
  assert.equal(fs.realpathSync(existing), existing, message);
  if (!fs.existsSync(state)) {
    if (!create) return state;
    fs.mkdirSync(state, { recursive: true });
    fs.writeFileSync(path.join(state, marker), signature, { flag: 'wx', mode: 0o600 });
  }
  const info = fs.lstatSync(state);
  assert(info.isDirectory() && info.uid === process.getuid(), message);
  const stamp = fs.lstatSync(path.join(state, marker), { throwIfNoEntry: false });
  assert(stamp?.isFile() && stamp.uid === process.getuid(), message);
  assert.equal(fs.readFileSync(path.join(state, marker), 'utf8'), signature, message);
  return state;
}

module.exports = { assertDisposableState };
