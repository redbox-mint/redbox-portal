let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

// Mock lodash globally BEFORE importing the policy (as it uses `_` at import time)
(global as any)._ = require('lodash');

import { brandingAndPortal } from '../../src/policies/brandingAndPortal';

describe('brandingAndPortal policy', function () {

    function createMockReqRes(branding?: string, portal?: string) {
        const params: Record<string, string | undefined> = { branding, portal };
        const req: any = {
            param: (name: string) => params[name],
            options: {},
            session: {}
        };
        const res: any = {};
        return { req, res };
    }

    it('should set branding in options.locals and session', function () {
        const { req, res } = createMockReqRes('testBrand', undefined);
        let nextCalled = false;

        brandingAndPortal(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(req.options.locals.branding).to.equal('testBrand');
        expect(req.session.branding).to.equal('testBrand');
    });

    it('should set portal in options.locals and session', function () {
        const { req, res } = createMockReqRes(undefined, 'testPortal');
        let nextCalled = false;

        brandingAndPortal(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(req.options.locals.portal).to.equal('testPortal');
        expect(req.session.portal).to.equal('testPortal');
    });

    it('should set both branding and portal', function () {
        const { req, res } = createMockReqRes('myBrand', 'myPortal');
        let nextCalled = false;

        brandingAndPortal(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(req.options.locals.branding).to.equal('myBrand');
        expect(req.options.locals.portal).to.equal('myPortal');
        expect(req.session.branding).to.equal('myBrand');
        expect(req.session.portal).to.equal('myPortal');
    });

    it('should not overwrite existing branding in options.locals', function () {
        const { req, res } = createMockReqRes('newBrand', undefined);
        req.options.locals = { branding: 'existingBrand' };
        let nextCalled = false;

        brandingAndPortal(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(req.options.locals.branding).to.equal('existingBrand');
    });

    it('should not overwrite existing portal in options.locals', function () {
        const { req, res } = createMockReqRes(undefined, 'newPortal');
        req.options.locals = { portal: 'existingPortal' };
        let nextCalled = false;

        brandingAndPortal(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(req.options.locals.portal).to.equal('existingPortal');
    });

    it('should initialize options.locals if null', function () {
        const { req, res } = createMockReqRes('testBrand', 'testPortal');
        req.options.locals = null;
        let nextCalled = false;

        brandingAndPortal(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(req.options.locals).to.be.an('object');
        expect(req.options.locals.branding).to.equal('testBrand');
    });

    it('should initialize session if undefined', function () {
        const { req, res } = createMockReqRes('testBrand', undefined);
        req.session = undefined;
        let nextCalled = false;

        brandingAndPortal(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(req.session).to.be.an('object');
        expect(req.session.branding).to.equal('testBrand');
    });

    it('should call next with no params provided', function () {
        const { req, res } = createMockReqRes(undefined, undefined);
        let nextCalled = false;

        brandingAndPortal(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.be.true;
        expect(req.options.locals.branding).to.be.undefined;
        expect(req.options.locals.portal).to.be.undefined;
    });
});
