let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';

import * as apiRoutes from '../../src/api-routes';
import { validateApiContractRequest } from '../../src/policies/validateApiContractRequest';

type TestResponse = Sails.Res & {
    body?: unknown;
    headers?: Record<string, string>;
    statusCode?: number;
};

function createReq(overrides: Partial<Sails.Req> = {}): Sails.Req {
    return {
        method: 'GET',
        path: '/default/rdmp/api/admin/config',
        originalUrl: '/default/rdmp/api/admin/config',
        url: '/default/rdmp/api/admin/config',
        route: { path: '/:branding/:portal/api/admin/config' },
        params: { branding: 'default', portal: 'rdmp' },
        query: {},
        headers: {},
        session: { branding: 'default', portal: 'rdmp' } as Sails.Req['session'],
        isAuthenticated: (() => true) as Sails.Req['isAuthenticated'],
        ...overrides,
    } as Sails.Req;
}

function createRes(): TestResponse {
    const res = {
        set(this: TestResponse, headers: Record<string, string>) {
            this.headers = headers;
            return this;
        },
        status(this: TestResponse, code: number) {
            this.statusCode = code;
            return this;
        },
        json(this: TestResponse, body: unknown) {
            this.body = body;
            return this;
        },
    } as unknown as TestResponse;

    return res;
}

describe('validateApiContractRequest policy', function () {
    let originalSails: unknown;
    let originalLodash: unknown;

    before(async function () {
        const chai = await import('chai');
        expect = chai.expect;
    });

    beforeEach(function () {
        originalSails = (global as Record<string, unknown>).sails;
        originalLodash = (global as Record<string, unknown>)._;
        (global as Record<string, unknown>).sails = {
            log: {
                verbose: sinon.stub(),
                debug: sinon.stub(),
                error: sinon.stub(),
                warn: sinon.stub(),
                info: sinon.stub(),
                trace: sinon.stub(),
            },
            config: {},
        };
        (global as Record<string, unknown>)._ = require('lodash');
        apiRoutes.resetResolvedApiRouteCache();
    });

    afterEach(function () {
        sinon.restore();
        (global as Record<string, unknown>).sails = originalSails;
        (global as Record<string, unknown>)._ = originalLodash;
        apiRoutes.resetResolvedApiRouteCache();
    });

    it('attaches resolved route and validated request on success', function () {
        const req = createReq();
        const res = createRes();
        let nextCalled = false;

        validateApiContractRequest(req, res, () => { nextCalled = true; });

        expect(nextCalled).to.equal(true);
        expect(req.apiRoute?.path).to.equal('/:branding/:portal/api/admin/config');
        expect(req.apiRequest?.params).to.deep.equal({ branding: 'default', portal: 'rdmp' });
        expect(req.apiRequest?.query).to.deep.equal({});
        expect(res.statusCode).to.equal(undefined);
    });

    it('returns 400 for invalid params', function () {
        const req = createReq({
            path: '/default/rdmp/api/admin/config/theme',
            originalUrl: '/default/rdmp/api/admin/config/theme',
            url: '/default/rdmp/api/admin/config/theme',
            route: { path: '/:branding/:portal/api/admin/config/:configKey' },
            params: { branding: 'default', portal: 'rdmp' },
        });
        const res = createRes();

        validateApiContractRequest(req, res, () => undefined);

        expect(res.statusCode).to.equal(400);
        expect((res.body as { message?: string }).message).to.equal('params.configKey');
    });

    it('returns 400 for invalid query', function () {
        const req = createReq({
            path: '/default/rdmp/api/recordtypes/get',
            originalUrl: '/default/rdmp/api/recordtypes/get',
            url: '/default/rdmp/api/recordtypes/get',
            route: { path: '/:branding/:portal/api/recordtypes/get' },
        });
        const res = createRes();

        validateApiContractRequest(req, res, () => undefined);

        expect(res.statusCode).to.equal(400);
        expect((res.body as { message?: string }).message).to.equal('query.name');
    });

    it('returns 400 for invalid body', function () {
        const req = createReq({
            method: 'POST',
            path: '/default/rdmp/api/admin/config/theme',
            originalUrl: '/default/rdmp/api/admin/config/theme',
            url: '/default/rdmp/api/admin/config/theme',
            route: { path: '/:branding/:portal/api/admin/config/:configKey' },
            params: { branding: 'default', portal: 'rdmp', configKey: 'theme' },
        });
        const res = createRes();

        validateApiContractRequest(req, res, () => undefined);

        expect(res.statusCode).to.equal(400);
        expect((res.body as { message?: string }).message).to.contain('Body is required');
    });

    it('returns 400 for file validation failures when request files are pre-parsed', function () {
        const req = createReq({
            method: 'POST',
            path: '/default/rdmp/api/branding/logo',
            originalUrl: '/default/rdmp/api/branding/logo',
            url: '/default/rdmp/api/branding/logo',
            route: { path: '/:branding/:portal/api/branding/logo' },
            files: {
                logo: [{
                    type: 'image/gif',
                    size: 1024,
                }],
            },
        });
        const res = createRes();

        validateApiContractRequest(req, res, () => undefined);

        expect(res.statusCode).to.equal(400);
        expect((res.body as { message?: string }).message).to.contain('Unsupported mime type');
    });

    it('returns 500 when route resolution fails during fallback matching', function () {
        const req = createReq({
            path: '/default/rdmp/api/does-not-exist',
            originalUrl: '/default/rdmp/api/does-not-exist',
            url: '/default/rdmp/api/does-not-exist',
            route: { path: '/:branding/:portal/api/does-not-exist' },
        });
        const res = createRes();

        validateApiContractRequest(req, res, () => undefined);

        expect(res.statusCode).to.equal(500);
        expect((res.body as { message?: string }).message).to.equal('Internal server error');
    });

    it('returns 500 when the route cannot be resolved', function () {
        const req = createReq({
            route: { path: '/:branding/:portal/api/not-registered' },
            path: '/default/rdmp/api/not-registered',
            originalUrl: '/default/rdmp/api/not-registered',
            url: '/default/rdmp/api/not-registered',
        });
        const res = createRes();

        validateApiContractRequest(req, res, () => undefined);

        expect(res.statusCode).to.equal(500);
        expect((res.body as { message?: string }).message).to.equal('Internal server error');
    });

    it('distinguishes admin config routes by matched route path', function () {
        const listReq = createReq({
            path: '/default/rdmp/api/admin/config',
            originalUrl: '/default/rdmp/api/admin/config',
            url: '/default/rdmp/api/admin/config',
            route: { path: '/:branding/:portal/api/admin/config' },
        });
        const byKeyReq = createReq({
            path: '/default/rdmp/api/admin/config/theme',
            originalUrl: '/default/rdmp/api/admin/config/theme',
            url: '/default/rdmp/api/admin/config/theme',
            route: { path: '/:branding/:portal/api/admin/config/:configKey' },
            params: { branding: 'default', portal: 'rdmp', configKey: 'theme' },
        });
        const listRes = createRes();
        const byKeyRes = createRes();

        validateApiContractRequest(listReq, listRes, () => undefined);
        validateApiContractRequest(byKeyReq, byKeyRes, () => undefined);

        expect(listReq.apiRoute?.path).to.equal('/:branding/:portal/api/admin/config');
        expect(byKeyReq.apiRoute?.path).to.equal('/:branding/:portal/api/admin/config/:configKey');
        expect(listReq.apiRoute?.action).to.equal('getAppConfig');
        expect(byKeyReq.apiRoute?.action).to.equal('getAppConfig');
    });
});
