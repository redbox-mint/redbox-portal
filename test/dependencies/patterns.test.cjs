const assert = require('node:assert/strict');
const fs = require('node:fs');
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const { test } = require('node:test');

const core = createRequire(path.resolve('packages/redbox-core/package.json'));

test('glob preserves application patterns and stops filesystem work after cancellation', async t => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'redbox-glob-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  for (let i = 0; i < 16; i++) {
    await mkdir(path.join(cwd, `records/${i}/nested`), { recursive: true });
    await writeFile(path.join(cwd, `records/${i}/nested/item.json`), '{}');
  }
  await writeFile(path.join(cwd, 'records/draft.yaml'), 'title: draft');
  await writeFile(path.join(cwd, 'records/.private.json'), '{}');
  const glob = core('glob');
  const matches = glob.globSync('records/**/*.{json,yaml}', { cwd, nodir: true, ignore: ['**/nested/**'] });
  assert.deepEqual(matches, ['records/draft.yaml']);
  assert.equal((await glob.glob('records/**/item.json', { cwd })).length, 16);
  assert.equal([...glob.globIterateSync('records/**/item.json', { cwd })].length, 16);

  for (const mode of ['promise', 'stream']) {
    const controller = new AbortController();
    const reason = new Error('cancel fixture traversal');
    let calls = 0;
    let pending = 0;
    let drain;
    const drained = new Promise(resolve => { drain = resolve; });
    const countedFs = {
      ...fs,
      readdir(...args) {
        calls++;
        pending++;
        if (calls === 1) controller.abort(reason);
        const callback = args.pop();
        fs.readdir(...args, (...result) => {
          callback(...result);
          if (--pending === 0) setImmediate(() => { if (pending === 0) drain(); });
        });
      }
    };
    const options = { cwd, signal: controller.signal, fs: countedFs };
    const walk = mode === 'promise' ? glob.glob('**', options) :
      new Promise((resolve, reject) => glob.globStream('**', options).on('error', reject).on('end', resolve).resume());
    await assert.rejects(walk, error => error === reason);
    const atRejection = calls;
    await drained;
    assert.equal(calls, atRejection, `${mode}: no reads after rejection`);
    assert.equal(calls, 1, `${mode}: abort at first read`);
  }
});

test('minimatch bounds globstar parent preprocessing without losing normal matches', () => {
  const { Minimatch, minimatch } = createRequire(core.resolve('glob/package.json'))('minimatch');
  const matcher = new Minimatch(Array(8).fill('**/../a/b').join('/'), { optimizationLevel: 2, braceExpandMax: 32 });
  assert.ok(matcher.set.length <= 32);
  assert.equal(minimatch('records/item.json', 'records/*.{json,yaml}'), true);
  assert.equal(minimatch('records/.private.json', 'records/*.json'), false);
  assert.equal(minimatch('records/.private.json', 'records/*.json', { dot: true }), true);
  assert.equal(minimatch('records/item.json', '**/!(*.yaml)'), true);
});

test('Mocha and coverage consumers preserve include and exclude discovery', () => {
  for (const manifest of ['package.json', 'packages/redbox-core/package.json', 'packages/redbox-dev-tools/package.json',
    'packages/sails-ng-common/package.json', 'packages/sails-hook-redbox-storage-mongo/package.json',
    'packages/rva-registry/package.json', 'support/tools/figshare-metadata-inspector/package.json']) {
    const consumer = createRequire(path.resolve(manifest));
    const mocha = createRequire(consumer.resolve('mocha/package.json'));
    const collect = mocha('./lib/cli/collect-files');
    const result = collect({ spec: ['test/dependencies/{ingress,outbound}*.test.cjs'],
      ignore: ['**/ingress.*'], extension: ['cjs'], file: [], recursive: false, sort: true });
    assert.deepEqual(result.files, [path.resolve('test/dependencies/outbound.test.cjs')], manifest);
  }
  const nyc = createRequire(core.resolve('nyc/package.json'));
  const TestExclude = nyc('test-exclude');
  const exclude = new TestExclude({ cwd: process.cwd(), include: ['packages/**/src/**/*.ts'], exclude: ['**/*.test.ts'] });
  assert.equal(exclude.shouldInstrument('packages/redbox-core/src/services/AppConfigService.ts'), true);
  assert.equal(exclude.shouldInstrument('packages/redbox-core/test/example.test.ts'), false);
});

test('WebDAV filtering preserves basename, braces, extglobs and hidden files', async () => {
  const response = await import(path.join(path.dirname(core.resolve('webdav')), 'response.js'));
  const files = ['records/item.json', 'records/draft.yaml', 'records/private.txt', 'records/.hidden.json'].map(filename => ({ filename }));
  assert.deepEqual(response.processGlobFilter(files, '*.{json,yaml}'), files.slice(0, 2));
  assert.deepEqual(response.processGlobFilter(files, '@(item.json|draft.yaml)'), files.slice(0, 2));
});

test('TypeDoc expands nested entrypoints and excludes private files', async t => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'redbox-typedoc-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(path.join(cwd, 'src/nested'), { recursive: true });
  await mkdir(path.join(cwd, 'src/excluded'), { recursive: true });
  await writeFile(path.join(cwd, 'src/nested/public.ts'), 'export class PublicRecord { title: string = "example"; }');
  await writeFile(path.join(cwd, 'src/excluded/private.ts'), 'export class HiddenRecord {}');
  const root = createRequire(path.resolve('package.json'));
  const cli = path.join(path.dirname(root.resolve('typedoc/package.json')), 'bin/typedoc');
  execFileSync(process.execPath, [cli, '--entryPointStrategy', 'expand', '--exclude', '**/excluded/**',
    '--skipErrorChecking', '--json', 'reflection.json', 'src/**/*.ts'], { cwd, stdio: 'pipe', timeout: 20000 });
  const reflection = fs.readFileSync(path.join(cwd, 'reflection.json'), 'utf8');
  assert.match(reflection, /PublicRecord/);
  assert.doesNotMatch(reflection, /HiddenRecord/);
});

test('Bruno YAML loaders preserve documents and report excessive nesting as a parse error', () => {
  const bruno = createRequire(path.resolve('test/bruno/package.json'));
  const filestore = bruno('@usebruno/filestore');
  const environment = filestore.parseEnvironment('name: local\nvariables:\n  - name: endpoint\n    value: https://example.org\n', { format: 'yml' });
  assert.equal(environment.name, 'local');
  assert.equal(environment.variables[0].value, 'https://example.org');
  const payload = '['.repeat(5000) + '1' + ']'.repeat(5000);
  const yaml = createRequire(bruno.resolve('@usebruno/filestore/package.json'))('yaml');
  assert.throws(() => filestore.parseEnvironment(payload, { format: 'yml' }), yaml.YAMLParseError);
  for (const name of ['@usebruno/filestore', '@usebruno/js']) {
    const yaml = createRequire(bruno.resolve(`${name}/package.json`))('yaml');
    assert.deepEqual(yaml.parse('base: &base [one, two]\ncopy: *base\n'), { base: ['one', 'two'], copy: ['one', 'two'] });
    for (const parse of [yaml.parse, yaml.parseDocument, yaml.parseAllDocuments]) {
      let errors;
      try {
        const result = parse(payload);
        errors = Array.isArray(result) ? result.flatMap(doc => doc.errors) : result.errors;
      } catch (error) { errors = [error]; }
      assert.ok(errors?.length > 0);
      assert.ok(errors.every(error => error instanceof yaml.YAMLParseError), name);
    }
  }
});
