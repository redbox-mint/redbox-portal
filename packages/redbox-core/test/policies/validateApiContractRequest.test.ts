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

interface MalformedRecordSchemaRequestCase {
    readonly name: string;
    readonly path: string;
    readonly routePath: string;
    readonly params: Record<string, string>;
    readonly query: Record<string, string>;
    readonly headers: Record<string, string>;
}

const malformedRecordSchemaRequestCases: readonly MalformedRecordSchemaRequestCase[] = [
    {
        name: 'digest',
        path: `/default/rdmp/api/records/schemas/${'A'.repeat(64)}`,
        routePath: '/:branding/:portal/api/records/schemas/:digest',
        params: { branding: 'default', portal: 'rdmp', digest: 'A'.repeat(64) },
        query: {},
        headers: {},
    },
    {
        name: 'operation',
        path: '/default/rdmp/api/records/schemas/create/dataset',
        routePath: '/:branding/:portal/api/records/schemas/create/:recordType',
        params: { branding: 'default', portal: 'rdmp', recordType: 'dataset' },
        query: { operation: 'malformed operation' },
        headers: {},
    },
    {
        name: 'If-None-Match',
        path: '/default/rdmp/api/records/schemas/update/record-1',
        routePath: '/:branding/:portal/api/records/schemas/update/:oid',
        params: { branding: 'default', portal: 'rdmp', oid: 'record-1' },
        query: {},
        headers: { 'if-none-match': `W/"sha256:${'a'.repeat(64)}"` },
    },
];

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
        set(this: TestResponse, field: string | Record<string, string>, value?: string) {
            this.headers = {
                ...this.headers,
                ...(typeof field === 'string' ? { [field]: value ?? '' } : field),
            };
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

    it('returns stable sanitized operation contract failures for both API versions', function () {
        for (const apiVersion of ['1.0', '2.0']) {
            const req = createReq({
                method: 'POST',
                path: '/default/rdmp/api/records/metadata/dataset',
                originalUrl: '/default/rdmp/api/records/metadata/dataset',
                url: '/default/rdmp/api/records/metadata/dataset',
                route: { path: '/:branding/:portal/api/records/metadata/:recordType' },
                params: { branding: 'default', portal: 'rdmp', recordType: 'dataset' },
                query: { operation: 'malformed operation secret' },
                headers: { 'x-redbox-api-version': apiVersion },
                body: {},
            });
            const res = createRes();

            validateApiContractRequest(req, res, () => undefined);

            expect(res.statusCode).to.equal(400);
            expect(JSON.stringify(res.body)).to.include('record-validation-operation-invalid');
            expect(JSON.stringify(res.body)).not.to.include('malformed operation secret');
        }
    });

    for (const malformed of malformedRecordSchemaRequestCases) {
        it(`returns raw 400 Problem Details for malformed record-schema ${malformed.name} in both API versions`, function () {
            for (const apiVersion of ['1.0', '2.0']) {
                const req = createReq({
                    path: malformed.path,
                    originalUrl: malformed.path,
                    url: malformed.path,
                    route: { path: malformed.routePath },
                    params: { ...malformed.params },
                    query: { ...malformed.query },
                    headers: {
                        ...malformed.headers,
                        'x-redbox-api-version': apiVersion,
                    },
                });
                const res = createRes();
                let nextCalled = false;

                validateApiContractRequest(req, res, () => { nextCalled = true; });

                expect(nextCalled, `${apiVersion} ${malformed.name}`).to.equal(false);
                expect(res.statusCode, `${apiVersion} ${malformed.name}`).to.equal(400);
                expect(res.headers?.['Content-Type'], `${apiVersion} ${malformed.name}`).to.equal(
                    'application/problem+json'
                );
                expect(res.headers?.['Cache-Control'], `${apiVersion} ${malformed.name}`).to.equal(
                    'private, no-cache'
                );
                expect(res.headers?.Vary, `${apiVersion} ${malformed.name}`).to.equal('Authorization');
                expect(res.body, `${apiVersion} ${malformed.name}`).to.deep.equal({
                    type: 'https://redboxresearchdata.com/problems/record-schema-invalid-request',
                    title: 'Record schema request is invalid',
                    status: 400,
                    detail: 'The record schema request is malformed.',
                    instance: malformed.path,
                    code: 'record-schema.invalid-request',
                });
                expect(res.body, `${apiVersion} ${malformed.name}`).not.to.have.property('message');
                expect(res.body, `${apiVersion} ${malformed.name}`).not.to.have.property('errors');
                expect(res.body, `${apiVersion} ${malformed.name}`).not.to.have.property('meta');
                expect(res.body, `${apiVersion} ${malformed.name}`).not.to.have.property('data');
            }
        });
    }

    it('returns 400 for repeated If-Match values on update and transition routes', function () {
        const ifMatch = `"sha256:${'a'.repeat(64)}"`;
        for (const apiVersion of ['1.0', '2.0']) {
            for (const action of ['update', 'transition'] as const) {
                const transition = action === 'transition';
                const path = transition
                    ? '/default/rdmp/api/records/workflow/step/published/record-1'
                    : '/default/rdmp/api/records/metadata/record-1';
                const routePath = transition
                    ? '/:branding/:portal/api/records/workflow/step/:targetStep/:oid'
                    : '/:branding/:portal/api/records/metadata/:oid';
                const req = createReq({
                    method: transition ? 'POST' : 'PUT',
                    path,
                    originalUrl: path,
                    url: path,
                    route: { path: routePath },
                    params: {
                        branding: 'default',
                        portal: 'rdmp',
                        oid: 'record-1',
                        ...(transition ? { targetStep: 'published' } : {}),
                    },
                    query: {},
                    headers: {
                        'x-redbox-api-version': apiVersion,
                    },
                    body: {},
                });
                Object.defineProperty(req.headers, 'if-match', {
                    value: [ifMatch, ifMatch],
                    enumerable: true,
                    configurable: true,
                    writable: true,
                });
                const res = createRes();
                let nextCalled = false;

                validateApiContractRequest(req, res, () => { nextCalled = true; });

                expect(res.statusCode, `${apiVersion} ${action}`).to.equal(400);
                expect(nextCalled, `${apiVersion} ${action}`).to.equal(false);
                expect(JSON.stringify(res.body), `${apiVersion} ${action}`).to.include('If-Match');
            }
        }
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
        const privateOid = 'private-record-oid';
        const privateDigest = 'a'.repeat(64);
        const req = createReq({
            route: { path: '/:branding/:portal/api/not-registered' },
            path: `/default/rdmp/api/not-registered/${privateOid}/${privateDigest}`,
            originalUrl: `/default/rdmp/api/not-registered/${privateOid}/${privateDigest}`,
            url: `/default/rdmp/api/not-registered/${privateOid}/${privateDigest}`,
        });
        const res = createRes();

        validateApiContractRequest(req, res, () => undefined);

        expect(res.statusCode).to.equal(500);
        expect((res.body as { message?: string }).message).to.equal('Internal server error');
        const logged = JSON.stringify((sails.log.error as sinon.SinonStub).firstCall.args);
        expect(logged).to.include('GET unresolved-api-route');
        expect(logged).not.to.include(privateOid);
        expect(logged).not.to.include(privateDigest);
    });

    it('logs a resolved route identifier without request OIDs or digests when validation throws', function () {
        const privateOid = 'private-record-oid';
        const privateDigest = 'b'.repeat(64);
        const path = `/default/rdmp/api/records/schemas/update/${privateOid}?digest=${privateDigest}`;
        const req = createReq({
            path,
            originalUrl: path,
            url: path,
            route: { path: '/:branding/:portal/api/records/schemas/update/:oid' },
            params: { branding: 'default', portal: 'rdmp', oid: privateOid },
        });
        const res = createRes();
        Object.defineProperty(req, 'params', {
            configurable: true,
            get: () => {
                throw new Error('validation failed');
            },
        });

        validateApiContractRequest(req, res, () => undefined);

        expect(res.statusCode).to.equal(500);
        const logged = JSON.stringify((sails.log.error as sinon.SinonStub).firstCall.args);
        expect(logged).to.include('webservice/RecordSchemaController.update');
        expect(logged).not.to.include(privateOid);
        expect(logged).not.to.include(privateDigest);
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
