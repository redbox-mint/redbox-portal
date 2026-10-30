const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { execFileSync, spawnSync } = require('node:child_process');
const { gzipSync, gunzipSync } = require('node:zlib');
const { pathToFileURL } = require('node:url');
const integration = require('../integration-prebuilt-assets.cjs');
const { identity, localDependencies, inspectLocalTarball, TOOL_PACKAGES, sha256, json, buildEnv, flags } = require('./identity.cjs');
const { produce, consume, outsideCheckout } = require('./cli.cjs');
const { pack, unpack, header, fileHash } = require('./archive.cjs');
const { STEPS, build } = require('./prepare.cjs');

const cli = path.join(__dirname, 'cli.cjs');
function put(root, name, bytes) {
  const filename = path.join(root, name);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, bytes);
}
function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function tarHeader(name, size = 0, type = '0', prefix = '') {
  const block = header('assets/placeholder', size);
  block.fill(0, 0, 100); block.write(name, 0, 100);
  block.fill(0, 345, 500); block.write(prefix, 345, 155);
  block[156] = type.charCodeAt(0);
  return checksumHeader(block);
}
function checksumHeader(block) {
  block.fill(32, 148, 156);
  const sum = block.reduce((total, byte) => total + byte, 0);
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8);
  return block;
}
function packageTar(entries = { 'package/package.json': json({ name: 'vendor', version: '1.0.0' }) }) {
  return Buffer.concat([...Object.entries(entries).flatMap(([name, content]) => {
    const bytes = Buffer.from(content);
    return [tarHeader(name, bytes.length), bytes, Buffer.alloc((512 - bytes.length % 512) % 512)];
  }), Buffer.alloc(1024)]);
}
function fixture(t) {
  const base = fs.mkdtempSync(path.join(__dirname, '.test-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'source');
  fs.mkdirSync(root);
  const apps = [...integration.REQUIRED_APPS, 'form', 'some-extra-app'];
  put(root, '.gitignore', 'assets/angular/\n.tmp/\n');
  put(root, '.nvmrc', process.versions.node);
  put(root, 'angular/.nvmrc', process.versions.node);
  put(root, 'angular/angular.json', json({ projects: Object.fromEntries(apps.map(app => [app, {
    architect: { build: { builder: '@angular/build:application' } },
  }])) }));
  put(root, 'backend.ts', '// backend source\n');
  put(root, 'angular/projects/example/app.ts', '// angular source\n');
  put(root, 'packages/sails-ng-common/src/index.ts', '// shared models\n');
  put(root, 'packages/sails-ng-common/package-lock.json', '{"lockfileVersion":3}');
  put(root, 'packages/redbox-core/src/config/webpack.config.ts', '// webpack source\n');
  put(root, '.npmrc', 'strict-peer-deps=true\n');
  put(root, 'packages/agenda-patched/agenda.tgz', gzipSync(packageTar()));
  put(root, 'support/build/build-helper.sh', '#!/bin/sh\n');
  put(root, 'assets/default/default/styles/style.scss', 'body { color: black; }');
  put(root, 'assets/default/default/fonts/source.woff2', 'source font');
  for (const [directory, names] of Object.entries(TOOL_PACKAGES)) {
    put(root, `${directory}/package.json`, json({ name: directory, version: '1.0.0' }));
    put(root, `${directory}/package-lock.json`, json({ lockfileVersion: 3,
      packages: Object.fromEntries(names.map(name => [`node_modules/${name}`, { version: '1.2.3' }])) }));
  }
  git(root, 'init', '-q');
  git(root, 'add', '.');
  git(root, '-c', 'user.name=Asset tests', '-c', 'user.email=assets@example.invalid', 'commit', '-qm', 'fixture');
  const revision = git(root, 'rev-parse', 'HEAD').trim();
  const payload = () => {
    for (const app of apps) {
      for (const prefix of [`assets/angular/${app}/browser`, `.tmp/public/angular/${app}/browser`]) {
        put(root, `${prefix}/index.html`, '<base href="/"><script type="module" src="main-A.js"></script><link rel="stylesheet" href="styles-A.css">');
        put(root, `${prefix}/main-A.js`, 'import("./chunk-A.js");');
        put(root, `${prefix}/chunk-A.js`, 'export const ready = true;');
        put(root, `${prefix}/styles-A.css`, '');
        put(root, `${prefix}/main-A.js.map`, '{"version":3}');
      }
    }
    for (const filename of integration.REQUIRED_WEBPACK) put(root, `.tmp/public/${filename}`, '/* production bundle */');
    put(root, '.tmp/public/default/default/fonts/font.woff2', 'font bytes');
    put(root, '.tmp/public/default/default/js/index.bundle.js.map', '{"version":3}');
    put(root, '.tmp/public/default/default/images/logo.svg', '<svg/>');
  };
  return { base, root, revision, payload, artifact: path.join(base, 'artifact'), stage: path.join(base, 'stage') };
}
async function produced(t) {
  const f = fixture(t);
  f.result = await produce(f.root, f.revision, f.artifact, f.payload);
  return f;
}
function rewriteDescriptor(f, transform) {
  const name = path.join(f.artifact, 'artifact.json');
  const descriptor = JSON.parse(fs.readFileSync(name));
  transform(descriptor);
  fs.writeFileSync(name, json(descriptor));
  return sha256(fs.readFileSync(name));
}
function replaceArchive(f, bytes) {
  return replaceCompressedArchive(f, gzipSync(bytes));
}
function replaceCompressedArchive(f, bytes) {
  fs.writeFileSync(path.join(f.artifact, 'assets.tar.gz'), bytes);
  return rewriteDescriptor(f, descriptor => {
    const compressed = fs.readFileSync(path.join(f.artifact, 'assets.tar.gz'));
    descriptor.archive.size = compressed.length;
    descriptor.archive.sha256 = sha256(compressed);
  });
}

test('complete file inventory survives producer/consumer byte for byte on independent checkouts', async t => {
  const f = await produced(t);
  const original = integration.verify(f.root, f.revision);
  const consumerRoot = path.join(f.base, 'consumer');
  git(f.base, 'clone', '-q', f.root, consumerRoot);
  const restored = await consume(consumerRoot, f.revision, f.artifact, f.result.descriptorSha256, f.stage);
  assert.equal(restored.key, f.result.key);
  assert.deepEqual(integration.verify(f.stage, f.revision), original);
  assert.equal(fs.existsSync(path.join(consumerRoot, '.tmp')), false);
  assert.equal(fs.existsSync(path.join(consumerRoot, 'assets/angular')), false);
  for (const file of original.files) {
    assert.deepEqual(fs.readFileSync(path.join(f.stage, file.path)), fs.readFileSync(path.join(f.root, file.path)));
  }
  assert.equal(fs.statSync(path.join(f.stage, '.tmp/public/default/default/fonts/font.woff2')).mode & 0o777, 0o644);
  const descriptor = JSON.parse(fs.readFileSync(path.join(f.artifact, 'artifact.json')));
  assert.deepEqual(descriptor.portableTo, ['linux/amd64', 'linux/arm64']);
  assert.equal(descriptor.identity.toolchain.node, process.versions.node);
  // Native producer identity is audit data, not a consumer cache key component.
  const changedArchChecksum = rewriteDescriptor(f, value => { value.producer.arch = 'arm64'; });
  await consume(consumerRoot, f.revision, f.artifact, changedArchChecksum);
});

test('archive and descriptors are deterministic and output directories cannot be overwritten', async t => {
  const f = await produced(t);
  const second = await produce(f.root, f.revision, path.join(f.base, 'second'), f.payload);
  assert.equal(second.descriptorSha256, f.result.descriptorSha256);
  assert.equal(await fileHash(path.join(f.artifact, 'assets.tar.gz')), await fileHash(path.join(second.directory, 'assets.tar.gz')));
  await assert.rejects(produce(f.root, f.revision, f.artifact, f.payload), /already exists/);
  fs.mkdirSync(f.stage);
  put(f.stage, 'sentinel', 'keep');
  await assert.rejects(consume(f.root, f.revision, f.artifact, f.result.descriptorSha256, f.stage), /already exists/);
  assert.equal(fs.readFileSync(path.join(f.stage, 'sentinel'), 'utf8'), 'keep');
});

test('revision, sources, all locks, build helpers, npmrc, tarballs, styles and fonts invalidate identity', t => {
  const f = fixture(t);
  for (const name of ['backend.ts', 'angular/angular.json', 'angular/projects/example/app.ts',
    'packages/sails-ng-common/src/index.ts', 'packages/sails-ng-common/package-lock.json',
    'packages/redbox-core/src/config/webpack.config.ts', 'package-lock.json', 'angular/package-lock.json',
    'packages/redbox-core/package-lock.json', '.npmrc', 'packages/agenda-patched/agenda.tgz',
    'support/build/build-helper.sh', 'assets/default/default/styles/style.scss', 'assets/default/default/fonts/source.woff2']) {
    fs.appendFileSync(path.join(f.root, name), '\n');
    assert.throws(() => identity(f.root, f.revision));
    git(f.root, 'checkout', '--', name);
  }
  assert.throws(() => identity(f.root, 'a'.repeat(40)), /revision mismatch/);
  put(f.root, 'untracked-input.ts', 'source');
  assert.throws(() => identity(f.root, f.revision), /Untracked/);
  fs.rmSync(path.join(f.root, 'untracked-input.ts'));
  const baselineEnv = { ...process.env, NODE_OPTIONS: '--max-old-space-size=2048', NG_BUILD_MAX_WORKERS: '2' };
  const envIdentity = sha256(json(identity(f.root, f.revision, baselineEnv)));
  assert.notEqual(sha256(json(identity(f.root, f.revision, { ...baselineEnv, NODE_OPTIONS: '--max-old-space-size=4096' }))), envIdentity);
  assert.notEqual(sha256(json(identity(f.root, f.revision, { ...baselineEnv, NG_BUILD_MAX_WORKERS: '1' }))), envIdentity);
  put(f.root, '.nvmrc', '0.0.1');
  assert.throws(() => identity(f.root, f.revision));
});

test('NODE_OPTIONS supports only input-free resource flags and rejects mutable preloads', t => {
  const f = fixture(t);
  assert.equal(flags({ NODE_OPTIONS: '--max-old-space-size=4096 --max-semi-space-size=128' }).NODE_OPTIONS,
    '--max-old-space-size=4096 --max-semi-space-size=128');
  const preload = path.join(f.base, 'preload.cjs');
  for (const bytes of ['// initial preload', '// changed preload and imports']) {
    fs.writeFileSync(preload, bytes);
    for (const option of [`--require=${preload}`, `--require ${preload}`, `-r ${preload}`,
      `--import=file://${preload}`, `--loader=${preload}`, `--experimental-loader=${preload}`,
      `--openssl-config=${preload}`, `--env-file=${preload}`, '--conditions=custom',
      '--max_old_space_size=4096', '--max-old-space-size=4096 --require=./preload.cjs',
      '--max-old-space-size=0', '--max-old-space-size="4096"']) {
      assert.throws(() => identity(f.root, f.revision, { ...process.env, NODE_OPTIONS: option }), /Unsupported NODE_OPTIONS/);
    }
  }
});

test('local dependencies must stay inside tracked source, including transitive manifests and lock entries', async t => {
  for (const kind of ['relative', 'absolute', 'url', 'encoded', 'transitive', 'lock-resolved', 'lock-link',
    'lock-location', 'lock-nested-location', 'lock-transitive', 'legacy-lock', 'shrinkwrap', 'symlink', 'symlink-parent', 'untracked',
    'bare-relative', 'bare-absolute', 'bare-tarball', 'bare-transitive', 'bare-lock-resolved',
    'bare-lock-transitive', 'bare-installed-lock-transitive', 'bare-legacy-lock', 'bare-shrinkwrap', 'bare-symlink', 'bare-symlink-parent',
    'internal-symlink', 'tarball-symlink', 'bare-tarball-symlink', 'archive-name-symlink', 'home', 'file-home', 'file-relative-url',
    'git-file', 'optional', 'peer', 'dev', 'override', 'requires']) {
    await t.test(kind, t => {
      const f = fixture(t);
      const external = path.join(f.base, 'external');
      put(external, 'package.json', json({ name: 'external', version: '1.0.0' }));
      let spec = 'file:../external';
      if (kind === 'absolute') spec = `file:${external}`;
      if (kind === 'url') spec = `file://${external}`;
      if (kind === 'encoded') spec = 'file:%2e%2e/external';
      if (kind.startsWith('bare-')) spec = '../external';
      if (kind === 'bare-absolute') spec = external;
      if (kind === 'bare-tarball') {
        put(f.base, 'external-1.0.0.tgz', 'external tarball');
        spec = '../external-1.0.0.tgz';
      }
      if (kind === 'home' || kind === 'file-home') spec = `${kind === 'file-home' ? 'file:' : ''}~/external`;
      if (kind === 'file-relative-url') spec = 'file:/../external';
      if (kind === 'git-file') spec = `git+${pathToFileURL(external)}`;
      if (kind === 'transitive' || kind === 'bare-transitive') {
        put(f.root, 'packages/local/package.json', json({ dependencies: {
          external: `${kind === 'transitive' ? 'file:' : ''}../../../external`,
        } }));
        spec = './packages/local';
      } else if (kind === 'lock-resolved' || kind === 'bare-lock-resolved') {
        const lock = JSON.parse(fs.readFileSync(path.join(f.root, 'package-lock.json')));
        lock.packages['node_modules/parent/node_modules/external'] = { resolved: spec };
        put(f.root, 'package-lock.json', json(lock));
      } else if (kind === 'lock-link') {
        const lock = JSON.parse(fs.readFileSync(path.join(f.root, 'package-lock.json')));
        lock.packages['node_modules/external'] = { resolved: '../external', link: true };
        put(f.root, 'package-lock.json', json(lock));
      } else if (kind === 'lock-location' || kind === 'lock-nested-location') {
        const lock = JSON.parse(fs.readFileSync(path.join(f.root, 'package-lock.json')));
        lock.packages[kind === 'lock-location' ? '../external' : '../external/node_modules/nested'] = { version: '1.0.0' };
        put(f.root, 'package-lock.json', json(lock));
      } else if (kind === 'lock-transitive' || kind === 'bare-lock-transitive' || kind === 'bare-installed-lock-transitive') {
        put(f.root, 'packages/local/package.json', json({ name: 'local' }));
        const lock = JSON.parse(fs.readFileSync(path.join(f.root, 'package-lock.json')));
        lock.packages[kind === 'bare-installed-lock-transitive' ? 'node_modules/parent' : 'packages/local'] = { dependencies: {
          external: `${kind === 'lock-transitive' ? 'file:' : ''}../../../external`,
        } };
        put(f.root, 'package-lock.json', json(lock));
      } else if (kind.includes('legacy-lock') || kind.includes('shrinkwrap')) {
        put(f.root, kind.includes('shrinkwrap') ? 'npm-shrinkwrap.json' : 'packages/local/package-lock.json',
          json({ lockfileVersion: 1, dependencies: { parent: { dependencies: { external: {
            version: kind.includes('shrinkwrap') ? spec : `${kind.startsWith('bare-') ? '' : 'file:'}../../../external`,
          } } } } }));
      } else if (kind.includes('symlink')) {
        fs.appendFileSync(path.join(f.root, '.gitignore'), 'ignored/\n');
        fs.mkdirSync(path.join(f.root, 'ignored'));
        const tarball = kind.includes('tarball') || kind === 'archive-name-symlink';
        const target = kind === 'internal-symlink' ? path.join(f.root, 'packages/local') :
          tarball ? path.join(f.base, 'external-1.0.0.tgz') : external;
        if (kind === 'internal-symlink') put(target, 'package.json', json({ name: 'local' }));
        if (tarball) fs.writeFileSync(target, 'external tarball');
        const alias = kind === 'archive-name-symlink' ? 'alias.tgz' : `ignored/${tarball ? 'alias.tgz' : 'alias'}`;
        if (kind === 'archive-name-symlink') fs.appendFileSync(path.join(f.root, '.gitignore'), `${alias}\n`);
        fs.symlinkSync(target, path.join(f.root, alias));
        spec = kind === 'archive-name-symlink' ? alias :
          `${kind.startsWith('bare-') ? './' : 'file:'}${alias}${kind.endsWith('parent') ? '/package.json' : ''}`;
      } else if (kind === 'untracked') {
        fs.appendFileSync(path.join(f.root, '.gitignore'), 'ignored/\n');
        put(f.root, 'ignored/package.json', json({ name: 'ignored' }));
        spec = 'file:ignored';
      }
      if (!kind.includes('lock-') && !kind.includes('legacy-lock') && !kind.includes('shrinkwrap')) {
        const manifest = JSON.parse(fs.readFileSync(path.join(f.root, 'package.json')));
        const field = { optional: 'optionalDependencies', peer: 'peerDependencies', dev: 'devDependencies',
          override: 'overrides', requires: 'requires' }[kind] || 'dependencies';
        manifest[field] = kind === 'override' ? { parent: { child: '../external' } } :
          { local: ['optional', 'peer', 'dev', 'requires'].includes(kind) ? '../external' : spec };
        put(f.root, 'package.json', json(manifest));
      }
      git(f.root, 'add', '.');
      git(f.root, '-c', 'user.name=Asset tests', '-c', 'user.email=assets@example.invalid', 'commit', '-qm', kind);
      assert.throws(() => identity(f.root, git(f.root, 'rev-parse', 'HEAD').trim()),
        /External local dependency|Local dependency must be tracked|Unsupported local dependency/);
    });
  }
});

test('tracked internal local packages, transitive targets and tarballs remain supported', t => {
  const f = fixture(t);
  put(f.root, 'package.json', json({ dependencies: { local: 'file:packages/local' } }));
  put(f.root, 'packages/local/package.json', json({ dependencies: { other: 'file:../other',
    tarball: 'file:../agenda-patched/agenda.tgz' } }));
  put(f.root, 'packages/other/package.json', json({ name: 'other' }));
  const lock = JSON.parse(fs.readFileSync(path.join(f.root, 'package-lock.json')));
  Object.assign(lock.packages, {
    'packages/local': { dependencies: { other: 'file:../other' } },
    'node_modules/local': { resolved: 'packages/local', link: true },
    'node_modules/tarball': { resolved: 'file:packages/agenda-patched/agenda.tgz' },
  });
  put(f.root, 'package-lock.json', json(lock));
  git(f.root, 'add', '.');
  git(f.root, '-c', 'user.name=Asset tests', '-c', 'user.email=assets@example.invalid', 'commit', '-qm', 'internal dependencies');
  assert.doesNotThrow(() => identity(f.root, git(f.root, 'rev-parse', 'HEAD').trim()));
});

test('bare internal paths and tarballs coexist with registry URLs, aliases and manifest metadata', t => {
  const f = fixture(t);
  put(f.root, 'vendor.tgz', gzipSync(packageTar()));
  put(f.root, 'vendor.TAR', packageTar());
  put(f.root, 'archives/nested/vendor.tar.gz', gzipSync(packageTar()));
  put(f.root, 'packages/local/package.json', json({ dependencies: { tarball: '../../vendor.tgz' } }));
  put(f.root, 'package.json', json({
    main: './dist/index.js', bin: { local: './bin/local.js' }, exports: { '.': './dist/index.js' },
    scripts: { test: './scripts/test.sh', archive: 'node ./pack.tgz' },
    dependencies: {
      local: './packages/local', absolute: path.join(f.root, 'packages/local'),
      url: pathToFileURL(path.join(f.root, 'packages/local')).href,
      tarball: 'vendor.tgz', tar: 'vendor.TAR', nested: 'archives/nested/vendor.tar.gz',
      registry: 'https://registry.npmjs.org/vendor/-/vendor-1.0.0.tgz?download=1',
      alias: 'npm:@scope/vendor@1.0.0', git: 'git+ssh://git@github.com/org/vendor.git#main',
      shorthand: 'org/vendor#main', version: '1.0.0', range: '^1.0.0',
    },
  }));
  const lock = JSON.parse(fs.readFileSync(path.join(f.root, 'package-lock.json')));
  Object.assign(lock.packages, {
    'packages/local': { dependencies: { tarball: '../../vendor.tgz' } },
    'node_modules/local': { resolved: 'packages/local', link: true },
    'node_modules/tarball': { resolved: 'vendor.tgz' },
    'node_modules/nested': { resolved: 'archives/nested/vendor.tar.gz' },
    'node_modules/registry': { resolved: 'https://registry.npmjs.org/vendor/-/vendor-1.0.0.tgz',
      integrity: 'sha512/not/a/local/path' },
  });
  put(f.root, 'package-lock.json', json(lock));
  git(f.root, 'add', '.');
  git(f.root, '-c', 'user.name=Asset tests', '-c', 'user.email=assets@example.invalid', 'commit', '-qm', 'bare internal dependencies');
  assert.doesNotThrow(() => identity(f.root, git(f.root, 'rev-parse', 'HEAD').trim()));
});

test('ambiguous npm path spellings cannot validate a different target than npm installs', t => {
  const f = fixture(t);
  put(f.root, 'packages/local/package.json', json({ name: 'local' }));
  fs.appendFileSync(path.join(f.root, '.gitignore'), 'packages/%6cocal\npackages/%ZZ\n');
  const external = path.join(f.base, 'external');
  put(external, 'package.json', json({ name: 'external' }));
  // npm's parser preserves a literal percent escape in file paths. Decoding it
  // ourselves would validate tracked packages/local instead of this alias.
  fs.symlinkSync(external, path.join(f.root, 'packages/%6cocal'));
  fs.symlinkSync(external, path.join(f.root, 'packages/%ZZ'));
  for (const spec of ['file:packages/%6cocal', './packages/%6cocal', 'FILE:../external',
    'file:~/external', '~/external', 'C:/external', 'C:\\external',
    'file:/./packages/local', 'file:packages/local#fragment', 'file:packages/local?query',
    'packages/%ZZ', 'packages/%E0', 'packages/local#%', 'https1:../../../external',
    'git+ssh1:../../../external', 'user@other.invalid:../../../external',
    'packages/user@host:../../../../external']) {
    put(f.root, 'package.json', json({ dependencies: { local: spec } }));
    git(f.root, 'add', '.');
    git(f.root, '-c', 'user.name=Asset tests', '-c', 'user.email=assets@example.invalid', 'commit', '-qm', spec);
    assert.throws(() => identity(f.root, git(f.root, 'rev-parse', 'HEAD').trim()),
      /Unsupported local dependency|External local dependency/, spec);
  }
});

test('local tarball shrinkwraps fail closed regardless of outer metadata, path spelling or lock generation', async t => {
  for (const hint of [true, false, undefined]) {
    for (const kind of ['modern-resolved', 'legacy-version', 'opaque', 'empty']) {
      await t.test(`${kind}, hasShrinkwrap=${hint}`, t => {
        const f = fixture(t);
        const shrinkwrap = {
          'modern-resolved': json({ lockfileVersion: 3, packages: {
            'node_modules/external': { version: '1.0.0', resolved: '../../../mutable.tgz' },
          } }),
          'legacy-version': json({ lockfileVersion: 1, dependencies: {
            external: { version: '../../../mutable.tgz' },
          } }),
          opaque: 'not even JSON', empty: '{}',
        }[kind];
        // No extension: inspection must follow local file targets, not a glob.
        put(f.root, 'parent-archive', gzipSync(packageTar({
          'package/package.json': json({ name: 'parent', version: '1.0.0' }),
          'package/npm-shrinkwrap.json': shrinkwrap,
        })));
        const lock = JSON.parse(fs.readFileSync(path.join(f.root, 'package-lock.json')));
        lock.packages['node_modules/parent'] = { version: '1.0.0', resolved: 'parent-archive', hasShrinkwrap: hint };
        put(f.root, 'package-lock.json', json(lock));
        git(f.root, 'add', '.');
        git(f.root, '-c', 'user.name=Asset tests', '-c', 'user.email=assets@example.invalid', 'commit', '-qm', 'embedded shrinkwrap');
        assert.throws(() => identity(f.root, git(f.root, 'rev-parse', 'HEAD').trim()), /embedded npm-shrinkwrap\.json/);
      });
    }
  }
});

test('local tarball inspection rejects opaque archives, metadata aliases and ambiguous boundaries', async t => {
  const valid = packageTar();
  const manifest = valid.subarray(0, valid.length - 1024);
  const nonOctal = tarHeader('package/file'); nonOctal[124] = 0x80; checksumHeader(nonOctal);
  const checksum = tarHeader('package/file'); checksum[148] ^= 1;
  const stringPadding = tarHeader('package/file'); stringPadding[14] = 65; checksumHeader(stringPadding);
  const nonUstar = tarHeader('package/file'); nonUstar[257] = 0; checksumHeader(nonUstar);
  const nonUtf8 = tarHeader('package/file'); nonUtf8[8] = 0xff; checksumHeader(nonUtf8);
  const nonzeroPadding = Buffer.from(valid); nonzeroPadding[valid.length - 1025] = 1;
  const payload = packageTar({ 'package/npm-shrinkwrap.json': '{}' });
  const cases = [
    ['not a tar', Buffer.from('opaque archive'), /missing tar trailer/],
    ['truncated gzip', gzipSync(valid).subarray(0, -4), /invalid gzip/],
    ['bad checksum', Buffer.concat([checksum, Buffer.alloc(1024)]), /checksum/],
    ['non-ustar header', Buffer.concat([nonUstar, Buffer.alloc(1024)]), /plain ustar/],
    ['invalid UTF-8', Buffer.concat([nonUtf8, Buffer.alloc(1024)]), /invalid UTF-8/],
    ['base256 size', Buffer.concat([nonOctal, Buffer.alloc(1024)]), /octal/],
    ['string padding', Buffer.concat([stringPadding, Buffer.alloc(1024)]), /header string/],
    ['nonzero file padding', nonzeroPadding, /invalid padding/],
    ['missing trailer', manifest, /missing tar trailer/],
    ['one trailer block', Buffer.concat([manifest, Buffer.alloc(512)]), /tar trailer/],
    ['truncated file', tarHeader('package/file', 1024), /truncated entry/],
    ['missing manifest', packageTar({ 'package/index.js': 'immutable' }), /missing package/],
    ['directory manifest', Buffer.concat([tarHeader('package/package.json', 0, '5'), Buffer.alloc(1024)]), /manifest must be regular/],
    ['duplicate manifest', Buffer.concat([manifest, valid]), /duplicate entry/],
    ['hidden after trailer', Buffer.concat([valid, payload]), /trailing payload/],
    ['concatenated gzip', Buffer.concat([gzipSync(valid), gzipSync(payload)]), /trailing payload/],
    ['gzip trailing zeros', Buffer.concat([gzipSync(valid), Buffer.alloc(8)]), /unconsumed gzip/],
    ['hidden gzip member', Buffer.concat([gzipSync(valid), Buffer.alloc(8), gzipSync(payload)]), /unconsumed gzip/],
    ['partial padding', Buffer.concat([valid, Buffer.alloc(1)]), /tar trailer/],
    ['path traversal', Buffer.concat([tarHeader('package/../npm-shrinkwrap.json'), Buffer.alloc(1024)]), /unsafe package path/],
    ['absolute path', Buffer.concat([tarHeader('/package/npm-shrinkwrap.json'), Buffer.alloc(1024)]), /unsafe package path/],
    ['backslash alias', Buffer.concat([tarHeader('package\\npm-shrinkwrap.json'), Buffer.alloc(1024)]), /unsafe package path/],
    ['dot alias', Buffer.concat([tarHeader('package/./npm-shrinkwrap.json'), Buffer.alloc(1024)]), /unsafe package path/],
    ['ustar prefix', Buffer.concat([tarHeader('npm-shrinkwrap.json', 0, '0', 'package'), Buffer.alloc(1024)]), /embedded npm-shrinkwrap/],
    ['nested shrinkwrap', packageTar({ 'package/package.json': '{}', 'package/node_modules/child/npm-shrinkwrap.json': '{}' }), /embedded npm-shrinkwrap/],
  ];
  for (const type of ['1', '2', '3', 'x', 'g', 'L', 'K', 'S']) {
    cases.push([`link/extension ${type}`, Buffer.concat([manifest,
      tarHeader('package/metadata', 0, type), Buffer.alloc(1024)]), /no links or extensions/]);
  }
  for (const [name, bytes, pattern] of cases) {
    await t.test(name, t => {
      const f = fixture(t);
      put(f.root, 'parent.tgz', bytes);
      put(f.root, 'package.json', json({ dependencies: { parent: 'file:parent.tgz' } }));
      git(f.root, 'add', '.');
      git(f.root, '-c', 'user.name=Asset tests', '-c', 'user.email=assets@example.invalid', 'commit', '-qm', name);
      assert.throws(() => identity(f.root, git(f.root, 'rev-parse', 'HEAD').trim()), pattern);
    });
  }
});

test('plain raw/gzip package archives support directories, ustar prefixes and zero block padding', t => {
  const f = fixture(t);
  const filename = path.join(f.root, 'parent.tgz');
  const manifest = Buffer.from('{"name":"parent","version":"1.0.0"}');
  const bytes = Buffer.concat([
    tarHeader('package/', 0, '5'), tarHeader('package.json', manifest.length, '0', 'package'),
    manifest, Buffer.alloc(512 - manifest.length), Buffer.alloc(2048),
  ]);
  for (const payload of [bytes, gzipSync(bytes)]) {
    put(f.root, 'parent.tgz', payload);
    assert.doesNotThrow(() => inspectLocalTarball(filename));
  }
});

test('local tarball inspection bounds compressed size, expanded size and entry count', t => {
  const f = fixture(t);
  const filename = path.join(f.root, 'parent.tgz');
  const limit = 64 * 1024 ** 2;
  put(f.root, 'parent.tgz', '');
  fs.truncateSync(filename, limit + 1);
  assert.throws(() => inspectLocalTarball(filename), /tarball exceeds/);
  put(f.root, 'parent.tgz', gzipSync(Buffer.alloc(limit + 512)));
  assert.throws(() => inspectLocalTarball(filename), /expanded size exceeds limit/);
  const manifest = packageTar().subarray(0, -1024);
  const directories = Array.from({ length: 9999 }, (_, i) => tarHeader(`package/dir-${i}/`, 0, '5'));
  put(f.root, 'parent.tgz', Buffer.concat([manifest, ...directories, Buffer.alloc(1024)]));
  assert.doesNotThrow(() => inspectLocalTarball(filename));
  put(f.root, 'parent.tgz', Buffer.concat([manifest, ...directories, tarHeader('package/extra'), Buffer.alloc(1024)]));
  assert.throws(() => inspectLocalTarball(filename), /too many entries/);
});

test('current repository manifests and Agenda tarballs satisfy local dependency validation', () => {
  const root = path.resolve(__dirname, '../../..');
  const files = git(root, 'ls-files', '-z').split('\0').filter(Boolean).map(filename => ({ path: filename }));
  assert.doesNotThrow(() => localDependencies(root, files));
  for (const file of files.filter(file => /^packages\/agenda-patched\/.*\.tgz$/.test(file.path))) {
    // Inspect older tracked Agenda payloads too, even if today's manifests no
    // longer reference them. No npm install or remote access is needed.
    assert.doesNotThrow(() => inspectLocalTarball(path.join(root, file.path)));
  }
});

test('offline npm ci follows embedded shrinkwraps to mutable tarballs while tracked inputs stay identical', async t => {
  for (const kind of ['bare-resolved', 'legacy-version', 'symlink-alias']) {
    await t.test(kind, t => {
      const f = fixture(t);
      const installer = path.join(f.root, 'tools/install');
      const external = path.join(f.base, 'external-package');
      const parent = path.join(f.base, 'parent-package');
      const tarball = path.join(f.base, 'external-1.0.0.tgz');
      let resolved = tarball;
      put(f.root, '.gitignore', 'assets/angular/\n.tmp/\nnode_modules/\nignored/\n');
      if (kind === 'symlink-alias') {
        fs.mkdirSync(path.join(f.root, 'ignored'));
        resolved = path.join(f.root, 'ignored/alias.tgz');
        fs.symlinkSync(tarball, resolved);
      }
      let invocation = 0;
      function npm(cwd, ...args) {
        return execFileSync('npm', [...args, '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--update-notifier=false'], {
          cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...buildEnv(flags({}), '1'), npm_config_cache: path.join(f.base, `cache-${++invocation}`) },
        });
      }
      put(external, 'package.json', json({ name: 'external', version: '1.0.0' }));
      put(parent, 'package.json', json({ name: 'parent', version: '1.0.0', dependencies: { external: '1.0.0' } }));
      put(parent, 'npm-shrinkwrap.json', json(kind === 'legacy-version' ? {
        name: 'parent', version: '1.0.0', lockfileVersion: 1,
        dependencies: { external: { version: resolved } },
      } : {
        name: 'parent', version: '1.0.0', lockfileVersion: 3,
        packages: { '': { name: 'parent', version: '1.0.0', dependencies: { external: '1.0.0' } },
          'node_modules/external': { version: '1.0.0', resolved } },
      }));
      npm(parent, 'pack', '--pack-destination', f.base);
      put(installer, 'parent.tgz', fs.readFileSync(path.join(f.base, 'parent-1.0.0.tgz')));
      put(installer, 'package.json', json({ name: 'installer', version: '1.0.0', dependencies: { parent: 'file:parent.tgz' } }));
      put(installer, 'package-lock.json', json({ name: 'installer', version: '1.0.0', lockfileVersion: 3,
        packages: { '': { name: 'installer', version: '1.0.0', dependencies: { parent: 'file:parent.tgz' } },
          'node_modules/parent': { version: '1.0.0', resolved: 'file:parent.tgz', hasShrinkwrap: true } },
      }));
      git(f.root, 'add', '.');
      git(f.root, '-c', 'user.name=Asset tests', '-c', 'user.email=assets@example.invalid', 'commit', '-qm', kind);
      const revision = git(f.root, 'rev-parse', 'HEAD').trim();
      const files = git(f.root, 'ls-files', '-z').split('\0').filter(Boolean);
      const before = files.map(filename => sha256(fs.readFileSync(path.join(f.root, filename))));
      for (const content of ['module.exports = "before";\n', 'module.exports = "after";\n']) {
        put(external, 'index.js', content);
        npm(external, 'pack', '--pack-destination', f.base);
        npm(installer, 'ci');
        assert.equal(fs.readFileSync(path.join(installer, 'node_modules/parent/node_modules/external/index.js'), 'utf8'), content);
        assert.deepEqual(files.map(filename => sha256(fs.readFileSync(path.join(f.root, filename)))), before);
        assert.equal(git(f.root, 'status', '--porcelain'), '');
        assert.throws(() => identity(f.root, revision), /embedded npm-shrinkwrap\.json/);
      }
    });
  }
});

test('offline npm consumes changed external tarballs through bare declarations and lock resolutions; identity rejects both', async t => {
  for (const kind of ['declaration', 'lock-resolution']) {
    await t.test(kind, t => {
      const f = fixture(t);
      const installer = path.join(f.root, 'tools/install');
      const external = path.join(f.base, 'external-package');
      const tarball = path.join(f.base, 'external-1.0.0.tgz');
      const relative = '../../../external-1.0.0.tgz';
      put(external, 'package.json', json({ name: 'external', version: '1.0.0' }));
      put(f.root, '.gitignore', 'assets/angular/\n.tmp/\nnode_modules/\n');
      put(installer, 'package.json', json({ name: 'installer', version: '1.0.0',
        dependencies: { external: relative } }));
      let invocation = 0;
      function npm(cwd, ...args) {
        // Fresh caches prevent npm from hiding a changed file behind cached
        // integrity data. Offline mode forbids registry access for every call.
        return execFileSync('npm', [...args, '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], {
          cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...buildEnv(flags({}), '1'), npm_config_cache: path.join(f.base, `cache-${++invocation}`) },
        });
      }
      function packExternal(content) {
        put(external, 'index.js', content);
        npm(external, 'pack', '--pack-destination', f.base);
        assert.ok(fs.statSync(tarball).isFile());
      }
      packExternal('module.exports = "before";\n');
      npm(installer, 'install', '--package-lock-only');
      const lock = JSON.parse(fs.readFileSync(path.join(installer, 'package-lock.json')));
      if (kind === 'lock-resolution') {
        put(installer, 'package.json', json({ name: 'installer', version: '1.0.0', dependencies: { external: '1.0.0' } }));
        lock.packages[''].dependencies.external = '1.0.0';
      }
      lock.packages['node_modules/external'].resolved = relative;
      // npm permits a lock without integrity for local tarballs. Replacing it
      // then changes installed bytes with no change to any tracked source.
      delete lock.packages['node_modules/external'].integrity;
      put(installer, 'package-lock.json', json(lock));
      git(f.root, 'add', '.');
      git(f.root, '-c', 'user.name=Asset tests', '-c', 'user.email=assets@example.invalid', 'commit', '-qm', kind);
      const revision = git(f.root, 'rev-parse', 'HEAD').trim();
      const trackedLock = fs.readFileSync(path.join(installer, 'package-lock.json'));
      for (const content of ['module.exports = "before";\n', 'module.exports = "after";\n']) {
        packExternal(content);
        npm(installer, 'ci');
        assert.equal(fs.readFileSync(path.join(installer, 'node_modules/external/index.js'), 'utf8'), content);
        assert.deepEqual(fs.readFileSync(path.join(installer, 'package-lock.json')), trackedLock);
        assert.equal(git(f.root, 'status', '--porcelain'), '');
        assert.throws(() => identity(f.root, revision), /External local dependency/);
      }
    });
  }
});

