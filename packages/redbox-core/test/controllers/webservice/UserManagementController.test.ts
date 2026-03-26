let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { Controllers } from '../../../src/controllers/webservice/UserManagementController';

describe('Webservice UserManagementController', () => {
    let controller: Controllers.UserManagement;
    let originalSails: any;
    let originalUsersService: any;
    let originalBrandingService: any;

    beforeEach(() => {
        originalSails = (global as any).sails;
        originalUsersService = (global as any).UsersService;
        originalBrandingService = (global as any).BrandingService;

        (global as any).sails = {
            log: {
                error: sinon.stub(),
                verbose: sinon.stub()
            }
        };
        (global as any).BrandingService = {
            getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' })
        };
        (global as any).UsersService = {
            searchLinkCandidates: sinon.stub().returns(of([{ id: 'candidate-1', username: 'candidate-user' }])),
            getLinkedAccounts: sinon.stub().returns(of({ primary: { id: 'primary-1', username: 'primary-user' }, linkedAccounts: [] })),
            linkAccounts: sinon.stub().returns(of({ primary: { id: 'primary-1', username: 'primary-user' }, linkedAccounts: [], impact: { rolesMerged: 1, recordsRewritten: 2 } }))
        };

        controller = new Controllers.UserManagement();
    });

    afterEach(() => {
        sinon.restore();
        (global as any).sails = originalSails;
        (global as any).UsersService = originalUsersService;
        (global as any).BrandingService = originalBrandingService;
    });

    it('should search link candidates', async () => {
        const param = sinon.stub();
        param.withArgs('query').returns('candidate');
        param.withArgs('primaryUserId').returns('primary-1');
        const req = {
            session: { branding: 'default' },
            param
        } as unknown as Sails.Req;
        const res = {} as unknown as Sails.Res;
        const apiRespondStub = sinon.stub(controller as any, 'apiRespond');

        await controller.searchLinkCandidates(req, res);

        expect((global as any).UsersService.searchLinkCandidates.calledWith('candidate', 'brand-1', 'primary-1')).to.be.true;
        expect(apiRespondStub.called).to.be.true;
    });

    it('should link accounts through the service', async () => {
        const req = {
            session: { branding: 'default' },
            user: { username: 'admin-user' },
            body: { primaryUserId: 'primary-1', secondaryUserId: 'secondary-1' }
        } as unknown as Sails.Req;
        const res = {} as unknown as Sails.Res;
        const apiRespondStub = sinon.stub(controller as any, 'apiRespond');

        await controller.linkAccounts(req, res);

        expect((global as any).UsersService.linkAccounts.calledWith('primary-1', 'secondary-1', 'admin-user', 'brand-1')).to.be.true;
        expect(apiRespondStub.called).to.be.true;
    });
});
