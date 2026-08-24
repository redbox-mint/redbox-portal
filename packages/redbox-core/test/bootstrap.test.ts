let expect: Chai.ExpectStatic;
import('chai').then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { of } from 'rxjs';

import {
    bootstrapRecordSchemaIntegrationPins,
    coreBootstrap,
    preLiftSetup,
} from '../src/bootstrap';
import {
    ApiRouteDefinition,
    resetResolvedApiRouteCache,
    resolveApiRouteForRequest,
} from '../src/api-routes';

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

describe('record schema bootstrap lifecycle', function () {
    let originalSails: unknown;
    let originalLodash: unknown;
    let originalAppConfigService: unknown;

    before(async function () {
        const chai = await import('chai');
        expect = chai.expect;
    });

    beforeEach(function () {
        originalSails = (global as Record<string, unknown>).sails;
        originalLodash = (global as Record<string, unknown>)._;
        originalAppConfigService = (global as Record<string, unknown>).AppConfigService;
    });

    afterEach(function () {
        sinon.restore();
        (global as Record<string, unknown>).sails = originalSails;
        (global as Record<string, unknown>)._ = originalLodash;
        (global as Record<string, unknown>).AppConfigService = originalAppConfigService;
    });

    it('awaits integration-pin materialization and propagates startup failure', async function () {
        let complete: (() => void) | undefined;
        const pending = new Promise<void>(resolve => {
            complete = resolve;
        });
        const bootstrapIntegrationPins = sinon.stub().returns(pending);
        (global as Record<string, unknown>).sails = {
            services: { recordschemaservice: { bootstrapIntegrationPins } },
        };
        let settled = false;
        const startup = bootstrapRecordSchemaIntegrationPins().then(() => {
            settled = true;
        });

        await Promise.resolve();
        expect(settled).to.equal(false);
        complete?.();
        await startup;
        expect(bootstrapIntegrationPins.calledOnce).to.equal(true);

        const failure = new Error('pin write failed');
        bootstrapIntegrationPins.rejects(failure);
        let caught: unknown;
        try {
            await bootstrapRecordSchemaIntegrationPins();
        } catch (error) {
            caught = error;
        }
        expect(caught).to.equal(failure);
    });

    it('keeps the real core bootstrap pending until integration pins finish after storage readiness', async function () {
        const events: string[] = [];
        let finishPins: (() => void) | undefined;
        const pinWrite = new Promise<void>(resolve => {
            finishPins = resolve;
        });
        const immediate = async () => undefined;
        const brandingservice = {
            bootstrap: () => of({ id: 'default' }),
            getDefault: () => ({ id: 'default' }),
        };
        const log = {
            verbose: sinon.stub().callsFake((message: string) => {
                if (message === 'Bootstrap complete!') events.push('ready');
            }),
            debug: sinon.stub(),
            info: sinon.stub(),
            error: sinon.stub(),
        };
        (global as Record<string, unknown>)._ = require('lodash');
        (global as Record<string, unknown>).AppConfigService = {
            getAppConfigurationForBrand: sinon.stub(),
        };
        (global as Record<string, unknown>).sails = {
            config: { crontab: { enabled: false } },
            log,
            services: {
                brandingservice,
                rolesservice: { bootstrap: () => of([]), getRolesWithBrand: () => of([]) },
                reportsservice: { bootstrapData: immediate },
                namedqueryservice: { bootstrapData: immediate },
                usersservice: { bootstrap: () => of({ defUser: {}, defRoles: [] }) },
                pathrulesservice: { bootstrap: () => of(undefined) },
                recordtypesservice: { bootstrap: async () => [] },
                dashboardtypesservice: { bootstrap: immediate },
                workflowstepsservice: { bootstrap: async () => [] },
                formsservice: { bootstrap: immediate },
                recordsservice: {
                    auditRecordValidationRollout: immediate,
                    bootstrapData: immediate,
                    checkRedboxRunning: async () => {
                        events.push('storage-ready');
                        return true;
                    },
                },
                vocabularyservice: { bootstrapData: immediate },
                i18nentriesservice: { bootstrap: immediate },
                translationservice: { bootstrap: immediate },
                appconfigservice: { bootstrap: immediate },
                figsharevocabularyservice: { bootstrapData: immediate },
                agendaqueueservice: { init: immediate },
                workspacetypesservice: { bootstrap: () => of(undefined) },
                cacheservice: { bootstrap: immediate },
                recordschemaservice: {
                    bootstrapIntegrationPins: async () => {
                        events.push('pins-started');
                        await pinWrite;
                        events.push('pins-finished');
                    },
                },
            },
        };

        let settled = false;
        const startup = coreBootstrap().then(() => {
            settled = true;
        });
        await new Promise<void>(resolve => setImmediate(resolve));
        expect(events).to.deep.equal(['storage-ready', 'pins-started']);
        expect(settled).to.equal(false);
        finishPins?.();
        await startup;
        expect(events).to.deep.equal(['storage-ready', 'pins-started', 'pins-finished', 'ready']);
    });
});