test('restore fixes every payload mode under restrictive umasks and retains a private root', async t => {
  const f = await produced(t);
  for (const mask of [0o027, 0o077, 0o777]) {
    const stage = `${f.stage}-${mask}`;
    const result = spawnSync(process.execPath, ['-e', `
      process.umask(Number(process.argv[1]));
      require(process.argv[2]).consume(...process.argv.slice(3)).catch(error => { console.error(error); process.exitCode = 1; });
    `, String(mask), cli, f.root, f.revision, f.artifact, f.result.descriptorSha256, stage], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.statSync(stage).mode & 0o777, 0o700);
    function modes(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name);
        assert.equal(fs.statSync(filename).mode & 0o777, entry.isDirectory() ? 0o755 : 0o644, filename);
        if (entry.isDirectory()) modes(filename);
      }
    }
    modes(stage);
  }
});

test('mismatched provenance and corrupt or missing artifact files reject without exposing output', async t => {
  const f = await produced(t);
  const descriptorBytes = fs.readFileSync(path.join(f.artifact, 'artifact.json'));
  const archiveBytes = fs.readFileSync(path.join(f.artifact, 'assets.tar.gz'));
  const reject = async (checksum = f.result.descriptorSha256, pattern) => {
    await assert.rejects(consume(f.root, f.revision, f.artifact, checksum, f.stage), pattern);
    assert.equal(fs.existsSync(f.stage), false);
  };
  await reject('0'.repeat(64), /descriptor checksum/);
  for (const mutate of [
    d => { d.identity.revision = 'a'.repeat(40); },
    d => { d.identity.sourceSha256 = '0'.repeat(64); },
    d => { d.identity.toolchain.node = '0.0.1'; },
    d => { d.identity.toolchain.tools['angular:@angular/cli'] = '0.0.1'; },
    d => { d.identity.implementation[0].sha256 = '0'.repeat(64); },
    d => { d.identity.flags.WEBPACK_CSS_MINI = 'false'; },
  ]) {
    const checksum = rewriteDescriptor(f, mutate);
    await reject(checksum, /revision\/source\/toolchain\/flags/);
    fs.writeFileSync(path.join(f.artifact, 'artifact.json'), descriptorBytes);
  }
  fs.appendFileSync(path.join(f.artifact, 'assets.tar.gz'), 'corrupt');
  await reject(undefined, /Archive size\/checksum/);
  fs.writeFileSync(path.join(f.artifact, 'assets.tar.gz'), archiveBytes);
  fs.rmSync(path.join(f.artifact, 'assets.tar.gz'));
  await reject(undefined, /ENOENT/);
  fs.writeFileSync(path.join(f.artifact, 'assets.tar.gz'), archiveBytes);
  fs.rmSync(path.join(f.artifact, 'artifact.json'));
  await reject(undefined, /ENOENT/);
});

