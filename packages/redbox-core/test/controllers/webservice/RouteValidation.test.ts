import * as sinon from 'sinon';

import { Controllers as AdminControllers } from '../../../src/controllers/webservice/AdminController';
import { Controllers as AppConfigControllers } from '../../../src/controllers/webservice/AppConfigController';
import { Controllers as BrandingControllers } from '../../../src/controllers/webservice/BrandingController';
import { Controllers as FormManagementControllers } from '../../../src/controllers/webservice/FormManagementController';
import { Controllers as RecordTypeControllers } from '../../../src/controllers/webservice/RecordTypeController';
import { Controllers as SearchControllers } from '../../../src/controllers/webservice/SearchController';
import { Controllers as UserManagementControllers } from '../../../src/controllers/webservice/UserManagementController';

import { refreshCachedResourcesRoute, getAppConfigByKeyRoute, listAppConfigsRoute } from '../../../src/api-routes/groups/admin';
import { brandingDraftRoute, brandingPreviewRoute } from '../../../src/api-routes/groups/branding';
import { getAppConfigByIdRoute } from '../../../src/api-routes/groups/appconfig';
import { listFormsRoute } from '../../../src/api-routes/groups/forms';
import { listRecordTypesRoute } from '../../../src/api-routes/groups/recordtypes';
import { indexAllRecordsRoute, removeAllIndexedRoute } from '../../../src/api-routes/groups/search';
import { listSystemRolesRoute } from '../../../src/api-routes/groups/users';
import * as validationModule from '../../../src/api-routes/validation';

let expect: Chai.ExpectStatic;

function stubInvalidValidation() {
    return sinon.stub(validationModule, 'validateApiRouteRequest').returns({
        valid: false,
        issues: [{ path: 'body', message: 'invalid' }],
    } as never);
}

function stubValidValidation(params: Record<string, unknown>, body: Record<string, unknown> = {}, query: Record<string, unknown> = {}) {
    return sinon.stub(validationModule, 'validateApiRouteRequest').returns({
        valid: true,
        params,
        body,
        query,
    } as never);
}

