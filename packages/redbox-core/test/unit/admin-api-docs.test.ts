import fs from 'node:fs';
import path from 'node:path';

import * as sinon from 'sinon';

import { Controllers } from '../../src/controllers/BrandingController';
import { auth } from '../../src/config/auth.config';
import { routes } from '../../src/config/routes.config';

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
            log: {
                error: sinon.stub(),
                verbose: sinon.stub(),
                debug: sinon.stub(),
            },
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
            policy: ['noCache', 'brandingAndPortal', 'checkBrandingValid', 'setLang', 'prepWs', 'i18nLanguages', 'menuResolver', 'isWebServiceAuthenticated', 'checkAuth'],
            locals: { view: 'admin/api-docs', layout: false },
        });
        expect(routes['get /redoc/:asset']).to.deep.equal({
            controller: 'RedocAssetController',
            action: 'asset',
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

    it('keeps the EJS view self-contained and local to the portal', function () {
        const viewPath = path.resolve(__dirname, '../../../../views/default/default/admin/api-docs.ejs');
        const contents = fs.readFileSync(viewPath, 'utf8');

        expect(contents).to.include('<!doctype html>');
        expect(contents).to.include('/redoc/admin-api-docs-init.js');
        expect(contents).to.include('/redoc/admin-api-docs-bootstrap.js');
        expect(contents).to.include('/admin/api-docs/openapi.json');
        expect(contents).to.include('/redoc/redoc.standalone.js');
        expect(contents).to.not.include('cdn.redoc.ly');
    });

    it('routes redoc assets through the npm package bundle', function () {
        const controllerPath = path.resolve(__dirname, '../../../../packages/redbox-core/src/controllers/RedocAssetController.ts');
        const contents = fs.readFileSync(controllerPath, 'utf8');

        expect(contents).to.include("require.resolve('redoc/bundles/redoc.standalone.js')");
    });
});
