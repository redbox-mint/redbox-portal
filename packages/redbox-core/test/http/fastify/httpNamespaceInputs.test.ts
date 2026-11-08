import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(__dirname, '../../../../..');
const script = 'packages/redbox-core/scripts/http-namespaces.cjs';
const manifest = 'packages/redbox-core/scripts/http-asset-sources.json';
const catalog = 'packages/redbox-core/src/http/fastify/coreNamespaces.ts';
const assets: string[] = JSON.parse(fs.readFileSync(path.join(root, manifest), 'utf8'));
const inputs = [
  script,
  'packages/redbox-core/scripts/http-generated-assets.cjs',
  manifest,
  catalog,
  'support/specs/fastify-migration/evidence/FM-002.inventory.json',
  'angular/angular.json',
  'packages/redbox-core/src/config/webpack.config.ts',
  ...assets,
];

describe('FM-018 reproducible namespace source inputs', function () {
  this.timeout(15000);
  let temporary: string;
  beforeEach(() => {
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'fm018-namespace-'));
  });
  afterEach(() => fs.rmSync(temporary, { recursive: true, force: true }));
  function fixture() {
    for (const name of inputs) {
      const target = path.join(temporary, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(root, name), target);
    }
    // Installed dependencies are an explicit prerequisite; source/build output is not.
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), 'dir');
  }
  const check = () =>
    execFileSync(process.execPath, [path.join(temporary, script), '--check'], {
      cwd: temporary,
      encoding: 'utf8',
      timeout: 10000,
    });
  it('uses exactly tracked non-hidden asset sources and no ignored files', () => {
    const tracked = execFileSync('git', ['ls-files', '-z', '--', 'assets'], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(file => file && !file.split('/').some(part => part.startsWith('.')))
      .sort();
    assert.deepEqual(assets, tracked, 'Update the explicit asset source manifest from git ls-files');
    const ignored = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], {
      cwd: root,
      input: assets.join('\n') + '\n',
      encoding: 'utf8',
    });
    assert.equal(ignored.status, 1, ignored.stdout || ignored.stderr);
    assert.equal(ignored.stdout, '');
  });
  it('checks without Git, Angular output, Webpack output or dist, in Docker build order', () => {
    fixture();
    for (const name of ['.git', 'assets/angular', '.tmp/public', 'packages/redbox-core/dist'])
      assert(!fs.existsSync(path.join(temporary, name)));
    assert.match(check(), /Core namespace inventory verified/);
    const content = fs.readFileSync(path.join(temporary, catalog), 'utf8');
    assert.match(content, /"path": "\/angular"/);
    assert.match(content, /"path": "\/icons"/);
  });
  it('ignores arbitrary local/untracked/ignored generated directories and files', () => {
    fixture();
    const before = check();
    for (const name of [
      'assets/angular/app/browser/main.js',
      'assets/untracked-output/missing.js',
      '.tmp/public/generated/vendor.js',
      'assets/default/default/js/local-generated/deep.js',
    ]) {
      const target = path.join(temporary, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, 'untracked output');
    }
    assert.equal(check(), before);
  });
  it('fails closed when a declared tracked asset source is absent', () => {
    fixture();
    fs.unlinkSync(path.join(temporary, assets[0]));
    const result = spawnSync(process.execPath, [path.join(temporary, script), '--check'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ENOENT|Missing asset source/);
  });
  for (const owner of ['angular', 'webpack'])
    it(`detects a new ${owner} output namespace from source before any bundle exists`, () => {
      fixture();
      if (owner === 'angular') {
        const file = path.join(temporary, 'angular/angular.json');
        const config = JSON.parse(fs.readFileSync(file, 'utf8'));
        Object.values<any>(config.projects)[0].architect.build.options.outputPath = {
          base: '../assets/future-angular/app',
        };
        fs.writeFileSync(file, JSON.stringify(config));
      } else
        fs.writeFileSync(
          path.join(temporary, 'packages/redbox-core/src/config/webpack.config.ts'),
          fs
            .readFileSync(path.join(temporary, 'packages/redbox-core/src/config/webpack.config.ts'), 'utf8')
            .replace("filename: 'icons/[hash].svg'", "filename: 'new-generated-icons/[hash].svg'")
        );
      const result = spawnSync(process.execPath, [path.join(temporary, script), '--check'], { encoding: 'utf8' });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Core namespace inventory drift/);
      execFileSync(process.execPath, [path.join(temporary, script)]);
      assert.match(check(), /Core namespace inventory verified/);
      assert.match(
        fs.readFileSync(path.join(temporary, catalog), 'utf8'),
        owner === 'angular' ? /future-angular/ : /new-generated-icons/
      );
    });
});
