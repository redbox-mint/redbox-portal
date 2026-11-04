const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const filename = path.resolve('packages/redbox-core/test/extensions/loading.test.ts');
const local = createRequire(filename);
const ts = local('typescript');
const real = local('../../src/extensions/loading');
const strict = require('node:assert/strict');
const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
(async () => {
  for (const mode of ['actual', 'empty', 'guarded-actual', 'guarded-empty', 'guarded-wrong-identities']) {
    let checks = 0;
    const assertion = new Proxy(strict, {
      get(target, key) {
        const value = target[key];
        return typeof value === 'function'
          ? (...args) => {
              checks++;
              return value(...args);
            }
          : value;
      },
    });
    const loading = {
      ...real,
      async discoverInstalledExtensions(root) {
        const result =
          mode.endsWith('empty') || mode === 'empty'
            ? { extensions: [] }
            : await real.discoverInstalledExtensions(root);
        if (mode === 'guarded-wrong-identities')
          result.extensions = result.extensions.map(e => ({ ...e, name: 'unexpected-' + e.name }));
        if (mode.startsWith('guarded-')) {
          const expected = Object.keys(
            JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies
          ).sort();
          assertion.equal(result.extensions.length, expected.length);
          assertion.deepEqual(result.extensions.map(e => e.name).sort(), expected);
        }
        return result;
      },
    };
    const tests = [],
      before = [],
      after = [];
    vm.runInNewContext(
      js,
      {
        exports: {},
        require: name =>
          name === 'node:assert/strict' ? assertion : name === '../../src/extensions/loading' ? loading : local(name),
        describe: (_name, fn) => fn(),
        it: (name, fn) => {
          if (/^normalizes CommonJS|^loads Node conditional/.test(name)) tests.push({ name, fn });
        },
        beforeEach: fn => before.push(fn),
        afterEach: fn => after.push(fn),
        console,
        __dirname: path.dirname(filename),
      },
      { filename }
    );
    for (const test of tests) {
      checks = 0;
      let failed = false;
      try {
        for (const fn of before) await fn();
        await test.fn();
      } catch (error) {
        failed = true;
        if (!mode.startsWith('guarded-')) throw error;
      } finally {
        for (const fn of after) await fn();
      }
      console.log(JSON.stringify({ mode, name: test.name, checks, failed }));
      strict.equal(failed, mode === 'guarded-empty' || mode === 'guarded-wrong-identities');
      if (mode === 'empty') strict.equal(checks, 0);
    }
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
