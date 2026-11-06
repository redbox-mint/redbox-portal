import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import * as sinon from 'sinon';

import { Controllers } from '../../src/controllers/BrandingController';
import { auth } from '../../src/config/auth.config';
import { routes } from '../../src/config/routes.config';
import {createSinonStubLogger} from "../logger.test";
import { webpack } from '../../src/config/webpack.config';

describe('admin API docs', function () {
    let expect: Chai.ExpectStatic;
    let controller: Controllers.Branding;
    let originalSails: any;
    let originalUnderscore: any;

    before(async function () {
        const chai = await import('chai');
        expect = chai.expect;
    });

    beforeEach(function () {
        originalSails = (global as any).sails;
        originalUnderscore = (global as any)._;

        (global as any).sails = {
            config: {
                auth,
                apiRoutesHooks: [],
            },
            log: createSinonStubLogger(sinon),
        };
        (global as any)._ = require('lodash');

        controller = new Controllers.Branding();
    });

    afterEach(function () {
        sinon.restore();
        (global as any).sails = originalSails;
        (global as any)._ = originalUnderscore;
    });

    it('wires the branded admin docs routes to the expected controllers', function () {
        expect(routes['get /:branding/:portal/admin/api-docs']).to.deep.equal({
            controller: 'RenderViewController',
            action: 'render',
            locals: { view: 'admin/api-docs' },
        });
        expect(routes['get /:branding/:portal/admin/api-docs/openapi.json']).to.equal('BrandingController.renderSwaggerJSON');
    });

    it('grants admin read access to the docs page and its openapi payload', function () {
        const docsRule = auth.rules.find(rule => rule.path === '/:branding/:portal/admin/api-docs');
        const docsPayloadRule = auth.rules.find(rule => rule.path === '/:branding/:portal/admin/api-docs(/*)');

        expect(docsRule).to.deep.equal({
            path: '/:branding/:portal/admin/api-docs',
            role: 'Admin',
            can_read: true,
        });
        expect(docsPayloadRule).to.deep.equal({
            path: '/:branding/:portal/admin/api-docs(/*)',
            role: 'Admin',
            can_read: true,
        });
    });

    it('renders the branded OpenAPI document as JSON', async function () {
        this.timeout(20_000);
        const param = sinon.stub();
        param.withArgs('branding').returns('default');
        param.withArgs('portal').returns('rdmp');
        const req = {
            param,
        } as unknown as Sails.Req;
        const res = {
            contentType: sinon.stub(),
            send: sinon.stub().returnsThis(),
        } as unknown as Sails.Res;

        await controller.renderSwaggerJSON(req, res);

        expect((res as any).contentType.calledOnceWithExactly('application/json')).to.equal(true);
        const doc = JSON.parse(String((res as any).send.firstCall.args[0]));
        expect(doc.paths).to.have.property('/default/rdmp/api/users');
        expect(doc.paths).to.not.have.property('/{branding}/{portal}/api/users');
    });

    it('isolates the local viewer inside the shared admin shell', function () {
        const viewPath = path.resolve(__dirname, '../../../../views/default/default/admin/api-docs.ejs');
        const contents = fs.readFileSync(viewPath, 'utf8');

        expect(contents).to.include("include('layout/start.ejs')");
        expect(contents).to.include('<iframe');
        expect(contents).to.include('/admin/api-docs/reference');
        const reference = fs.readFileSync(path.resolve(__dirname, '../../../../views/default/default/admin/api-docs-reference.ejs'), 'utf8');
        expect(reference).to.include('<!doctype html>');
        expect(reference).to.include('contentSecurityPolicyNonce');
        expect(reference).to.include('/default/default/js/admin-api-docs-init.js');
        expect(reference).to.include('/default/default/js/admin-api-docs-bootstrap.js');
        expect(reference).to.include('/admin/api-docs/openapi.json');
        expect(reference).to.include('/default/default/js/redoc.standalone.js');
        expect(reference).to.not.include('cdn.redoc.ly');
    });

    it('loads the Redoc 3 ES module bundle through a module bootstrap', function () {
        const viewPath = path.resolve(__dirname, '../../../../views/default/default/admin/api-docs-reference.ejs');
        const view = fs.readFileSync(viewPath, 'utf8');
        expect(view).to.match(/js\/redoc\.standalone\.js" type="module"/);
        expect(view).to.match(/js\/admin-api-docs-bootstrap\.js" type="module"/);

        const bootstrapPath = path.resolve(__dirname, '../../../../assets/default/default/js/admin-api-docs-bootstrap.js');
        const bootstrap = fs.readFileSync(bootstrapPath, 'utf8');
        expect(bootstrap).to.include("import { init } from './redoc.standalone.js';");
        expect(bootstrap).to.include('disableTelemetry: true');
        expect(bootstrap).to.include('hideDownloadButtons: true');
        expect(bootstrap).to.not.include('Redoc.init');
    });

    it('resizes the same-origin frame on content changes and follows outer scrolling without trapping the page', function () {
        const source = fs.readFileSync(path.resolve(__dirname, '../../../../assets/default/default/js/admin-api-docs-bootstrap.js'), 'utf8')
            .replace("import { init } from './redoc.standalone.js';", '');
        const properties: Record<string, string> = {};
        let contentHeight = 4200;
        const mountEvents: Record<string, Function> = {};
        const referenceSections: any[] = [];
        const mount = { addEventListener: (event: string, callback: Function) => mountEvents[event] = callback, removeEventListener: (event: string) => delete mountEvents[event], toggleAttribute: () => {}, querySelectorAll: (selector: string) => selector === '[data-section-id]' ? referenceSections : [], getBoundingClientRect: () => ({ height: contentHeight }), getAttribute: () => '/spec', style: { setProperty: (name: string, value: string) => properties[name] = value } };
        const frame = { style: { height: '' }, getBoundingClientRect: () => ({ top: -1200 }) };
        const listeners: Record<string, Function> = {};
        const cleanup: Record<string, Function> = {};
        let resize: Function;
        let queued: Function;
        let disconnected = false;
        const parent = {
            location: { origin: 'http://portal', hash: '#/users' }, innerHeight: 900, scrollY: 1800, scrollTo: sinon.spy(),
            requestAnimationFrame: (callback: Function) => { queued = callback; return 1; }, cancelAnimationFrame: () => {},
            addEventListener: (event: string, callback: Function) => listeners[event] = callback,
            removeEventListener: (event: string) => delete listeners[event]
        };
        vm.runInNewContext(source, {
            init: () => {}, document: { getElementById: () => mount },
            window: { frameElement: frame, parent, location: parent.location, addEventListener: (event: string, callback: Function) => cleanup[event] = callback, removeEventListener: (event: string) => delete cleanup[event] },
            MutationObserver: class { observe() {} disconnect() {} },
            ResizeObserver: class { constructor(callback: Function) { resize = callback; } observe() {} disconnect() { disconnected = true; } }
        });
        queued!();
        expect(frame.style.height).to.equal('4200px');
        expect(properties['--admin-api-sidebar-offset']).to.equal('1200px');
        contentHeight = 1800;
        resize!(); queued!();
        expect(frame.style.height).to.equal('1800px');
        expect(properties['--admin-api-sidebar-offset']).to.equal('900px');
        parent.innerHeight = 768; listeners.resize(); queued!();
        expect(properties['--admin-api-viewport-height']).to.equal('768px');
        mountEvents.click({ target: { closest: () => ({ getAttribute: () => '#/users', closest: () => null }) }, button: 0 });
        queued!();
        expect(parent.scrollTo.called).to.equal(false);
        referenceSections.push({ getAttribute: () => '/Users', getBoundingClientRect: () => ({ top: 1600 }) });
        resize!(); queued!();
        expect(parent.scrollTo.calledWith({ top: 2200, behavior: 'instant' })).to.equal(true);
        referenceSections[0].getBoundingClientRect = () => ({ top: 1800 });
        queued!();
        expect(parent.scrollTo.lastCall.args[0].top).to.equal(2400);
        // A later operation expansion keeps the heading anchored, until explicit user scroll.
        referenceSections[0].getBoundingClientRect = () => ({ top: 2200 });
        resize!(); queued!();
        expect(parent.scrollTo.lastCall.args[0].top).to.equal(2800);
        const calls = parent.scrollTo.callCount;
        listeners.wheel({ type: 'wheel' });
        referenceSections[0].getBoundingClientRect = () => ({ top: 2600 });
        resize!(); queued!();
        expect(parent.scrollTo.callCount).to.equal(calls);
        cleanup.pagehide();
        expect(mountEvents).to.deep.equal({});
        expect(disconnected).to.equal(true);
        expect(listeners).to.deep.equal({});
    });

    it('keeps the clicked sidebar tag selected until scrolling and collapses other operation panels', function () {
        const source = fs.readFileSync(path.resolve(__dirname, '../../../../assets/default/default/js/admin-api-docs-bootstrap.js'), 'utf8')
            .replace("import { init } from './redoc.standalone.js';", '');
        const events: Record<string, Function> = {};
        const listeners: Record<string, Function> = {};
        let queued: Function;
        const links = ['records', 'export'].map(tag => ({
            getAttribute: () => '#/' + tag, closest: () => ({}),
            toggleAttribute: sinon.spy(), setAttribute: sinon.spy(), removeAttribute: sinon.spy(),
            parentElement: { classList: { contains: () => true, toggle: sinon.spy() } }
        }));
        const operations = ['records', 'export'].map(tag => ({
            getAttribute: () => '/' + tag + '/paths/operation/get', parentElement: { hidden: false }
        }));
        const mount = {
            getAttribute: () => '/spec', toggleAttribute: sinon.spy(), style: { setProperty() {} },
            getBoundingClientRect: () => ({ height: 1200 }),
            addEventListener: (event: string, callback: Function) => events[event] = callback,
            querySelectorAll: (selector: string) => selector.startsWith('.menu-content') ? links : selector.startsWith('.api-content') ? operations : []
        };
        const parent = { location: { origin: 'http://portal' }, innerHeight: 800,
            requestAnimationFrame: (callback: Function) => { queued = callback; return 1; },
            addEventListener: (event: string, callback: Function) => listeners[event] = callback };
        vm.runInNewContext(source, {
            init() {}, document: { getElementById: () => mount },
            window: { frameElement: { style: {}, getBoundingClientRect: () => ({ top: 0 }) }, parent, location: parent.location, addEventListener() {} },
            ResizeObserver: class { observe() {} }, MutationObserver: class { observe() {} }
        });
        events.click({ target: { closest: () => links[1] }, button: 0 }); queued!();
        expect(operations.map(operation => operation.parentElement.hidden)).to.deep.equal([true, false]);
        expect(links[1].setAttribute.calledWith('aria-current', 'location')).to.equal(true);
        expect(links[0].parentElement.classList.toggle.calledWith('admin-api-collapsed', true)).to.equal(true);
        listeners.pointerdown({ type: 'pointerdown' }); queued!();
        expect(mount.toggleAttribute.lastCall.args).to.deep.equal(['data-admin-tag-navigation', true]);
        listeners.scroll(); queued!();
        expect(mount.toggleAttribute.lastCall.args).to.deep.equal(['data-admin-tag-navigation', false]);
        events.click({ target: { closest: () => links[0] }, button: 0 }); queued!();
        expect(operations.map(operation => operation.parentElement.hidden)).to.deep.equal([false, true]);
    });

    it('eagerly mounts Redoc section placeholders while retaining native observers elsewhere', function () {
        const source = fs.readFileSync(path.resolve(__dirname, '../../../../assets/default/default/js/admin-api-docs-bootstrap.js'), 'utf8')
            .replace("import { init } from './redoc.standalone.js';", '');
        const observe = sinon.spy();
        const microtasks: Function[] = [];
        const viewer: any = {
            IntersectionObserver: class { observe(target: any) { observe(target); } },
        };
        const mount = { contains: (target: any) => target.inViewer, getAttribute: () => '/spec' };
        vm.runInNewContext(source, {
            init: () => {}, document: { getElementById: () => mount }, window: viewer,
            queueMicrotask: (callback: Function) => microtasks.push(callback)
        });
        const callback = sinon.spy();
        const observer = new viewer.IntersectionObserver(callback);
        const section = { inViewer: true, isConnected: true, hasAttribute: () => true };
        observer.observe(section);
        expect(observe.called).to.equal(false);
        microtasks.shift()!();
        expect(callback.firstCall.args[0][0]).to.deep.equal({ target: section, isIntersecting: true });
        const other = { inViewer: true, hasAttribute: () => false };
        observer.observe(other);
        expect(observe.calledOnceWithExactly(other)).to.equal(true);
        const detached = { ...section, isConnected: false };
        observer.observe(detached); microtasks.shift()!();
        expect(callback.callCount).to.equal(1);
    });

    it('builds the local redoc bundle into the public output after asset cleaning', function () {
        const assets = webpack.config.find(config => config.name === 'portal-assets');
        const docs = webpack.config.find(config => config.name === 'api-docs');

        expect(docs).to.not.equal(undefined);
        expect(docs!.entry).to.equal(path.resolve(__dirname, '../../browser/redoc-standalone.js'));
        expect(docs!.output!.filename).to.equal('./default/default/js/redoc.standalone.js');
        expect(docs!.output!.path).to.equal(assets!.output!.path);
        expect(docs!.output!.library).to.deep.equal({ type: 'module' });
        expect(docs!.dependencies).to.include(assets!.name);
        expect(docs!.output!.clean).to.not.equal(true);
    });

    it('uses consistent development and production modes for both asset compilers', function () {
        const configPath = require.resolve('../../src/config/webpack.config');
        const cachedConfig = require.cache[configPath];
        const originalAssetMode = process.env.REDBOX_ASSET_MODE;
        const originalNodeEnv = process.env.NODE_ENV;

        try {
            for (const mode of ['development', 'production']) {
                process.env.REDBOX_ASSET_MODE = mode;
                process.env.NODE_ENV = mode;
                delete require.cache[configPath];
                const config: typeof webpack = require(configPath).webpack;
                const assets = config.config.find(compiler => compiler.name === 'portal-assets')!;
                const docs = config.config.find(compiler => compiler.name === 'api-docs')!;

                expect(assets.mode).to.equal(mode);
                expect(docs.mode).to.equal(mode);
                expect(assets.optimization!.minimize).to.equal(mode === 'production');
                expect(docs.dependencies).to.include(assets.name);
            }
        } finally {
            if (originalAssetMode === undefined) delete process.env.REDBOX_ASSET_MODE;
            else process.env.REDBOX_ASSET_MODE = originalAssetMode;
            if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = originalNodeEnv;
            if (cachedConfig) require.cache[configPath] = cachedConfig;
            else delete require.cache[configPath];
        }
    });
});
