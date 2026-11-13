const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('inventory captures empty directories, mode, ownership, content and symlinks without following them', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'image-inventory-'));
  const inventory = () => execFileSync(process.execPath, ['-e',
    'require(process.argv[1]).walk(process.argv[2]).catch(e => { console.error(e); process.exitCode = 1; })',
    path.join(__dirname, 'image-inventory.cjs'), directory], { encoding: 'utf8' }).trim().split('\n').map(JSON.parse);
  try {
    const file = path.join(directory, 'file');
    const empty = path.join(directory, 'empty');
    const link = path.join(directory, 'link');
    fs.writeFileSync(file, 'same content');
    fs.mkdirSync(empty);
    fs.symlinkSync('/does-not-exist', link);
    const before = inventory();
    for (const name of [directory, empty, file, link]) {
      const row = before.find(row => row[0] === name);
      const stat = fs.lstatSync(name);
      assert.deepEqual(row.slice(2, 5), [stat.mode & 0o7777, stat.uid, stat.gid]);
    }
    assert.equal(before.find(row => row[0] === empty)[1], 'directory');
    assert.equal(before.find(row => row[0] === link).at(-1), '/does-not-exist');
    fs.chmodSync(file, 0o700);
    fs.chmodSync(empty, 0o711);
    const after = inventory();
    assert.notDeepEqual(after, before);
    assert.equal(after.find(row => row[0] === file)[2], 0o700);
    assert.equal(after.find(row => row[0] === empty)[2], 0o711);
    assert.deepEqual(after.find(row => row[0] === file).slice(5), before.find(row => row[0] === file).slice(5));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
