import { expect } from 'chai';
import * as sinon from 'sinon';
import { Controllers } from '../../src/controllers/UserController';
import { isWebServiceAuthenticated } from '../../src/policies/isWebServiceAuthenticated';
import { createMockSails } from '../services/testHelper';

describe('Interactive sign-in lastLogin boundary', () => {
  const keys = ['sails', 'UsersService', 'BrandingService', 'ConfigService'];
  let old: any;
  beforeEach(() => {
    old = Object.fromEntries(keys.map(key => [key, (global as any)[key]]));
    (global as any).sails = createMockSails();
    (global as any).sails.getActions = () => ({ 'user/redirpostlogin': sinon.stub() });
    (global as any).UsersService = {
      recordSuccessfulLogin: sinon.stub().resolves(),
      addUserAuditEvent: sinon.stub().resolves(),
    };
    (global as any).BrandingService = { getBrandNameFromReq: () => 'brand' };
    (global as any).ConfigService = { getBrand: () => ({ oidc: {} }) };
  });
  afterEach(() => {
    sinon.restore();
    keys.forEach(key => ((global as any)[key] = old[key]));
  });
  for (const [action, strategy, identifier] of [
    ['localLogin', 'local', ''],
    ['aafLogin', 'aaf-jwt', ''],
    ['openidConnectLogin', 'oidc', ''],
    ['openidConnectLogin', 'oidc-campus', 'campus'],
  ]) {
    for (const outcome of ['success', 'rejected', 'session-error']) {
      it(`${strategy}: updates only after successful authentication and session (${outcome})`, async () => {
        const user = { id: 'signed-in-user', username: 'user', type: strategy };
        let completion: Promise<unknown> | undefined;
        let loggedIn = false;
        const req: any = {
          body: {},
          headers: {},
          session: {},
          param: () => identifier,
          logIn: (_user: unknown, cb: (err?: Error) => Promise<unknown>) => {
            loggedIn = outcome === 'success';
            completion = cb(outcome === 'session-error' ? new Error('session failed') : undefined);
          },
        };
        const persist = (global as any).UsersService.recordSuccessfulLogin;
        persist.callsFake(async () => {
          expect(loggedIn).to.equal(true);
        });
        (global as any).sails.config.passport = {
          authenticate: (name: string, cb: Function) => {
            expect(name).to.equal(strategy);
            return () => cb(null, outcome === 'rejected' ? false : user, { message: 'Rejected' });
          },
        };
        const res: any = {
          send: sinon.stub(),
          forbidden: sinon.stub(),
          serverError: sinon.stub(),
          redirect: sinon.stub(),
        };
        const controller = new Controllers.User();
        sinon.stub(controller as any, 'sendResp');
        (controller as any)[action](req, res);
        await completion;
        expect(persist.callCount).to.equal(outcome === 'success' ? 1 : 0);
        if (outcome === 'success') expect(persist.firstCall.args).to.deep.equal([user]);
      });
    }
  }

  it('bearer API-key authentication never records a sign-in', () => {
    (global as any).sails.config.passport = {
      authenticate: (strategy: string, cb: Function) => {
        expect(strategy).to.equal('bearer');
        return () => cb(null, { id: 'api-user' }, {});
      },
    };
    const next = sinon.stub();
    isWebServiceAuthenticated({ isAuthenticated: () => false } as any, {} as any, next);
    expect(next.calledOnce).to.equal(true);
    expect((global as any).UsersService.recordSuccessfulLogin.called).to.equal(false);
  });

  it('an existing session request never records a sign-in', () => {
    isWebServiceAuthenticated({ isAuthenticated: () => true } as any, {} as any, sinon.stub());
    expect((global as any).UsersService.recordSuccessfulLogin.called).to.equal(false);
  });
});