test('even a rechecksummed archive cannot omit or corrupt required inventory files', async t => {
  const f = await produced(t);
  const manifest = integration.verify(f.root, f.revision);
  for (const kind of ['missing', 'changed']) {
    const replacement = path.join(f.base, `replacement-${kind}.tgz`);
    const missing = '.tmp/public/default/default/js/redoc.standalone.js';
    const files = [integration.MANIFEST, integration.IMAGE_IDENTITY].map(filename => {
      const bytes = fs.readFileSync(path.join(f.root, filename));
      return { path: filename, size: bytes.length, sha256: sha256(bytes) };
    }).concat(manifest.files.filter(file => kind !== 'missing' || file.path !== missing));
    if (kind === 'changed') {
      put(f.root, missing, 'changed content');
      const file = files.find(file => file.path === missing);
      file.size = fs.statSync(path.join(f.root, missing)).size;
      file.sha256 = sha256(fs.readFileSync(path.join(f.root, missing)));
    }
    await pack(f.root, files, replacement);
    fs.copyFileSync(replacement, path.join(f.artifact, 'assets.tar.gz'));
    const checksum = rewriteDescriptor(f, descriptor => {
      descriptor.archive.size = fs.statSync(replacement).size;
      descriptor.archive.sha256 = sha256(fs.readFileSync(replacement));
    });
    await assert.rejects(consume(f.root, f.revision, f.artifact, checksum, f.stage), /inventory\/checksum/);
    assert.equal(fs.existsSync(f.stage), false);
  }
});

