// Explicit retained Express adapter cases, removed with FM-043.
import { installOidcAuthentication } from '../../src/http/express/identityProviders';
import { bootstrapDefaultAdministrator } from '../../src/identity/bootstrap';
import { AuthenticationAccounts } from '../../src/authentication/Accounts';
import { getIdentityRepositories } from '../../src/persistence/identity/runtime';
import { getStorageRepositories } from '../../src/persistence/storage/runtime';
import { recordServiceChronicle } from '../../src/utilities/serviceChronicle';
const collaborators: any = {};
const hooks = new Map<string, (...args: unknown[]) => unknown>();
import { repositoryFixtures } from '../helpers/repositoryFixtures';
import { installStorageRecordMock } from '../helpers/storageRecordMock';
import { installIdentityRepositoryMock } from '../helpers/identityMock';
import * as sinon from 'sinon';
import { of, throwError } from 'rxjs';
import {
  installRepositoryFixtures,
  restoreRepositoryFixtures,
  createDomainFixture,
  createQueryObject,
  configureModelMethod,
} from './testHelper';
import { createSinonStubLogger } from '../logger.test';

let expect: Chai.ExpectStatic;

describe('UsersService', function () {
  let fixture: any;
  let UsersService: any;
  let mockUser: any;
  let mockUserAudit: any;
  let mockUserLink: any;
  let mockRecord: any;
  let mockRole: any;

  before(async function () {
    const chai = await import('chai');
    expect = chai.expect;
  });

  beforeEach(function () {
    installStorageRecordMock();
    installIdentityRepositoryMock();
    fixture = createDomainFixture({
      config: {
        appPath: '/app',
        auth: {
          roles: [{ name: 'Admin' }, { name: 'Maintainer' }, { name: 'Researcher' }, { name: 'Guest' }],
          postLogoutRedir: '/logout',
        },
        brandingAware: sinon.stub().returns({
          authorizedDomainsEmails: {
            enabled: 'true',
            domainsAaf: ['example.edu.au'],
            emailsAaf: ['allowed@other.com'],
            domainsOidc: ['uni.edu'],
            emailsOidc: ['special@third.com'],
          },
        }),
      },
      log: createSinonStubLogger(sinon),
    });

    mockUser = {
      find: sinon.stub().returns(createQueryObject([])),
      findOne: sinon.stub().returns(createQueryObject(null)),
      create: sinon.stub().returns(createQueryObject({ id: 'user-1', username: 'testuser' })),
      update: sinon.stub().returns(createQueryObject([{ id: 'user-1' }])),
      destroy: sinon.stub().returns(createQueryObject([])),
      addToCollection: sinon.stub().returns({
        members: sinon.stub().returns(createQueryObject([])),
      }),
      replaceCollection: sinon.stub().returns({
        members: sinon.stub().returns(createQueryObject([])),
      }),
    };

    mockUserAudit = {
      find: sinon.stub().returns(createQueryObject([])),
      create: sinon.stub().returns(createQueryObject({ id: 'audit-1' })),
    };

    mockUserLink = {
      find: sinon.stub().returns(createQueryObject([])),
      findOne: sinon.stub().returns(createQueryObject(null)),
      create: sinon.stub().returns(createQueryObject({ id: 'link-1' })),
    };

    mockRecord = {
      find: sinon.stub().returns({
        meta: sinon.stub().returns({
          then: sinon.stub().callsFake(cb => {
            cb([]);
            return { catch: sinon.stub() };
          }),
        }),
      }),
    };

    mockRole = {
      find: sinon.stub().returns(createQueryObject([])),
      findOne: sinon.stub().returns(createQueryObject(null)),
      addToCollection: sinon.stub().returns({
        members: sinon.stub().returns(createQueryObject([])),
      }),
    };

    installRepositoryFixtures();
    repositoryFixtures.User = mockUser;
    repositoryFixtures.UserAudit = mockUserAudit;
    repositoryFixtures.UserLink = mockUserLink;
    repositoryFixtures.Record = mockRecord;
    repositoryFixtures.Role = mockRole;
    collaborators.RolesService = {
      getRoleByName: sinon.stub().returns({ id: 'role-1', name: 'Admin' }),
      getAdminFromRoles: sinon.stub().returns({ id: 'role-admin', name: 'Admin', users: [] }),
      getAdminFromBrand: sinon.stub().returns({ id: 'role-admin', name: 'Admin' }),
      getDefAuthenticatedRole: sinon.stub().returns({ id: 'role-auth', name: 'Researcher' }),
      getNestedRoles: sinon.stub().returns([{ id: 'role-1' }]),
    };
    collaborators.BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default', roles: [] }),
      getBrandById: sinon.stub().returns({ id: 'brand-1', name: 'default', roles: [] }),
      getDefault: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      getBrandNameFromReq: sinon.stub().returns('default'),
    };
    collaborators.ConfigService = {
      getBrand: sinon.stub().returns({
        local: {
          usernameField: 'username',
          passwordField: 'password',
          default: {
            adminUser: 'admin',
            adminPw: 'adminpass',
            email: 'admin@test.com',
          },
        },
        active: ['local'],
        aaf: {
          attributesField: 'attributes',
          usernameField: 'sub',
          defaultRole: 'Researcher',
        },
      }),
    };
    collaborators.RecordsService = {
      provideUserAccessAndRemovePendingAccess: sinon.stub().resolves({
        requestId: '00000000-0000-4000-8000-000000000001',
        wasPersisted: () => true,
      }),
      mutateMetaInternal: sinon.stub().resolves({
        isSuccessful: () => true,
        wasPersisted: () => true,
        isComplete: () => true,
      }),
    };
    collaborators.FormVocabularyService = {};
    collaborators.SecurityEventService = {
      emitFromUserAudit: sinon.stub().resolves(null)
    };

    // Import after mocks are set up
    const { Services } = require('../../src/services/UsersService');
    const accounts = new AuthenticationAccounts({ repository: getIdentityRepositories(), log: fixture.log,
      get postLogoutRedirect() { return fixture.config.auth.postLogoutRedir; },
      defaultBrand: () => collaborators.BrandingService.getDefault(), getBrand: name => collaborators.BrandingService.getBrand(name),
      authConfig: name => collaborators.ConfigService.getBrand(name), defaultAuthenticatedRole: brand => collaborators.RolesService.getDefAuthenticatedRole(brand),
      nestedRoles: (name, roles) => collaborators.RolesService.getNestedRoles(name, roles),
      authorizedEmails: brand => fixture.config.brandingAware(brand)?.authorizedDomainsEmails ?? {}, resolveHook: name => hooks.get(name)!,
      event: (info, errors, level) => recordServiceChronicle(fixture.log, info, errors, level),
    });
    UsersService = new Services.Users({ repository: getIdentityRepositories(), accounts, log: fixture.log,
      defaultBrand: () => collaborators.BrandingService.getDefault(),
      recordAccess: { storage: getStorageRepositories(), get records() { return collaborators.RecordsService; } },
      emitSecurityEvent: (...args) => collaborators.SecurityEventService?.emitFromUserAudit(...args) ?? Promise.resolve(),
    });
  });

  afterEach(function () {
    restoreRepositoryFixtures();
    delete repositoryFixtures.User;
    delete repositoryFixtures.UserAudit;
    delete repositoryFixtures.UserLink;
    delete repositoryFixtures.Record;
    delete repositoryFixtures.Role;
    delete collaborators.RolesService;
    delete collaborators.BrandingService;
    delete collaborators.ConfigService;
    delete collaborators.RecordsService;
    delete collaborators.FormVocabularyService;
    delete collaborators.SecurityEventService;
    sinon.restore();
  });

  describe('OIDC authorization request parameters', function () {
    it('should generate a unique state while preserving default and configured parameters', async function () {
      const passportUse = sinon.stub();
      fixture.config.passport = {
        use: passportUse,
      };
      collaborators.ConfigService.getBrand.returns({
        active: ['oidc'],
        oidc: {
          discoverAttemptsMax: 1,
          opts: {
            issuer: {
              issuer: 'https://example.okta.com/oauth2/default',
              authorization_endpoint: 'https://example.okta.com/oauth2/default/v1/authorize',
              token_endpoint: 'https://example.okta.com/oauth2/default/v1/token',
              jwks_uri: 'https://example.okta.com/oauth2/default/v1/keys',
              code_challenge_methods_supported: ['S256'],
            },
            client: {
              client_id: 'test-client',
              client_secret: 'test-secret',
              redirect_uris: ['https://portal.example.com/user/login_oidc'],
            },
            params: {
              scope: 'openid profile email',
              claims: {
                userinfo: {
                  email: { essential: true },
                },
              },
            },
          },
        },
      });

      await installOidcAuthentication({ passport: { use: passportUse }, accounts: UsersService.input.accounts, config: collaborators.ConfigService.getBrand('default'), brand: () => collaborators.BrandingService.getDefault() });

      expect(passportUse.calledOnce).to.be.true;
      const strategy = passportUse.firstCall.args[1];
      const firstParams = strategy.authorizationRequestParams({}, { prompt: 'login' });
      const secondParams = strategy.authorizationRequestParams({}, { prompt: 'login' });

      expect(firstParams.get('state')).to.be.a('string').and.not.be.empty;
      expect(secondParams.get('state')).to.be.a('string').and.not.be.empty;
      expect(firstParams.get('state')).to.not.equal(secondParams.get('state'));
      expect(firstParams.get('prompt')).to.equal('login');
      expect(firstParams.get('claims')).to.equal(
        JSON.stringify({
          userinfo: {
            email: { essential: true },
          },
        })
      );
    });
  });

});
