let expect: Chai.ExpectStatic;
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import sinon from 'sinon';

const require = createRequire(import.meta.url);

describe('hookDiscovery', function () {
  before(async function () {
    const chai = await import('chai');
    expect = chai.expect;
  });
  let appPath: string;
  let discoverRedboxHookPackages: typeof import('../../src/hooks/hookDiscovery').discoverRedboxHookPackages;
  let getHookPrecedenceOrder: typeof import('../../src/hooks/hookDiscovery').getHookPrecedenceOrder;
  let getHookProcessingOrder: typeof import('../../src/hooks/hookDiscovery').getHookProcessingOrder;
  let readHookLoadPriority: typeof import('../../src/hooks/hookDiscovery').readHookLoadPriority;

  function writeJson(filePath: string, value: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
  }

  function writeFile(filePath: string, content = ''): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  function createHook(packageName: string, sailsConfig: Record<string, unknown> = { isHook: true }): string {
    const hookRoot = path.join(appPath, 'node_modules', packageName);
    writeJson(path.join(hookRoot, 'package.json'), {
      name: packageName,
      main: 'index.js',
      sails: sailsConfig,
    });
    writeFile(path.join(hookRoot, 'index.js'), 'module.exports = {};');
    return hookRoot;
  }

  beforeEach(function () {
    ({
      discoverRedboxHookPackages,
      getHookPrecedenceOrder,
      getHookProcessingOrder,
      readHookLoadPriority,
    } = require('../../src/hooks/hookDiscovery'));

    appPath = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-hook-discovery-')));
    writeJson(path.join(appPath, 'package.json'), {
      dependencies: {
        'redbox-hook-alpha': '1.0.0',
        'redbox-hook-beta': '1.0.0',
        'not-a-hook': '1.0.0',
      },
      devDependencies: {
        '@scope/redbox-hook-gamma': '1.0.0',
      },
    });
  });

  afterEach(function () {
    fs.rmSync(appPath, { recursive: true, force: true });
    sinon.restore();
  });

  it('preserves existing precedence when hookLoadPriority is missing', function () {
    createHook('redbox-hook-alpha');
    createHook('redbox-hook-beta');
    createHook('@scope/redbox-hook-gamma');
    createHook('not-a-hook', {});

    const hooks = discoverRedboxHookPackages(appPath);

    expect(hooks.map(hook => hook.name)).to.deep.equal([
      'redbox-hook-beta',
      'redbox-hook-alpha',
      '@scope/redbox-hook-gamma',
    ]);
    expect(getHookProcessingOrder(appPath).map(hook => hook.name)).to.deep.equal([
      '@scope/redbox-hook-gamma',
      'redbox-hook-alpha',
      'redbox-hook-beta',
    ]);
  });

  it('returns listed hooks first and keeps unlisted hooks after them', function () {
    writeJson(path.join(appPath, 'package.json'), {
      hookLoadPriority: ['redbox-hook-alpha', '@scope/redbox-hook-gamma'],
      dependencies: {
        'redbox-hook-alpha': '1.0.0',
        'redbox-hook-beta': '1.0.0',
      },
      devDependencies: {
        '@scope/redbox-hook-gamma': '1.0.0',
      },
    });
    createHook('redbox-hook-alpha');
    createHook('redbox-hook-beta');
    createHook('@scope/redbox-hook-gamma');

    expect(getHookPrecedenceOrder(appPath).map(hook => hook.name)).to.deep.equal([
      'redbox-hook-alpha',
      '@scope/redbox-hook-gamma',
      'redbox-hook-beta',
    ]);
    expect(getHookProcessingOrder(appPath).map(hook => hook.name)).to.deep.equal([
      'redbox-hook-beta',
      '@scope/redbox-hook-gamma',
      'redbox-hook-alpha',
    ]);
  });

  it('warns for invalid, duplicate, and unknown hookLoadPriority entries', function () {
    const warn = sinon.stub(console, 'warn');
    writeJson(path.join(appPath, 'package.json'), {
      hookLoadPriority: ['redbox-hook-alpha', 'redbox-hook-alpha', '', 42, 'redbox-hook-missing'],
      dependencies: {
        'redbox-hook-alpha': '1.0.0',
      },
    });
    createHook('redbox-hook-alpha');

    expect(readHookLoadPriority(appPath)).to.deep.equal(['redbox-hook-alpha', 'redbox-hook-missing']);
    expect(getHookPrecedenceOrder(appPath).map(hook => hook.name)).to.deep.equal(['redbox-hook-alpha']);
    expect(warn.calledWith('[redbox-loader:warn] Duplicate hookLoadPriority entry "redbox-hook-alpha"; keeping first occurrence.')).to.be.true;
    expect(warn.calledWith('[redbox-loader:warn] Ignoring invalid hookLoadPriority entry ""; expected a package name string.')).to.be.true;
    expect(warn.calledWith('[redbox-loader:warn] Ignoring invalid hookLoadPriority entry 42; expected a package name string.')).to.be.true;
    expect(warn.calledWith('[redbox-loader:warn] hookLoadPriority references "redbox-hook-missing", but it is not an installed ReDBox hook.')).to.be.true;
  });

  it('warns and behaves as empty when hookLoadPriority is not an array', function () {
    const warn = sinon.stub(console, 'warn');
    writeJson(path.join(appPath, 'package.json'), {
      hookLoadPriority: 'redbox-hook-alpha',
      dependencies: {
        'redbox-hook-alpha': '1.0.0',
        'redbox-hook-beta': '1.0.0',
      },
    });
    createHook('redbox-hook-alpha');
    createHook('redbox-hook-beta');

    expect(getHookPrecedenceOrder(appPath).map(hook => hook.name)).to.deep.equal([
      'redbox-hook-beta',
      'redbox-hook-alpha',
    ]);
    expect(warn.calledWith('[redbox-loader:warn] package.json hookLoadPriority must be an array of package names; ignoring value.')).to.be.true;
  });
});