function maliciousHeader(name, type = '0') {
  const block = header('assets/placeholder', 0);
  block.fill(0, 0, 100); block.write(name, 0, 100);
  block[156] = type.charCodeAt(0);
  block.fill(32, 148, 156);
  const sum = block.reduce((a, b) => a + b, 0);
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8);
  return block;
}
for (const [name, type, pattern] of [
  ['assets/../../escaped', '0', /Unsafe archive path/],
  ['/tmp/escaped', '0', /Unsafe archive path/],
  ['assets/..\\escaped', '0', /Unsafe archive path/],
  ['assets/link', '2', /Only regular files/],
  ['assets/hardlink', '1', /Only regular files/],
  ['assets/device', '3', /Only regular files/],
  ['assets/pax', 'x', /Only regular files/],
]) {
  test(`rechecksummed ${type}:${name} is rejected by extraction`, async t => {
    const f = await produced(t);
    const checksum = replaceArchive(f, Buffer.concat([maliciousHeader(name, type), Buffer.alloc(1024)]));
    await assert.rejects(consume(f.root, f.revision, f.artifact, checksum, f.stage), pattern);
    assert.equal(fs.existsSync(f.stage), false);
    assert.equal(fs.existsSync(path.join(f.base, 'escaped')), false);
    assert.deepEqual(fs.readdirSync(f.base).filter(name => name.startsWith('.web-assets-consume-')), []);
  });
}

