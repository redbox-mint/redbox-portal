let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import * as sinon from 'sinon';

const require = createRequire(import.meta.url);

describe('hook static assets middleware', function () {
  let appPath: string;
  let hookRoot: string;
  let originalSails: unknown;
  let http: typeof import('../../src/config/http.config').http;
  let resolveHookStaticAssetPath: typeof import('../../src/config/http.config').resolveHookStaticAssetPath;

  function writeJson(filePath: string, value: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
  }

  function writeFile(filePath: string, content = ''): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  beforeEach(function () {
    ({ http, resolveHookStaticAssetPath } = require('../../src/config/http.config'));

    originalSails = (global as { sails?: unknown }).sails;
    appPath = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-hook-assets-')));
    hookRoot = path.join(appPath, 'node_modules', 'redbox-hook-client');
    writeJson(path.join(appPath, 'package.json'), {
      dependencies: {
        'redbox-hook-client': '1.0.0',
      },
    });
    writeJson(path.join(hookRoot, 'package.json'), {
      name: 'redbox-hook-client',
      main: 'index.js',
      sails: { isHook: true },
    });
    writeFile(path.join(hookRoot, 'index.js'), 'module.exports = {};');
    writeFile(path.join(hookRoot, 'assets', 'styles', 'client-branding.css'), 'body{}');
    writeFile(path.join(hookRoot, 'assets', 'default', 'rdmp', 'styles', 'theme.css'), 'theme');
    (global as { sails?: unknown }).sails = {
      config: {
        appPath,
      },
    };
  });

  afterEach(function () {
    fs.rmSync(appPath, { recursive: true, force: true });
    (global as { sails?: unknown }).sails = originalSails;
    sinon.restore();
  });

  it('resolves direct hook assets', function () {
    const resolved = resolveHookStaticAssetPath(appPath, '/styles/client-branding.css');

    expect(resolved).to.equal(path.join(hookRoot, 'assets', 'styles', 'client-branding.css'));
  });

  it('resolves branded hook asset fallback paths', function () {
    const resolved = resolveHookStaticAssetPath(appPath, '/brand/rdmp/styles/theme.css');

    expect(resolved).to.equal(path.join(hookRoot, 'assets', 'default', 'rdmp', 'styles', 'theme.css'));
  });

  it('does not let less-specific hook assets override more-specific core assets', function () {
    writeFile(path.join(hookRoot, 'assets', 'default', 'default', 'styles', 'theme.css'), 'hook default');
    writeFile(path.join(appPath, '.tmp', 'public', 'brand', 'rdmp', 'styles', 'theme.css'), 'core brand');

    const resolved = resolveHookStaticAssetPath(appPath, '/brand/rdmp/styles/theme.css');

    expect(resolved).to.equal(null);
  });

  it('rejects traversal and invalid encoded paths', function () {
    expect(resolveHookStaticAssetPath(appPath, '/styles/%2e%2e/client-branding.css')).to.equal(null);
    expect(resolveHookStaticAssetPath(appPath, '/%2e%2e/rdmp/styles/theme.css')).to.equal(null);
    expect(resolveHookStaticAssetPath(appPath, '/brand/%2e%2e/styles/theme.css')).to.equal(null);
  });

  it('falls through when no hook asset exists', function () {
    const req = {
      originalUrl: '/styles/missing.css',
      url: '/styles/missing.css',
    };
    const res = {
      sendFile: sinon.stub(),
    };
    const next = sinon.stub();

    http.middleware.hookStaticAssets?.(req as any, res as any, next);

    expect(res.sendFile.called).to.equal(false);
    expect(next.calledOnce).to.equal(true);
  });

  it('serves hook assets with sendFile', function () {
    const req = {
      originalUrl: '/styles/missing.css',
      url: '/styles/client-branding.css',
    };
    const res = {
      sendFile: sinon.stub().callsFake((_filePath: string, callback: (err?: Error) => void) => callback()),
    };
    const next = sinon.stub();

    http.middleware.hookStaticAssets?.(req as any, res as any, next);

    expect(res.sendFile.calledOnceWith(path.join(hookRoot, 'assets', 'styles', 'client-branding.css'))).to.equal(true);
    expect(next.called).to.equal(false);
  });

  it('registers hook static assets before branded static fallback', function () {
    expect(http.middleware.order.indexOf('hookStaticAssets')).to.be.lessThan(
      http.middleware.order.indexOf('brandingAndPortalAwareStaticRouter')
    );
  });
});
