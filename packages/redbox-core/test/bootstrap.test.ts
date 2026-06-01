let expect: Chai.ExpectStatic;
import('chai').then(mod => expect = mod.expect);
import * as sinon from 'sinon';

import { preLiftSetup } from '../src/bootstrap.ts';
import {
    ApiRouteDefinition,
    resetResolvedApiRouteCache,
    resolveApiRouteForRequest,
} from '../src/api-routes/index.ts';

function createReq(overrides: Partial<Sails.Req> = {}): Sails.Req {
    return {
        method: 'GET',
        path: '/default/rdmp/api/hooks/late',
        originalUrl: '/default/rdmp/api/hooks/late',
        url: '/default/rdmp/api/hooks/late',
        route: { path: '/:branding/:portal/api/hooks/late' },
        params: { branding: 'default', portal: 'rdmp' },
        query: {},
        headers: {},
        session: { branding: 'default', portal: 'rdmp' } as Sails.Req['session'],
        isAuthenticated: (() => true) as Sails.Req['isAuthenticated'],
        ...overrides,
    } as Sails.Req;
}

describe('bootstrap pre-lift setup', function () {
    let originalSails: unknown;
    let originalLodash: unknown;

    before(async function () {
        const chai = await import('chai');
        expect = chai.expect;
    });

    beforeEach(function () {
        originalSails = (global as Record<string, unknown>).sails;
        originalLodash = (global as Record<string, unknown>)._;
        resetResolvedApiRouteCache();
    });

    afterEach(function () {
        sinon.restore();
        resetResolvedApiRouteCache();
        (global as Record<string, unknown>).sails = originalSails;
        (global as Record<string, unknown>)._ = originalLodash;
    });

    it('clears the resolved route cache after init registers a hook provider', function () {
        const lateHookRoute: ApiRouteDefinition = {
            method: 'get',
            path: '/:branding/:portal/api/hooks/late',
            controller: 'hook/LateController',
            action: 'show',
            summary: 'Late hook route',
        };
        const lateHookReq = createReq();

        const sailsConfig: Record<string, unknown> = {
            security: { csrf: true },
            bootstrap: {},
            environment: 'development',
            ng2: { force_bundle: false, use_bundled: false },
            log: { customLogger: { level: 'info' }, level: 'info' },
            appmode: { bootstrapAlways: false },
            apiRoutesHooks: [],
        };

        const init = sinon.stub().callsFake(() => {
            expect(resolveApiRouteForRequest(lateHookReq)).to.equal(undefined);
            sailsConfig.apiRoutesHooks = [() => [lateHookRoute]];
        });

        (global as Record<string, unknown>).sails = {
            config: sailsConfig,
            log: {
                verbose: sinon.stub(),
                debug: sinon.stub(),
                error: sinon.stub(),
                warn: sinon.stub(),
                info: sinon.stub(),
                trace: sinon.stub(),
            },
            services: {
                laterouteservice: { init },
            },
            _actions: {},
        };
        (global as Record<string, unknown>)._ = require('lodash');

        preLiftSetup();

        const resolvedRoute = resolveApiRouteForRequest(lateHookReq);

        expect(init.calledOnce).to.equal(true);
        expect(resolvedRoute?.path).to.equal(lateHookRoute.path);
        expect(resolvedRoute?.controller).to.equal(lateHookRoute.controller);
        expect(resolvedRoute?.action).to.equal(lateHookRoute.action);
    });
});