test('duplicate entries, truncated archives and appended payloads fail closed', async t => {
  const f = await produced(t);
  const h = header('assets/duplicate', 0);
  for (const [bytes, pattern] of [
    [Buffer.concat([h, h, Buffer.alloc(1024)]), /Duplicate/],
    [Buffer.concat([h, Buffer.alloc(512)]), /Truncated/],
    [Buffer.concat([Buffer.alloc(1024), h]), /after archive trailer/],
    [Buffer.from('broken'), /Truncated/],
  ]) {
    const checksum = replaceArchive(f, bytes);
    await assert.rejects(consume(f.root, f.revision, f.artifact, checksum, f.stage), pattern);
  }
});

test('rechecksummed gzip rejects trailing garbage, additional members and corrupt trailers', async t => {
  const f = await produced(t);
  const valid = fs.readFileSync(path.join(f.artifact, 'assets.tar.gz'));
  const badChecksum = Buffer.from(valid);
  badChecksum[badChecksum.length - 8] ^= 1;
  const badSize = Buffer.from(valid);
  badSize[badSize.length - 4] ^= 1;
  const optionalHeader = Buffer.from(valid);
  optionalHeader[3] = 8;
  for (const [name, bytes, pattern] of [
    ['zero garbage', Buffer.concat([valid, Buffer.alloc(16)]), /gzip framing/],
    ['zero then arbitrary garbage', Buffer.concat([valid, Buffer.from([0, 0, 1, 2, 3])]), /gzip framing/],
    ['arbitrary garbage', Buffer.concat([valid, Buffer.from('garbage')]), /gzip framing/],
    ['empty member', Buffer.concat([valid, gzipSync(Buffer.alloc(0))]), /gzip framing/],
    ['zero member', Buffer.concat([valid, gzipSync(Buffer.alloc(1024))]), /gzip framing/],
    ['payload member', Buffer.concat([valid, gzipSync(Buffer.from('payload'))]), /gzip framing/],
    ['checksum', badChecksum, /Gzip checksum\/size/],
    ['size', badSize, /Gzip checksum\/size/],
    ['truncated trailer', valid.subarray(0, -1), /unexpected end|gzip framing/],
    ['optional header', optionalHeader, /Unsupported gzip header/],
  ]) {
    const checksum = replaceCompressedArchive(f, bytes);
    await assert.rejects(consume(f.root, f.revision, f.artifact, checksum, f.stage), pattern, name);
    assert.equal(fs.existsSync(f.stage), false, name);
    assert.deepEqual(fs.readdirSync(f.base).filter(name => name.startsWith('.web-assets-consume-')), []);
  }
});

