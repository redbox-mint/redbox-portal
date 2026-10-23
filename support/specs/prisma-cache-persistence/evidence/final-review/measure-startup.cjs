// Bounded review diagnostic, not a replacement for the unchanged 12-second test.
// Run after builds/installs stop: node <this-file> > startup.json
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../../..');
const baseline = '0cfbd62b93260b63ad907d7c01ed9f33a2af619e';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-cache-review-startup-'));
const probe = `
  const assert = require('node:assert/strict');
  const start = performance.now();
  require('./src');
  const coreMs = performance.now() - start;
  const prismaModules = Object.keys(require.cache).filter(file => file.includes('/@prisma/orm-mongo/')).length;
  assert.equal(prismaModules, 0);
  assert.equal(Object.keys(require.cache).some(file => file.includes('/jsdom/')), false);
  assert.equal(Boolean(require.cache[require.resolve('effect')]), false);
  const html = require('./src/utilities/TranslationHtml');
  assert.equal(html.sanitizeTranslationHtml('<p onclick="bad()">Hello</p>'), '<p>Hello</p>');
  const purifier = globalThis.DOMPurify;
  assert.equal(typeof purifier.sanitize, 'function');
  assert.equal(purifier.sanitize('<p>Hello<script>bad()</script></p>'), '<p>Hello</p>');
  console.log('STARTUP_REVIEW ' + JSON.stringify({ coreMs, totalMs: performance.now() - start, prismaModules }));
`;
try {
  const archive = execFileSync(
    'git',
    ['archive', baseline, 'package.json', 'tsconfig.json', 'packages/redbox-core', 'packages/redbox-dev-tools/config'],
    { cwd: root, maxBuffer: 30 * 1024 * 1024 }
  );
  execFileSync('tar', ['-x', '-C', temporary], { input: archive });
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), 'dir');
  const currentModules = path.join(root, 'packages/redbox-core/node_modules');
  if (fs.existsSync(currentModules)) {
    fs.symlinkSync(currentModules, path.join(temporary, 'packages/redbox-core/node_modules'), 'dir');
  }
  const runs = [];
  for (const selection of ['base', 'current', 'current', 'base', 'base', 'current']) {
    const cwd = path.join(selection === 'base' ? temporary : root, 'packages/redbox-core');
    const start = performance.now();
    const stdout = execFileSync(
      process.execPath,
      ['--no-experimental-strip-types', '--require', 'ts-node/register/transpile-only', '-e', probe],
      {
        cwd,
        encoding: 'utf8',
        timeout: 60_000,
        env: { ...process.env, TS_NODE_PROJECT: path.join(cwd, 'test/tsconfig.json') },
      }
    );
    const line = stdout.split('\n').find(value => value.startsWith('STARTUP_REVIEW '));
    assert(line, stdout);
    runs.push({ selection, wallMs: performance.now() - start, ...JSON.parse(line.slice(15)) });
  }
  console.log(JSON.stringify({ baseline, node: process.version, sharedInstalledDependencies: true, runs }, null, 2));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
