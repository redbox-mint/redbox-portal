let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as sinon from 'sinon';

describe('CoreController hook view resolution', function () {
  let appPath: string;
  let controller: { sendView(req: Sails.Req, res: Sails.Res, view: string, locals?: object): void };
  let originalSails: unknown;

  function writeJson(filePath: string, value: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
  }

  function writeFile(filePath: string, content = ''): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  function createHook(packageName = 'redbox-hook-client'): string {
    const hookRoot = path.join(appPath, 'node_modules', packageName);
    writeJson(path.join(hookRoot, 'package.json'), {
      name: packageName,
      main: 'index.js',
      sails: { isHook: true },
    });
    writeFile(path.join(hookRoot, 'index.js'), 'module.exports = {};');
    return hookRoot;
  }

  function createReq() {
    return {
      options: {
        locals: {
          branding: 'brand',
          portal: 'portal',
        },
      },
    };
  }

  function createRes() {
    return {
      locals: {},
      notFound: sinon.stub(),
      view: sinon.stub(),
    };
  }

  beforeEach(function () {
    const { Controllers } = require('../../src/CoreController') as typeof import('../../src/CoreController');
    class TestController extends Controllers.Core.Controller { }

    originalSails = (global as { sails?: unknown }).sails;
    appPath = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-core-controller-')));
    writeJson(path.join(appPath, 'package.json'), {
      dependencies: {
        'redbox-hook-client': '1.0.0',
      },
    });
    (global as { sails?: unknown }).sails = {
      config: {
        appPath,
        ng2: {
          use_bundled: false,
          apps: {},
        },
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
        trace: sinon.stub(),
      },
    };
    (global as { _?: unknown })._ = require('lodash');
    controller = new TestController();
  });

  afterEach(function () {
    fs.rmSync(appPath, { recursive: true, force: true });
    (global as { sails?: unknown }).sails = originalSails;
    delete (global as { _?: unknown })._;
    sinon.restore();
  });

  it('resolves hook views without copying them into app views', function () {
    const hookRoot = createHook();
    const hookView = path.join(hookRoot, 'views', 'default', 'default', 'homepage.ejs');
    writeFile(hookView, 'hook homepage');

    const req = createReq();
    const res = createRes();
    controller.sendView(req as unknown as Sails.Req, res as unknown as Sails.Res, 'homepage');

    expect(res.notFound.called).to.equal(false);
    expect(res.view.firstCall.args[0]).to.equal(hookView.slice(0, -'.ejs'.length));
    expect(res.view.firstCall.args[1].templateDirectoryLocation).to.equal(`${path.dirname(hookView)}${path.sep}`);
    expect(res.view.firstCall.args[1].__dirname).to.equal(hookView);
  });

  it('uses a hook view ahead of a core view for the same candidate path', function () {
    const hookRoot = createHook();
    const coreView = path.join(appPath, 'views', 'default', 'default', 'homepage.ejs');
    const hookView = path.join(hookRoot, 'views', 'default', 'default', 'homepage.ejs');
    writeFile(coreView, 'core homepage');
    writeFile(hookView, 'hook homepage');

    const res = createRes();
    controller.sendView(createReq() as unknown as Sails.Req, res as unknown as Sails.Res, 'homepage');

    expect(res.view.firstCall.args[0]).to.equal(hookView.slice(0, -'.ejs'.length));
    expect(res.view.firstCall.args[1].templateDirectoryLocation).to.equal(`${path.dirname(hookView)}${path.sep}`);
  });

  it('uses a core brand-specific view before a hook default/default view', function () {
    const hookRoot = createHook();
    const coreView = path.join(appPath, 'views', 'brand', 'portal', 'homepage.ejs');
    const hookView = path.join(hookRoot, 'views', 'default', 'default', 'homepage.ejs');
    writeFile(coreView, 'core branded homepage');
    writeFile(hookView, 'hook default homepage');

    const res = createRes();
    controller.sendView(createReq() as unknown as Sails.Req, res as unknown as Sails.Res, 'homepage');

    expect(res.view.firstCall.args[0]).to.equal('brand/portal/homepage');
    expect(res.view.firstCall.args[1].templateDirectoryLocation).to.equal(`${path.dirname(coreView)}${path.sep}`);
  });

  it('allows a hook view to use a core layout', function () {
    const hookRoot = createHook();
    const hookView = path.join(hookRoot, 'views', 'default', 'default', 'homepage.ejs');
    const coreLayout = path.join(appPath, 'views', 'default', 'default', 'layout.ejs');
    writeFile(hookView, 'hook homepage');
    writeFile(coreLayout, '<%- body %>');

    const res = createRes();
    controller.sendView(createReq() as unknown as Sails.Req, res as unknown as Sails.Res, 'homepage');

    const locals = res.view.firstCall.args[1];
    expect(locals.layout).to.equal(false);
    expect(path.resolve(path.dirname(hookView), locals._layoutFile)).to.equal(coreLayout);
    expect(locals.layoutDirectoryLocation).to.equal(`${path.dirname(coreLayout)}${path.sep}`);
  });

  it('adds core mirror directories so hook layouts can include core-level files', function () {
    const hookRoot = createHook();
    const hookView = path.join(hookRoot, 'views', 'default', 'default', 'homepage.ejs');
    const hookLayout = path.join(hookRoot, 'views', 'default', 'default', 'layout.ejs');
    writeFile(hookView, 'hook homepage');
    writeFile(hookLayout, '<% include("../../functions") %><%- body %>');
    writeFile(path.join(appPath, 'views', 'functions.ejs'), '<% /* core helpers */ %>');

    const res = createRes();
    controller.sendView(createReq() as unknown as Sails.Req, res as unknown as Sails.Res, 'homepage');

    const locals = res.view.firstCall.args[1];
    expect(path.resolve(path.dirname(hookView), locals._layoutFile)).to.equal(hookLayout);
    expect(locals.views).to.include(path.join(appPath, 'views', 'default', 'default'));
  });

  it('exposes the actual core layout directory so hook partials can resolve from core layouts', function () {
    const hookRoot = createHook();
    const coreView = path.join(appPath, 'views', 'default', 'default', 'homepage.ejs');
    const coreLayout = path.join(appPath, 'views', 'default', 'default', 'layout.ejs');
    writeFile(coreView, 'core homepage');
    writeFile(coreLayout, '<%- superPartial("/layout/footer.ejs", branding, portal, true) %>');
    writeFile(path.join(hookRoot, 'views', 'default', 'default', 'layout', 'footer.ejs'), 'hook footer');

    const res = createRes();
    controller.sendView(createReq() as unknown as Sails.Req, res as unknown as Sails.Res, 'homepage');

    expect(res.view.firstCall.args[1].layoutDirectoryLocation).to.equal(`${path.dirname(coreLayout)}${path.sep}`);
  });
});