test('source paths and aliases into them cannot be restore destinations', async t => {
  const f = await produced(t);
  await assert.rejects(consume(f.root, f.revision, f.artifact, f.result.descriptorSha256,
    path.join(f.root, 'new-output')), /separate from the source/);
  fs.symlinkSync(f.root, path.join(f.base, 'alias'));
  assert.throws(() => outsideCheckout(f.root, path.join(f.base, 'alias/output')), /separate from the source/);
});

test('producer refuses missing application output and source changes during build', async t => {
  const f = fixture(t);
  await assert.rejects(produce(f.root, f.revision, f.artifact, () => {
    f.payload();
    fs.rmSync(path.join(f.root, 'assets/angular/some-extra-app/browser/main-A.js'));
  }), /main|prepared asset/);
  assert.equal(fs.existsSync(f.artifact), false);
  await assert.rejects(produce(f.root, f.revision, f.artifact, () => {
    f.payload(); put(f.root, 'backend.ts', 'changed');
  }));
  assert.equal(fs.existsSync(f.artifact), false);
});

test('producer rejects output symlinks rather than archiving an external payload', async t => {
  const f = fixture(t);
  await assert.rejects(produce(f.root, f.revision, f.artifact, () => {
    f.payload();
    fs.symlinkSync(path.join(f.root, 'backend.ts'), path.join(f.root, 'assets/angular/linked.js'));
  }), /Symlink/);
  assert.equal(fs.existsSync(f.artifact), false);
});

