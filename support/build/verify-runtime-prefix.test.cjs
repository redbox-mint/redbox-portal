const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const layer = char => `sha256:${char.repeat(64)}`;
const config = { rootfs: { diff_ids: [layer('a'), layer('b')] }, config: { Cmd: ['node', 'app.js'], Env: ['NODE_ENV=docker'], User: 'node' } };
const id = value => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

test('staged identity must match local runtime independently of the tested layer prefix', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-prefix-'));
  const check = staged => {
    fs.writeFileSync(path.join(directory, 'staged'), JSON.stringify({ ...staged, Id: id(staged) }));
    return spawnSync(process.execPath, [path.join(__dirname, 'verify-runtime-prefix.cjs'),
      path.join(directory, 'staged'), path.join(directory, 'test'), path.join(directory, 'local')], { encoding: 'utf8' });
  };
  try {
    fs.writeFileSync(path.join(directory, 'local'), JSON.stringify({ Id: id(config) }));
    fs.writeFileSync(path.join(directory, 'test'), JSON.stringify({ RootFS: { Layers: [...config.rootfs.diff_ids, layer('c')] } }));
    assert.equal(check(config).status, 0);
    for (const staged of [
      { ...config, rootfs: { diff_ids: [layer('a')] } },
      ...[{ Cmd: ['sh'] }, { Env: ['NODE_ENV=development'] }, { User: 'root' }]
        .map(change => ({ ...config, config: { ...config.config, ...change } })),
    ]) {
      const result = check(staged);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /config digest differs/);
    }
    // Even a matching config ID cannot waive the separate prefix check.
    fs.writeFileSync(path.join(directory, 'test'), JSON.stringify({ RootFS: { Layers: [layer('d'), layer('b'), layer('c')] } }));
    assert.match(check(config).stderr, /not an exact prefix/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
