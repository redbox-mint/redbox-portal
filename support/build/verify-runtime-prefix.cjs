const fs = require('node:fs');
const [runtimePath, testPath, localRuntimePath] = process.argv.slice(2);
function layers(path) {
  const config = JSON.parse(fs.readFileSync(path, 'utf8'));
  const ids = config.rootfs?.diff_ids ?? config.RootFS?.Layers;
  if (!Array.isArray(ids) || !ids.length || ids.some(id => !/^sha256:[a-f0-9]{64}$/.test(id))) {
    throw new Error(`Invalid or empty rootfs diff_ids: ${path}`);
  }
  return ids;
}
const staged = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
const local = JSON.parse(fs.readFileSync(localRuntimePath, 'utf8'));
if (!/^sha256:[a-f0-9]{64}$/.test(local.Id) || staged.Id !== local.Id) {
  throw new Error('Staged runtime config digest differs from the locally built runtime; refusing promotion');
}
const runtime = layers(runtimePath);
const tested = layers(testPath);
if (runtime.length >= tested.length || runtime.some((id, index) => id !== tested[index])) {
  throw new Error('Staged runtime layers are not an exact prefix of the tested image; refusing promotion');
}
console.log(`Verified runtime rootfs prefix: ${runtime.length} of ${tested.length} tested layers`);