test('build ordering, errors and environment are explicit', t => {
  const f = fixture(t);
  const angular = STEPS.findIndex(([, , args]) => args.includes('support/build/compileProductionAngular.sh'));
  const webpack = STEPS.findIndex(([, , args]) => args.includes('webpack'));
  assert.ok(angular > 0 && webpack === angular + 1);
  assert.ok(STEPS.slice(0, angular).some(([dir, , args]) => dir === 'packages/sails-ng-common' && args.includes('compile')));
  let calls = 0;
  assert.throws(() => build(f.root, identity(f.root, f.revision), () => {
    calls++; return { status: 9 };
  }), /Build failed/);
  assert.equal(calls, 1);
  const env = buildEnv(flags({}), '123', { PATH: '/bin', HOME: '/home/test', WEBPACK_SKIP: 'true', npm_config_omit: 'dev', UNTRACKED_BUILD_FLAG: 'x' });
  assert.equal(env.WEBPACK_SKIP, 'false');
  assert.equal(env.npm_config_omit, undefined);
  assert.equal(env.UNTRACKED_BUILD_FLAG, undefined);
  assert.equal(env.npm_config_userconfig, path.join(__dirname, 'empty.npmrc'));
  assert.throws(() => flags({ BUILD_PORTAL_NG_FORM_CUSTOM: 'true' }), /External custom/);
});