describe('Webservice route validation', () => {
    before(async () => {
        const chai = await import('chai');
        expect = chai.expect;
    });

    beforeEach(() => {
        (global as any).sails = {
            log: {
                verbose: sinon.stub(),
                debug: sinon.stub(),
                error: sinon.stub(),
            },
        };
    });

    afterEach(() => {
        sinon.restore();
        delete (global as any).sails;
    });

    describe('AdminController', () => {
        it('validates refreshCachedResources with the shared route', async () => {
            const controller = new AdminControllers.Admin();
            const req = {} as Sails.Req;
            const res = {} as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');
            const validationStub = stubInvalidValidation();

            await controller.refreshCachedResources(req, res);

            expect(validationStub.calledOnceWithExactly(req, refreshCachedResourcesRoute)).to.be.true;
            expect(sendRespStub.calledOnce).to.be.true;
            expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
        });

        it('validates getAppConfig against the list route when configKey is absent', async () => {
            const controller = new AdminControllers.Admin();
            const req = { params: {} } as Sails.Req;
            const res = {} as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');
            const validationStub = stubInvalidValidation();

            await controller.getAppConfig(req, res);

            expect(validationStub.calledOnceWithExactly(req, listAppConfigsRoute)).to.be.true;
            expect(sendRespStub.calledOnce).to.be.true;
            expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
        });

        it('validates getAppConfig against the by-key route when configKey is present', async () => {
            const controller = new AdminControllers.Admin();
            const req = { params: { configKey: 'theme' } } as unknown as Sails.Req;
            const res = {} as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');
            const validationStub = stubInvalidValidation();

            await controller.getAppConfig(req, res);

            expect(validationStub.calledOnceWithExactly(req, getAppConfigByKeyRoute)).to.be.true;
            expect(sendRespStub.calledOnce).to.be.true;
            expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
        });
    });

    describe('BrandingController', () => {
        it('validates preview before calling the branding service', async () => {
            const controller = new BrandingControllers.Branding();
            const req = {} as Sails.Req;
            const res = {} as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');
            const validationStub = stubInvalidValidation();

            await controller.preview(req, res);

            expect(validationStub.calledOnceWithExactly(req, brandingPreviewRoute)).to.be.true;
            expect(sendRespStub.calledOnce).to.be.true;
            expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
            expect(sendRespStub.firstCall.args[2]?.displayErrors).to.deep.equal([{ title: 'body', detail: 'invalid' }]);
        });

        it('routes draft success through the shared API responder', async () => {
            const controller = new BrandingControllers.Branding();
            const req = { user: { username: 'admin-user' } } as unknown as Sails.Req;
            const res = {} as Sails.Res;
            const apiRespondStub = sinon.stub(controller as any, 'apiRespond');
            const validationStub = stubValidValidation(
                { branding: 'default' },
                { variables: { title: 'Updated branding' } }
            );
            const originalBrandingService = (global as any).BrandingService;
            const saveDraftStub = sinon.stub().resolves({ id: 'brand-1', variables: { title: 'Updated branding' } });

            (global as any).BrandingService = { saveDraft: saveDraftStub };
            try {
                await controller.draft(req, res);
            } finally {
                (global as any).BrandingService = originalBrandingService;
            }

            expect(validationStub.calledOnceWithExactly(req, brandingDraftRoute)).to.be.true;
            expect(saveDraftStub.calledOnceWithExactly({
                branding: 'default',
                variables: { title: 'Updated branding' },
                actor: req.user,
            })).to.be.true;
            expect(apiRespondStub.calledOnce).to.be.true;
            expect(apiRespondStub.firstCall.args[2]).to.deep.equal({
                branding: { id: 'brand-1', variables: { title: 'Updated branding' } },
            });
            expect(apiRespondStub.firstCall.args[3]).to.equal(200);
        });
    });

    describe('AppConfigController', () => {
        it('routes getAppConfig success through the shared API responder', async () => {
            const controller = new AppConfigControllers.AppConfig();
            const req = {
                session: { branding: 'default' },
                params: { appConfigId: 'theme' },
            } as unknown as Sails.Req;
            const res = {} as Sails.Res;
            const apiRespondStub = sinon.stub(controller as any, 'apiRespond');
            const validationStub = stubValidValidation({ appConfigId: 'theme' });
            const originalBrandingService = (global as any).BrandingService;
            const originalAppConfigService = (global as any).AppConfigService;
            const getBrandStub = sinon.stub().returns({ id: 'brand-1' });
            const getAppConfigStub = sinon.stub().resolves({ theme: 'dark' });

            (global as any).BrandingService = { getBrand: getBrandStub };
            (global as any).AppConfigService = { getAppConfigByBrandAndKey: getAppConfigStub };
            try {
                await controller.getAppConfig(req, res);
            } finally {
                (global as any).BrandingService = originalBrandingService;
                (global as any).AppConfigService = originalAppConfigService;
            }

            expect(validationStub.calledOnceWithExactly(req, getAppConfigByIdRoute)).to.be.true;
            expect(getBrandStub.calledOnceWithExactly('default')).to.be.true;
            expect(getAppConfigStub.calledOnceWithExactly('brand-1', 'theme')).to.be.true;
            expect(apiRespondStub.calledOnce).to.be.true;
            expect(apiRespondStub.firstCall.args[2]).to.deep.equal({ theme: 'dark' });
            expect(apiRespondStub.firstCall.args[3]).to.equal(200);
        });
    });

    describe('FormManagementController', () => {
        it('validates listForms with the list route', async () => {
            const controller = new FormManagementControllers.FormManagement();
            const req = {} as Sails.Req;
            const res = {} as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');
            const validationStub = stubInvalidValidation();

            await controller.listForms(req, res);

            expect(validationStub.calledOnceWithExactly(req, listFormsRoute)).to.be.true;
            expect(sendRespStub.calledOnce).to.be.true;
            expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
        });
    });

    describe('RecordTypeController', () => {
        it('validates listRecordTypes with the list route', async () => {
            const controller = new RecordTypeControllers.RecordType();
            const req = {} as Sails.Req;
            const res = {} as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');
            const validationStub = stubInvalidValidation();

            await controller.listRecordTypes(req, res);

            expect(validationStub.calledOnceWithExactly(req, listRecordTypesRoute)).to.be.true;
            expect(sendRespStub.calledOnce).to.be.true;
            expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
        });
    });

    describe('SearchController', () => {
        it('validates indexAll with the queue-all route', async () => {
            const controller = new SearchControllers.Search();
            const req = {} as Sails.Req;
            const res = {} as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');
            const validationStub = stubInvalidValidation();

            await controller.indexAll(req, res);

            expect(validationStub.calledOnceWithExactly(req, indexAllRecordsRoute)).to.be.true;
            expect(sendRespStub.calledOnce).to.be.true;
            expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
        });

        it('validates removeAll with the remove-all route', async () => {
            const controller = new SearchControllers.Search();
            const req = {} as Sails.Req;
            const res = {} as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');
            const validationStub = stubInvalidValidation();

            await controller.removeAll(req, res);

            expect(validationStub.calledOnceWithExactly(req, removeAllIndexedRoute)).to.be.true;
            expect(sendRespStub.calledOnce).to.be.true;
            expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
        });
    });

    describe('UserManagementController', () => {
        it('validates listSystemRoles with the shared route', async () => {
            const controller = new UserManagementControllers.UserManagement();
            const req = {} as Sails.Req;
            const res = {} as Sails.Res;
            const sendRespStub = sinon.stub(controller as any, 'sendResp');
            const validationStub = stubInvalidValidation();

            await controller.listSystemRoles(req, res);

            expect(validationStub.calledOnceWithExactly(req, listSystemRolesRoute)).to.be.true;
            expect(sendRespStub.calledOnce).to.be.true;
            expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
        });
    });
});