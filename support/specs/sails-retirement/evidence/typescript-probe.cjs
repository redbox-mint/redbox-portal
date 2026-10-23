// Probe Node's native stripping separately from the supported ts-node Mocha path.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-node26-'));
const cases = [];
try {
  for (const [name, source, expected] of [
    ['erasable', 'const count: number = 1; console.log(count);', 0],
    ['enum', 'enum State { Ready }; console.log(State.Ready);', 1],
  ]) {
    const filename = path.join(temporary, `${name}.ts`);
    fs.writeFileSync(filename, source);
    const result = spawnSync(process.execPath, [filename], { encoding: 'utf8' });
    assert.equal(result.status, expected);
    if (name === 'enum') assert.match(result.stderr, /ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX/);
    cases.push({ name, exit: result.status, stdout: result.stdout.trim(), expectedNativeLimitation: name === 'enum' ? 'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX' : null });
  }
  console.log(JSON.stringify({ node: process.version, cases, note: 'Native strip-only loading cannot replace the transpiling ts-node loader used for namespaces, enums and decorators. Mocha checks are recorded separately.' }, null, 2));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