test('CLI emits a recognizable miss and exit 10 instead of silently rebuilding', async t => {
  const f = await produced(t);
  const result = spawnSync(process.execPath, [cli, 'restore', f.revision, f.root,
    f.artifact, '0'.repeat(64), f.stage], { encoding: 'utf8' });
  assert.equal(result.status, 10);
  assert.match(result.stderr, /WEB_ASSETS_CACHE_MISS.*Rebuild with produce/);
  assert.equal(fs.existsSync(f.stage), false);
});

test('optional real existing outputs round trip without any byte changes', {
  skip: process.env.RB_WEB_ASSETS_COMPARE_EXISTING !== 'true',
}, async t => {
  const f = fixture(t);
  const repository = path.resolve(__dirname, '../../..');
  for (const directory of ['assets', '.tmp/public']) {
    fs.rmSync(path.join(f.root, directory), { recursive: true, force: true });
    fs.cpSync(path.join(repository, directory), path.join(f.root, directory), { recursive: true });
  }
  fs.copyFileSync(path.join(repository, 'angular/angular.json'), path.join(f.root, 'angular/angular.json'));
  // This test compares archive transport against the existing local bytes.
  // Those bytes may be an incomplete development build, so report production
  // validation separately; never publish this raw transport fixture.
  try {
    integration.generate(f.root, f.revision);
    t.diagnostic('Existing outputs also satisfy the production payload validator');
  } catch (error) {
    t.diagnostic(`Existing outputs are not publishable: ${error.message}`);
  }
  function inventory(root, relative) {
    const absolute = path.join(root, relative);
    const stat = fs.lstatSync(absolute);
    if (stat.isDirectory()) return fs.readdirSync(absolute).sort().flatMap(name => inventory(root, `${relative}/${name}`));
    assert.ok(stat.isFile());
    return [{ path: relative, size: stat.size, sha256: sha256(fs.readFileSync(absolute)) }];
  }
  const files = ['assets', '.tmp/public'].flatMap(name => inventory(f.root, name));
  const archive = path.join(f.base, 'real.tar.gz');
  await pack(f.root, files, archive);
  fs.mkdirSync(f.stage);
  await unpack(archive, f.stage);
  assert.deepEqual(['assets', '.tmp/public'].flatMap(name => inventory(f.stage, name)), files);
  t.diagnostic(`Compared ${files.length} real output files (${files.reduce((sum, file) => sum + file.size, 0)} bytes), archive ${fs.statSync(archive).size} bytes`);
});
