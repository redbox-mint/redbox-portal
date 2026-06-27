let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('hookResources', function () {
  let appPath: string;
  let discoverRedboxHookResources: typeof import('../../src/hooks/hookResources').discoverRedboxHookResources;
  let getHookAssetRoots: typeof import('../../src/hooks/hookResources').getHookAssetRoots;
  let getHookViewRoots: typeof import('../../src/hooks/hookResources').getHookViewRoots;
  let resolveHookAssetFile: typeof import('../../src/hooks/hookResources').resolveHookAssetFile;
  let resolveHookViewFile: typeof import('../../src/hooks/hookResources').resolveHookViewFile;

  function writeJson(filePath: string, value: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
  }

  function writeFile(filePath: string, content = ''): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  function createHook(packageName: string, sailsConfig: Record<string, unknown>, dirs: Array<'views' | 'assets'>): string {
    const hookRoot = path.join(appPath, 'node_modules', packageName);
    writeJson(path.join(hookRoot, 'package.json'), {
      name: packageName,
      main: 'index.js',
      sails: sailsConfig,
    });
    writeFile(path.join(hookRoot, 'index.js'), 'module.exports = {};');
    for (const dir of dirs) {
      fs.mkdirSync(path.join(hookRoot, dir), { recursive: true });
    }
    return hookRoot;
  }

  beforeEach(function () {
    ({
      discoverRedboxHookResources,
      getHookAssetRoots,
      getHookViewRoots,
      resolveHookAssetFile,
      resolveHookViewFile,
    } = require('../../src/hooks/hookResources'));

    appPath = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-hook-resources-')));
    writeJson(path.join(appPath, 'package.json'), {
      dependencies: {
        'redbox-hook-alpha': '1.0.0',
        'redbox-hook-beta': '1.0.0',
        'redbox-hook-empty': '1.0.0',
        'not-a-hook': '1.0.0',
      },
      devDependencies: {
        'redbox-hook-dev-only': '1.0.0',
      },
    });
  });

  afterEach(function () {
    fs.rmSync(appPath, { recursive: true, force: true });
  });

  it('discovers hook roots from dependencies and devDependencies', function () {
    createHook('redbox-hook-alpha', { isHook: true }, ['views']);
    createHook('redbox-hook-beta', { hasConfig: true }, ['assets']);
    createHook('redbox-hook-dev-only', { hasFormConfigs: true }, ['views']);
    createHook('redbox-hook-empty', { isHook: true }, []);
    createHook('not-a-hook', {}, ['views', 'assets']);

    const resources = discoverRedboxHookResources(appPath);

    expect(resources.map(resource => resource.name)).to.deep.equal([
      'redbox-hook-alpha',
      'redbox-hook-beta',
      'redbox-hook-dev-only',
    ]);
  });

  it('returns view and asset roots in runtime override order', function () {
    const alphaRoot = createHook('redbox-hook-alpha', { isHook: true }, ['views', 'assets']);
    const betaRoot = createHook('redbox-hook-beta', { isHook: true }, ['views', 'assets']);

    expect(getHookViewRoots(appPath)).to.deep.equal([
      path.join(betaRoot, 'views'),
      path.join(alphaRoot, 'views'),
    ]);
    expect(getHookAssetRoots(appPath)).to.deep.equal([
      path.join(betaRoot, 'assets'),
      path.join(alphaRoot, 'assets'),
    ]);
  });

  it('resolves later hooks ahead of earlier hooks for the same path', function () {
    const alphaRoot = createHook('redbox-hook-alpha', { isHook: true }, ['views']);
    const betaRoot = createHook('redbox-hook-beta', { isHook: true }, ['views']);
    writeFile(path.join(alphaRoot, 'views', 'default', 'default', 'homepage.ejs'), 'alpha');
    writeFile(path.join(betaRoot, 'views', 'default', 'default', 'homepage.ejs'), 'beta');

    const resolved = resolveHookViewFile(appPath, 'default/default/homepage');

    expect(resolved?.absolutePath).to.equal(path.join(betaRoot, 'views', 'default', 'default', 'homepage.ejs'));
  });

  it('resolves assets and rejects traversal paths', function () {
    const hookRoot = createHook('redbox-hook-alpha', { isHook: true }, ['assets']);
    writeFile(path.join(hookRoot, 'assets', 'styles', 'client-branding.css'), 'body{}');

    const resolved = resolveHookAssetFile(appPath, 'styles/client-branding.css');

    expect(resolved?.absolutePath).to.equal(path.join(hookRoot, 'assets', 'styles', 'client-branding.css'));
    expect(resolveHookAssetFile(appPath, '../secret.txt')).to.equal(null);
    expect(resolveHookAssetFile(appPath, '%2e%2e/secret.txt')).to.equal(null);
    expect(resolveHookViewFile(appPath, 'default/default/%2e%2e/secret')).to.equal(null);
  });
});
