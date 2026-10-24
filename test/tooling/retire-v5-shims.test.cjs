const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { reconcile } = require('../../support/migrations/retire-v5-shims.cjs');

test('retirement inspects first, preserves edits and symlinks, and removes only exact output', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'redbox-shims-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'api/services'), { recursive: true });
  const source = '// generated\nmodule.exports = {};\n';
  const sha256 = createHash('sha256').update(source).digest('hex');
  const files = ['Exact', 'Edited', 'Linked', 'Missing'].map(name => ({
    file: `api/services/${name}.js`, generatedHeader: true, tracked: false, sha256,
  }));
  await fs.writeFile(path.join(root, files[0].file), source);
  await fs.writeFile(path.join(root, files[1].file), source + '// institution edit\n');
  await fs.symlink('Exact.js', path.join(root, files[2].file));
  assert.deepEqual((await reconcile(root, { files })).map(row => row.state), ['exact', 'preserved', 'preserved', 'missing']);
  assert.equal(await fs.readFile(path.join(root, files[0].file), 'utf8'), source);
  assert.deepEqual((await reconcile(root, { files }, true)).map(row => row.state), ['removed', 'preserved', 'preserved', 'missing']);
  assert.match(await fs.readFile(path.join(root, files[1].file), 'utf8'), /institution edit/);
  await assert.rejects(reconcile(root, { files: [{ ...files[0], file: 'api/../owned.js' }] }, true), /manifest path/);
});
