import * as sinon from 'sinon';
import { of } from 'rxjs';
import { Controllers } from '../../src/controllers/AdminController';
import { createQueryObject } from '../services/testHelper';

let expect: Chai.ExpectStatic;

describe('AdminController', () => {
    let controller: Controllers.Admin;
    let originalSails: any;
    let originalUsersService: any;
    let originalBrandingService: any;
    let originalUser: any;
    let originalUserLink: any;

    before(async () => {
        const chai = await import('chai');
        expect = chai.expect;
    });

    beforeEach(() => {
        originalSails = (global as any).sails;
        originalUsersService = (global as any).UsersService;
        originalBrandingService = (global as any).BrandingService;
        originalUser = (global as any).User;
        originalUserLink = (global as any).UserLink;

        (global as any).sails = {
            config: {
                auth: {
                    hiddenUsers: [],
                    hiddenRoles: []
                }
            },
            log: {
                error: sinon.stub(),
                verbose: sinon.stub()
            }
        };
        (global as any).BrandingService = {
            getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' })
        };
        (global as any).UsersService = {
            getUsersForBrand: sinon.stub().returns(of([
                { id: 'primary-1', username: 'primary-user', name: 'Primary User', roles: [{ branding: 'brand-1', name: 'Researcher' }], token: 'hashed' },
                { id: 'alias-1', username: 'alias-user', name: 'Alias User', linkedPrimaryUserId: 'primary-1', accountLinkState: 'linked-alias', roles: [] }
            ])),
            enrichUsersWithEffectiveDisabledState: sinon.stub().callsFake((users: any[]) => Promise.resolve(users.map((u: any) => ({ ...u, effectiveLoginDisabled: false }))))
        };
        (global as any).UserLink = {
            find: sinon.stub().returns(createQueryObject([
                { primaryUserId: 'primary-1', secondaryUserId: 'alias-1', brandId: 'brand-1', status: 'active' }
            ]))
        };
        (global as any).User = {
            find: sinon.stub().returns(createQueryObject([
                { id: 'primary-1', username: 'primary-user' }
            ]))
        };

        controller = new Controllers.Admin();
    });

    afterEach(() => {
        sinon.restore();
        (global as any).sails = originalSails;
        (global as any).UsersService = originalUsersService;
        (global as any).BrandingService = originalBrandingService;
        (global as any).User = originalUser;
        (global as any).UserLink = originalUserLink;
    });

    it('should enrich admin users with link metadata', async () => {
        const req = { session: { branding: 'default' }, query: {} } as unknown as Sails.Req;
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.getUsers(req, res);

        expect(sendRespStub.called).to.be.true;
        const payload = sendRespStub.firstCall.args[2];
        expect(payload.data).to.have.length(2);
        expect(payload.data[0].linkedAccountCount).to.equal(1);
        expect(payload.data[1].effectivePrimaryUsername).to.equal('primary-user');
    });

    it('should skip primary user lookup when the User model is unavailable', async () => {
        const req = { session: { branding: 'default' }, query: {} } as unknown as Sails.Req;
        const res = {} as unknown as Sails.Res;
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        delete (global as any).User;

        await controller.getUsers(req, res);

        expect(sendRespStub.calledOnce).to.be.true;
        const payload = sendRespStub.firstCall.args[2];
        expect(payload.data[1].effectivePrimaryUsername).to.equal('alias-user');
    });
});
