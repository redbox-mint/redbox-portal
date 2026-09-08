import * as sinon from 'sinon';
import * as AuthorizationActorIssuer from '../../src/services/AuthorizationActorIssuer';
import { freezeAuthorizationContext } from '../../src/authorization';
import { genuineTestActor } from './genuineActor';
import { of, throwError } from 'rxjs';
import { UserWLDef } from '../../src/waterline-models/User';
import {
  setupServiceTestGlobals,
  cleanupServiceTestGlobals,
  createMockSails,
  createQueryObject,
  configureModelMethod,
} from './testHelper';

let expect: Chai.ExpectStatic;

// AUTH-ACTOR-001: request-facing mutations require a SERVER-ISSUED actor.
// These helpers issue through the genuine `AuthorizationService` resolver
// (stub brand/registry); bare `freezeAuthorizationContext` output (or
// `Object.freeze` forgeries) without the resolver capability is rejected.
async function buildTestBrandActor(scopes: string[] = ['user.manage', 'user.account-link.manage']): Promise<any> {
  return genuineTestActor({
    contextType: 'brand',
    principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'admin-1' },
    brand: { requestedIdentifier: 'brand-1', id: 'brand-1', name: 'Brand 1' },
    effectiveScopeKeys: scopes,
  });
}

async function buildTestBearerActor(
  scopes: string[] = ['user.manage', 'user.account-link.manage', 'authorization.assignment.manage']
): Promise<any> {
  return genuineTestActor({
    contextType: 'brand',
    principal: { category: 'legacy-bearer', authMethod: 'bearer', active: true, userId: 'api-user-1' },
    brand: { requestedIdentifier: 'brand-1', id: 'brand-1', name: 'Brand 1' },
    effectiveScopeKeys: scopes,
  });
}

describe('UsersService', function () {
  let mockSails: any;
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
    mockSails = createMockSails({
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
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
      },
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
      find: sinon.stub().callsFake(() => {
        const query: any = createQueryObject([]);
        return query;
      }),
    };

    mockRole = {
      find: sinon.stub().returns(createQueryObject([])),
      findOne: sinon.stub().returns(createQueryObject(null)),
      addToCollection: sinon.stub().returns({
        members: sinon.stub().returns(createQueryObject([])),
      }),
    };

    setupServiceTestGlobals(mockSails);
    (global as any).User = mockUser;
    (global as any).UserAudit = mockUserAudit;
    (global as any).UserLink = mockUserLink;
    (global as any).Record = mockRecord;
    (global as any).Role = mockRole;
    (global as any).RolesService = {
      getRoleByName: sinon.stub().returns({ id: 'role-1', name: 'Admin' }),
      getAdminFromRoles: sinon.stub().returns({ id: 'role-admin', name: 'Admin', users: [] }),
      getAdminFromBrand: sinon.stub().returns({ id: 'role-admin', name: 'Admin' }),
      getDefAuthenticatedRole: sinon.stub().returns({ id: 'role-auth', name: 'Researcher' }),
      getNestedRoles: sinon.stub().returns([{ id: 'role-1' }]),
    };
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default', roles: [] }),
      getBrandById: sinon.stub().returns({ id: 'brand-1', name: 'default', roles: [] }),
      getDefault: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      getBrandNameFromReq: sinon.stub().returns('default'),
    };
    (global as any).ConfigService = {
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
    (global as any).RecordsService = {
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
    (global as any).FormVocabularyService = {};

    // Import after mocks are set up
    const { Services } = require('../../src/services/UsersService');
    UsersService = new Services.Users();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).User;
    delete (global as any).UserAudit;
    delete (global as any).UserLink;
    delete (global as any).Record;
    delete (global as any).Role;
    delete (global as any).RolesService;
    delete (global as any).BrandingService;
    delete (global as any).ConfigService;
    delete (global as any).RecordsService;
    delete (global as any).FormVocabularyService;
    sinon.restore();
  });

  describe('onboarding role assignment', function () {
    for (const provider of ['oidc', 'aaf']) {
      it(`delegates only the configured ${provider} role scopes`, async function () {
        mockSails.services.authorizationscopeservice = {
          getRegistry: () => ({
            validateScopeKeys: (keys: string[]) => ({
              activeScopeKeys: keys,
              inactiveScopeKeys: [],
              missingScopeKeys: [],
            }),
          }),
        };
        mockSails.services.brandingservice = { getBrandById: async () => ({ id: 'brand-1', name: 'default' }) };
        const getRole = sinon.stub().resolves({ effectiveScopeKeys: ['record.create', 'record.read'] });
        const grantAssignment = sinon.stub().resolves({});
        mockSails.services.roleadministrationservice = { getRole, grantAssignment };

        await UsersService.assignOnboardingRole({ id: 'user-1' }, { id: 'brand-1' }, { name: 'Researcher' }, provider);

        expect(getRole.calledOnce).to.equal(true);
        expect(getRole.firstCall.args[0].effectiveScopeKeys).to.deep.equal(['authorization.role.read']);
        expect(getRole.firstCall.args.slice(1)).to.deep.equal(['brand-1', 'Researcher']);
        expect(grantAssignment.calledOnce).to.equal(true);
        const command = grantAssignment.firstCall.args[0];
        expect(command).to.include({
          brandId: 'brand-1',
          principalId: 'user-1',
          roleKey: 'Researcher',
          source: 'onboarding',
          sourceKey: provider,
        });
        expect(command.actor.principal.category).to.equal('system-process');
        expect(command.actor.effectiveScopeKeys).to.have.members([
          'authorization.assignment.manage',
          'record.create',
          'record.read',
        ]);
      });
    }
  });

  describe('hasRole', function () {
    it('should return role object when user has the role', function () {
      const user = {
        roles: [
          { id: 'role-1', name: 'Admin' },
          { id: 'role-2', name: 'Researcher' },
        ],
      };
      const targetRole = { id: 'role-1', name: 'Admin' };

      const result = UsersService.hasRole(user, targetRole);

      expect(result).to.deep.equal({ id: 'role-1', name: 'Admin' });
    });

    it('should return undefined when user does not have the role', function () {
      const user = {
        roles: [{ id: 'role-2', name: 'Researcher' }],
      };
      const targetRole = { id: 'role-1', name: 'Admin' };

      const result = UsersService.hasRole(user, targetRole);

      expect(result).to.be.undefined;
    });

    it('should return undefined for user with no roles', function () {
      const user = { roles: [] };
      const targetRole = { id: 'role-1', name: 'Admin' };

      const result = UsersService.hasRole(user, targetRole);

      expect(result).to.be.undefined;
    });
  });

  describe('stringifyObject', function () {
    it('should stringify a simple object', function () {
      const obj = { name: 'test', value: 123 };

      const result = UsersService.stringifyObject(obj);

      expect(result).to.equal('{"name":"test","value":123}');
    });

    it('should handle function properties by replacing them', function () {
      const obj = {
        name: 'test',
        callback: function () {
          return 'hello';
        },
      };

      const result = UsersService.stringifyObject(obj);
      const parsed = JSON.parse(result);

      expect(parsed.name).to.equal('test');
      expect(parsed.callback).to.equal('function-property-not-exported');
    });

    it('should handle nested objects', function () {
      const obj = {
        user: {
          name: 'test',
          details: { age: 30 },
        },
      };

      const result = UsersService.stringifyObject(obj);
      const parsed = JSON.parse(result);

      expect(parsed.user.name).to.equal('test');
      expect(parsed.user.details.age).to.equal(30);
    });

    it('should handle null values', function () {
      const obj = { name: null, value: undefined };

      const result = UsersService.stringifyObject(obj);
      const parsed = JSON.parse(result);

      expect(parsed.name).to.be.null;
      expect(parsed.value).to.be.undefined;
    });
  });

  describe('checkAuthorizedEmail', function () {
    it('should return false when no email provided', function () {
      const result = UsersService.checkAuthorizedEmail('', 'default', 'aaf');

      expect(result).to.be.false;
    });

    it('should return false for invalid email format', function () {
      const result = UsersService.checkAuthorizedEmail('invalidemail', 'default', 'aaf');

      expect(result).to.be.false;
    });

    it('should return true when authorization is disabled', function () {
      mockSails.config.brandingAware.returns({
        authorizedDomainsEmails: {
          enabled: 'false',
        },
      });

      const result = UsersService.checkAuthorizedEmail('test@any.com', 'default', 'aaf');

      expect(result).to.be.true;
    });

    it('should return true for allowed AAF domain', function () {
      const result = UsersService.checkAuthorizedEmail('user@example.edu.au', 'default', 'aaf');

      expect(result).to.be.true;
    });

    it('should return true for allowed AAF email exception', function () {
      const result = UsersService.checkAuthorizedEmail('allowed@other.com', 'default', 'aaf');

      expect(result).to.be.true;
    });

    it('should return false for disallowed AAF email', function () {
      const result = UsersService.checkAuthorizedEmail('unauthorized@random.com', 'default', 'aaf');

      expect(result).to.be.false;
    });

    it('should return true for allowed OIDC domain', function () {
      const result = UsersService.checkAuthorizedEmail('user@uni.edu', 'default', 'oidc');

      expect(result).to.be.true;
    });

    it('should return true for allowed OIDC email exception', function () {
      const result = UsersService.checkAuthorizedEmail('special@third.com', 'default', 'oidc');

      expect(result).to.be.true;
    });

    it('should return false for disallowed OIDC email', function () {
      const result = UsersService.checkAuthorizedEmail('unauthorized@random.com', 'default', 'oidc');

      expect(result).to.be.false;
    });

    it('should return false for unknown auth type', function () {
      const result = UsersService.checkAuthorizedEmail('user@example.edu.au', 'default', 'unknown');

      expect(result).to.be.false;
    });

    it('should return true when no domains or emails are configured', function () {
      mockSails.config.brandingAware.returns({
        authorizedDomainsEmails: {
          enabled: 'true',
          domainsAaf: [],
          emailsAaf: [],
        },
      });

      const result = UsersService.checkAuthorizedEmail('any@email.com', 'default', 'aaf');

      expect(result).to.be.true;
    });
  });

  describe('OIDC authorization request parameters', function () {
    it('should generate a unique state while preserving default and configured parameters', async function () {
      const passportUse = sinon.stub();
      mockSails.config.passport = {
        use: passportUse,
      };
      (global as any).ConfigService.getBrand.returns({
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

      (UsersService as any).openIdConnectAuth();
      expect(mockSails.on.calledOnceWith('ready')).to.be.true;
      await mockSails.on.firstCall.args[1]();

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

  describe('addUserAuditEvent', function () {
    it('should return null when no user provided', async function () {
      const result = await UsersService.addUserAuditEvent(null, 'login', {});

      expect(result).to.be.null;
    });

    it('should return null for empty user object', async function () {
      const result = await UsersService.addUserAuditEvent({}, 'login', {});

      expect(result).to.be.null;
    });

    it('should create audit event for valid user', async function () {
      const user = { id: 'user-1', username: 'testuser', email: 'test@test.com' };
      configureModelMethod(mockUserAudit.create, { id: 'audit-1', action: 'login' });

      const result = await UsersService.addUserAuditEvent(user, 'login', { ip: '127.0.0.1' });

      expect(result).to.exist;
      expect(mockUserAudit.create.called).to.be.true;
    });

    it('should remove password from user before auditing', async function () {
      const user = { id: 'user-1', username: 'testuser', password: 'secret123' };
      configureModelMethod(mockUserAudit.create, { id: 'audit-1' });

      await UsersService.addUserAuditEvent(user, 'login', {});

      expect(user.password).to.be.undefined;
    });
  });

  describe('findUsersWithName', function () {
    it('should find users matching name', async function () {
      const users = [
        { id: 'user-1', name: 'John Doe', roles: [{ branding: 'brand-1' }] },
        { id: 'user-2', name: 'John Smith', roles: [{ branding: 'brand-1' }] },
      ];
      configureModelMethod(mockUser.find, users);

      const result = await UsersService.findUsersWithName('John', 'brand-1').toPromise();

      expect(result).to.have.length(2);
    });

    it('should filter by brand', async function () {
      const users = [
        { id: 'user-1', name: 'John Doe', roles: [{ branding: 'brand-1' }] },
        { id: 'user-2', name: 'John Smith', roles: [{ branding: 'brand-2' }] },
      ];
      configureModelMethod(mockUser.find, users);

      const result = await UsersService.findUsersWithName('John', 'brand-1').toPromise();

      expect(result).to.have.length(1);
      expect(result[0].id).to.equal('user-1');
    });
  });

  describe('findUsersWithEmail', function () {
    it('should find users matching email', async function () {
      const users = [{ id: 'user-1', email: 'john@test.com', roles: [{ branding: 'brand-1' }] }];
      configureModelMethod(mockUser.find, users);

      const result = await UsersService.findUsersWithEmail('john@test.com', 'brand-1', null).toPromise();

      expect(result).to.have.length(1);
      expect(result[0].email).to.equal('john@test.com');
    });
  });

  describe('findUsersWithQuery', function () {
    it('should find users with custom query', async function () {
      const users = [{ id: 'user-1', name: 'Test', type: 'local', roles: [{ branding: 'brand-1' }] }];
      configureModelMethod(mockUser.find, users);

      const result = await UsersService.findUsersWithQuery(
        { name: { contains: 'Test' } },
        'brand-1',
        'local'
      ).toPromise();

      expect(result).to.have.length(1);
    });

    it('should return all users when no brand filter', async function () {
      const users = [
        { id: 'user-1', name: 'Test1', roles: [] },
        { id: 'user-2', name: 'Test2', roles: [] },
      ];
      configureModelMethod(mockUser.find, users);

      const result = await UsersService.findUsersWithQuery({ name: { contains: 'Test' } }, null, null).toPromise();

      expect(result).to.have.length(2);
    });
  });

  describe('assignAccessToPendingRecordsForLifecycle', function () {
    it('should not crash when no pending records found', async function () {
      const result = await UsersService.assignAccessToPendingRecordsForLifecycle('pending-email@test.com', 'user-1');
      expect(result).to.equal(0);
    });

    it('should call RecordsService for found records', async function () {
      const records = [{ redboxOid: 'record-1' }, { redboxOid: 'record-2' }];
      configureModelMethod(mockRecord.find, records);

      const result = await UsersService.assignAccessToPendingRecordsForLifecycle('pending@test.com', 'user-1');

      expect(mockRecord.find.called).to.be.true;
      expect((global as any).RecordsService.provideUserAccessAndRemovePendingAccess.callCount).to.equal(2);
      expect(result).to.equal(2);
    });

    it('propagates pending-access mutation failures through the user lifecycle hook', async function () {
      const failure = new Error('conditional mutation failed');
      mockUser.assignAccessToPendingRecords = sinon.stub().rejects(failure);

      const hookError = await new Promise<Error | undefined>(resolve => {
        UserWLDef.afterCreate?.({ email: 'pending@test.com', username: 'user-1', name: 'Test User' }, resolve);
      });

      expect(hookError).to.equal(failure);
    });
  });

  describe('getUserWithUsername', function () {
    it('should return user when found', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [{ id: 'role-1' }] };
      configureModelMethod(mockUser.findOne, user);

      const result = await UsersService.getUserWithUsername('testuser').toPromise();

      expect(result).to.exist;
      expect(result.username).to.equal('testuser');
    });

    it('should return null when user not found', async function () {
      configureModelMethod(mockUser.findOne, null);

      const result = await UsersService.getUserWithUsername('nonexistent').toPromise();

      expect(result).to.be.null;
    });
  });

  describe('getUserWithId', function () {
    it('should return user when found', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [{ id: 'role-1' }] };
      configureModelMethod(mockUser.findOne, user);

      const result = await UsersService.getUserWithId('user-1').toPromise();

      expect(result).to.exist;
      expect(result.id).to.equal('user-1');
    });

    it('should return null when user not found', async function () {
      configureModelMethod(mockUser.findOne, null);

      const result = await UsersService.getUserWithId('nonexistent').toPromise();

      expect(result).to.be.null;
    });
  });

  describe('getUsers', function () {
    it('should return all users', async function () {
      const users = [
        { id: 'user-1', username: 'user1', roles: [] },
        { id: 'user-2', username: 'user2', roles: [] },
      ];
      configureModelMethod(mockUser.find, users);

      const result = await UsersService.getUsers().toPromise();

      expect(result).to.have.length(2);
    });

    it('should return empty array when no users', async function () {
      configureModelMethod(mockUser.find, []);

      const result = await UsersService.getUsers().toPromise();

      expect(result).to.be.an('array').that.is.empty;
    });
  });

  describe('getUsersForBrand', function () {
    it('should return users for specific brand', async function () {
      const users = [
        { id: 'user-1', username: 'user1', roles: [{ branding: 'brand-1' }] },
        { id: 'user-2', username: 'user2', roles: [{ branding: 'brand-2' }] },
      ];
      configureModelMethod(mockUser.find, users);

      const result = await UsersService.getUsersForBrand('brand-1').toPromise();

      expect(result).to.have.length(1);
      expect(result[0].id).to.equal('user-1');
    });

    it('should return empty array for empty brand', async function () {
      const result = await UsersService.getUsersForBrand('').toPromise();

      expect(result).to.be.an('array').that.is.empty;
    });

    it('should accept brand object', async function () {
      const users = [{ id: 'user-1', username: 'user1', roles: [{ branding: 'brand-1' }] }];
      configureModelMethod(mockUser.find, users);

      const result = await UsersService.getUsersForBrand({ id: 'brand-1', name: 'default' }).toPromise();

      expect(result).to.have.length(1);
    });

    it('should include linked alias users for the brand even when they no longer have brand roles', async function () {
      configureModelMethod(mockUser.find, [
        { id: 'primary-1', username: 'primary', roles: [{ branding: 'brand-1' }] },
        { id: 'alias-1', username: 'alias', linkedPrimaryUserId: 'primary-1', roles: [] },
      ]);
      configureModelMethod(mockUserLink.find, [
        { primaryUserId: 'primary-1', secondaryUserId: 'alias-1', brandId: 'brand-1', status: 'active' },
      ]);

      const result = await UsersService.getUsersForBrand('brand-1').toPromise();

      expect(result).to.have.length(2);
    });
  });

  describe('Phase 7 brand-scoped user contracts', function () {
    it('returns a user only when a role or active account link belongs to the requested brand', async function () {
      configureModelMethod(mockUser.findOne, {
        id: 'user-1',
        username: 'user1',
        roles: [{ branding: 'brand-2' }],
      });
      configureModelMethod(mockUserLink.findOne, null);

      const foreign = await UsersService.getUserForBrand('user-1', 'brand-1').toPromise();

      expect(foreign).to.equal(null);
      expect(mockUserLink.findOne.firstCall.args[0]).to.deep.equal({
        brandId: 'brand-1',
        status: 'active',
        or: [{ primaryUserId: 'user-1' }, { secondaryUserId: 'user-1' }],
      });

      configureModelMethod(mockUserLink.findOne, {
        brandId: 'brand-1',
        status: 'active',
        primaryUserId: 'user-1',
      });
      const linked = await UsersService.getUserForBrand('user-1', 'brand-1').toPromise();
      expect(linked?.id).to.equal('user-1');
    });

    it('uses an opaque not-found error and a brand predicate for linked-account reads', async function () {
      configureModelMethod(mockUser.findOne, {
        id: 'primary-1',
        username: 'primary',
        roles: [{ branding: 'brand-1' }],
      });
      configureModelMethod(mockUserLink.find, []);

      const result = await UsersService.getLinkedAccountsForBrand('primary-1', 'brand-1').toPromise();
      expect(result.primary.id).to.equal('primary-1');
      expect(mockUserLink.find.firstCall.args[0]).to.deep.equal({
        primaryUserId: 'primary-1',
        status: 'active',
        brandId: 'brand-1',
      });

      configureModelMethod(mockUser.findOne, {
        id: 'foreign-1',
        username: 'foreign',
        roles: [{ branding: 'brand-2' }],
      });
      configureModelMethod(mockUserLink.findOne, null);
      try {
        await UsersService.getLinkedAccountsForBrand('foreign-1', 'brand-1').toPromise();
        expect.fail('Expected a cross-brand lookup to fail');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('authorization.not-found');
      }
    });

    it('checks brand membership before updating profile data', async function () {
      configureModelMethod(mockUser.findOne, {
        id: 'user-1',
        username: 'user1',
        roles: [{ branding: 'brand-2' }],
      });
      configureModelMethod(mockUserLink.findOne, null);

      try {
        await UsersService.updateUserDetailsForBrand('user-1', 'Updated User', 'updated@example.test', '', 'brand-1', {
          actorContext: await buildTestBrandActor(['user.manage']),
          expectedVersion: 1,
          requestId: 'test-update-brand-denied',
        }).toPromise();
        expect.fail('Expected a cross-brand update to fail');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('authorization.not-found');
      }
      expect(mockUser.update.called).to.equal(false);

      configureModelMethod(mockUser.findOne, {
        id: 'user-1',
        username: 'user1',
        roles: [{ branding: 'brand-1' }],
      });
      configureModelMethod(mockUser.update, [{ id: 'user-1', name: 'Updated User' }]);

      const updated = await UsersService.updateUserDetailsForBrand(
        'user-1',
        'Updated User',
        'updated@example.test',
        '',
        'brand-1',
        {
          actorContext: await buildTestBrandActor(['user.manage']),
          expectedVersion: 1,
          requestId: 'test-update-brand-ok',
        }
      ).toPromise();

      expect(updated?.[1]?.[0]?.name).to.equal('Updated User');
      expect(mockUser.update.calledOnce).to.equal(true);
    });
  });

  describe('getEffectiveUser', function () {
    it('should resolve a linked alias to its primary user', async function () {
      mockUser.findOne.onFirstCall().returns(
        createQueryObject({
          id: 'alias-1',
          username: 'alias',
          linkedPrimaryUserId: 'primary-1',
          roles: [],
        })
      );
      mockUser.findOne.onSecondCall().returns(
        createQueryObject({
          id: 'primary-1',
          username: 'primary',
          roles: [],
        })
      );

      const result = await UsersService.getEffectiveUser('alias-1').toPromise();

      expect(result).to.exist;
      expect(result.username).to.equal('primary');
    });
  });

  describe('getLinkedAccounts (public service surface)', function () {
    it('should be exported on the public service surface', function () {
      expect(UsersService.exports()).to.have.property('getLinkedAccounts');
    });

    it('should return linked account data for a seeded primary user', async function () {
      mockUser.findOne.onFirstCall().returns(
        createQueryObject({
          id: 'primary-1',
          username: 'primary-user',
          name: 'Primary User',
          email: 'primary@test.com',
          type: 'local',
          roles: [],
        })
      );
      configureModelMethod(mockUserLink.find, [
        {
          primaryUserId: 'primary-1',
          secondaryUserId: 'secondary-1',
          status: 'active',
          createdAt: '2026-03-26T00:00:00.000Z',
        },
      ]);
      mockUser.find.onFirstCall().returns(
        createQueryObject([
          {
            id: 'secondary-1',
            username: 'secondary-user',
            name: 'Secondary User',
            email: 'secondary@test.com',
            type: 'local',
            roles: [],
          },
        ])
      );

      const result = await UsersService.getLinkedAccounts('primary-1').toPromise();

      expect(result.primary.username).to.equal('primary-user');
      expect(result.linkedAccounts).to.have.length(1);
      expect(result.linkedAccounts[0].username).to.equal('secondary-user');
    });

    it('should return an empty linkedAccounts array when no links exist', async function () {
      mockUser.findOne.onFirstCall().returns(
        createQueryObject({
          id: 'primary-1',
          username: 'primary-user',
          name: 'Primary User',
          email: 'primary@test.com',
          type: 'local',
          roles: [],
        })
      );
      configureModelMethod(mockUserLink.find, []);

      const result = await UsersService.getLinkedAccounts('primary-1').toPromise();

      expect(result.linkedAccounts).to.deep.equal([]);
    });

    it('should surface repository failures from linked account lookups', async function () {
      mockUser.findOne.onFirstCall().returns(
        createQueryObject({
          id: 'primary-1',
          username: 'primary-user',
          name: 'Primary User',
          email: 'primary@test.com',
          type: 'local',
          roles: [],
        })
      );
      mockUserLink.find = sinon.stub().throws(new Error('Permission denied'));

      try {
        await UsersService.getLinkedAccounts('primary-1').toPromise();
        expect.fail('Expected getLinkedAccounts to throw');
      } catch (error) {
        expect((error as Error).message).to.equal('Permission denied');
      }
    });
  });

  describe('searchLinkCandidates', function () {
    it('should return active matching users in the brand or with no roles', async function () {
      configureModelMethod(mockUser.find, [
        {
          id: 'user-1',
          username: 'primary',
          name: 'Primary User',
          email: 'primary@test.com',
          accountLinkState: 'active',
          roles: [{ branding: 'brand-1' }],
        },
        {
          id: 'user-2',
          username: 'orphan',
          name: 'Orphan User',
          email: 'orphan@test.com',
          accountLinkState: 'active',
          roles: [],
        },
        {
          id: 'user-3',
          username: 'linked',
          name: 'Linked User',
          email: 'linked@test.com',
          accountLinkState: 'linked-alias',
          roles: [{ branding: 'brand-1' }],
        },
        {
          id: 'user-4',
          username: 'other',
          name: 'Other User',
          email: 'other@test.com',
          accountLinkState: 'active',
          roles: [{ branding: 'brand-2' }],
        },
      ]);
      configureModelMethod(mockUserLink.find, []);

      const result = await UsersService.searchLinkCandidates('user', 'brand-1', 'user-1').toPromise();

      expect(mockUser.find.firstCall.args[0]).to.deep.equal({
        accountLinkState: 'active',
        loginDisabled: { '!=': true },
        id: { '!=': 'user-1' },
        or: [{ username: { contains: 'user' } }, { name: { contains: 'user' } }, { email: { contains: 'user' } }],
      });
      expect(result).to.have.length(1);
      expect(result[0].username).to.equal('orphan');
    });

    it('should exclude users who already have linked accounts of their own', async function () {
      configureModelMethod(mockUser.find, [
        {
          id: 'user-1',
          username: 'primary',
          name: 'Primary User',
          email: 'primary@test.com',
          accountLinkState: 'active',
          roles: [{ branding: 'brand-1' }],
        },
        {
          id: 'user-2',
          username: 'candidate',
          name: 'Candidate User',
          email: 'candidate@test.com',
          accountLinkState: 'active',
          roles: [],
        },
        {
          id: 'user-3',
          username: 'alias',
          name: 'Alias User',
          email: 'alias@test.com',
          accountLinkState: 'linked-alias',
          roles: [],
        },
      ]);
      configureModelMethod(mockUserLink.find, [
        { primaryUserId: 'user-1', secondaryUserId: 'user-3', status: 'active' },
      ]);

      const result = await UsersService.searchLinkCandidates('user', 'brand-1').toPromise();

      expect(mockUserLink.find.firstCall.args[0]).to.deep.equal({
        status: 'active',
        primaryUserId: ['user-1', 'user-2', 'user-3'],
      });
      expect(result).to.have.length(1);
      expect(result[0].username).to.equal('candidate');
    });
  });

  describe('getLinkedAccounts (detailed scenarios)', function () {
    it('should return linked accounts for a primary user', async function () {
      mockUser.findOne.onFirstCall().returns(
        createQueryObject({
          id: 'primary-1',
          username: 'primary-user',
          name: 'Primary User',
          email: 'primary@test.com',
          type: 'local',
          roles: [],
        })
      );
      configureModelMethod(mockUserLink.find, [
        {
          primaryUserId: 'primary-1',
          secondaryUserId: 'secondary-1',
          brandId: 'brand-1',
          status: 'active',
          createdAt: '2026-03-26T00:00:00.000Z',
        },
      ]);
      configureModelMethod(mockUser.find, [
        {
          id: 'secondary-1',
          username: 'secondary-user',
          name: 'Secondary User',
          email: 'secondary@test.com',
          type: 'local',
          accountLinkState: 'linked-alias',
          roles: [],
        },
      ]);

      const result = await UsersService.getLinkedAccounts('primary-1').toPromise();

      expect(result).to.exist;
      expect(result.primary).to.exist;
      expect(result.linkedAccounts).to.have.length(1);
      expect(result.linkedAccounts[0].username).to.equal('secondary-user');
    });

    it('should return empty linked accounts when none exist', async function () {
      mockUser.findOne.onFirstCall().returns(
        createQueryObject({
          id: 'user-with-no-links',
          username: 'primary-user',
          name: 'Primary User',
          email: 'primary@test.com',
          type: 'local',
          roles: [],
        })
      );
      configureModelMethod(mockUserLink.find, []);
      configureModelMethod(mockUser.find, []);

      const result = await UsersService.getLinkedAccounts('user-with-no-links').toPromise();

      expect(result).to.exist;
      expect(result.linkedAccounts).to.have.length(0);
    });

    it('should handle errors gracefully', async function () {
      mockUser.findOne.onFirstCall().returns(
        createQueryObject({
          id: 'primary-1',
          username: 'primary-user',
          name: 'Primary User',
          email: 'primary@test.com',
          type: 'local',
          roles: [],
        })
      );
      (mockUserLink.find as sinon.SinonStub).throws(new Error('Database error'));

      try {
        await UsersService.getLinkedAccounts('primary-1').toPromise();
        expect.fail('Expected getLinkedAccounts to throw');
      } catch (error) {
        expect((error as Error).message).to.include('Database error');
      }
    });
  });

  describe('linkAccounts', function () {
    // AUTH-ACTOR-001: genuine resolver-issued context (active, session,
    // brand-authorized). Omitted/forged variants are rejected by dedicated
    // fail-closed tests below.
    let fakeLinkActor: any;
    before(async function () {
      fakeLinkActor = await buildTestBrandActor(['user.account-link.manage']);
    });

    it('should delegate tuple adoption to the guarded link writer and rewrite authorization references', async function () {
      mockUser.findOne.onFirstCall().returns(
        createQueryObject({
          id: 'primary-1',
          username: 'primary-user',
          accountLinkState: 'active',
          roles: [{ id: 'role-primary', branding: 'brand-1' }],
        })
      );
      mockUser.findOne.onSecondCall().returns(
        createQueryObject({
          id: 'secondary-1',
          username: 'secondary-user',
          email: 'secondary@test.com',
          accountLinkState: 'active',
          roles: [{ id: 'role-secondary', name: 'Librarians', key: 'Librarians', branding: 'brand-1' }],
        })
      );
      configureModelMethod(mockUserLink.find, [
        {
          primaryUserId: 'primary-1',
          secondaryUserId: 'secondary-1',
          createdAt: '2026-03-26T00:00:00.000Z',
          status: 'active',
        },
      ]);
      mockUser.find.onFirstCall().returns(
        createQueryObject([
          {
            id: 'secondary-1',
            username: 'secondary-user',
            name: 'Secondary User',
            email: 'secondary@test.com',
            type: 'local',
            accountLinkState: 'linked-alias',
            roles: [],
          },
        ])
      );

      // P5-G8: the guarded writer returns AuthorizationMutationResult with
      // rolesAdopted under `data`; the adapter must read the real shape.
      // P5-Gate-F: record rewrites commit inside the guarded writer
      // transaction; the facade performs no Record write itself.
      const linkUserAccounts = sinon.stub().resolves({
        data: {
          primaryUserId: 'primary-1',
          secondaryUserId: 'secondary-1',
          rolesAdopted: 1,
          rolesRetired: 1,
          recordsRewritten: 1,
          changed: true,
        },
        version: 1,
        auditEventId: 'event-1',
        requestId: 'link-req-1',
        changed: true,
      });
      (mockSails.services as any).roleadministrationservice = { linkUserAccounts };

      try {
        const result = await UsersService.linkAccounts('primary-1', 'secondary-1', 'admin-user', 'brand-1', {
          actorContext: fakeLinkActor,
          requestId: 'link-req-1',
        }).toPromise();

        expect(linkUserAccounts.calledOnce).to.be.true;
        expect(linkUserAccounts.firstCall.args[0]).to.include({
          brandId: 'brand-1',
          primaryUserId: 'primary-1',
          secondaryUserId: 'secondary-1',
          requestId: 'link-req-1',
        });
        expect(linkUserAccounts.firstCall.args[0]).to.not.have.property('recordsRewritten');
        // Canonical link state, tuple adoption, projection, and record
        // rewrites now commit inside the guarded writer, not here.
        expect(mockUserLink.create.called).to.be.false;
        expect(mockUser.replaceCollection.called).to.be.false;
        expect((global as any).RecordsService.mutateMetaInternal.called).to.be.false;
        expect(mockRecord.find.called).to.be.false;
        expect(result.impact?.rolesMerged).to.equal(1);
        expect(result.impact?.recordsRewritten).to.equal(1);
      } finally {
        delete (mockSails.services as any).roleadministrationservice;
      }
    });

    it('forwards CAS versions, confirmation token, and operation id, and exposes recordsPending', async function () {
      mockUser.findOne.onFirstCall().returns(
        createQueryObject({
          id: 'primary-1',
          username: 'primary-user',
          accountLinkState: 'active',
          roles: [{ id: 'role-primary', branding: 'brand-1' }],
        })
      );
      mockUser.findOne.onSecondCall().returns(
        createQueryObject({
          id: 'secondary-1',
          username: 'secondary-user',
          email: 'secondary@test.com',
          accountLinkState: 'active',
          roles: [{ id: 'role-secondary', name: 'Librarians', key: 'Librarians', branding: 'brand-1' }],
        })
      );
      configureModelMethod(mockUserLink.find, []);
      mockUser.find.onFirstCall().returns(createQueryObject([]));

      const linkUserAccounts = sinon.stub().resolves({
        data: {
          primaryUserId: 'primary-1',
          secondaryUserId: 'secondary-1',
          rolesAdopted: 0,
          rolesRetired: 0,
          recordsRewritten: 0,
          recordsPending: true,
          changed: true,
          linkOperationId: 'link-op-1',
        },
        version: 1,
        auditEventId: 'event-1',
        requestId: 'link-req-2',
        changed: true,
      });
      (mockSails.services as any).roleadministrationservice = { linkUserAccounts };

      try {
        const result = await UsersService.linkAccounts('primary-1', 'secondary-1', 'admin-user', 'brand-1', {
          actorContext: fakeLinkActor,
          requestId: 'link-req-2',
          primaryExpectedVersion: 3,
          secondaryExpectedVersion: 5,
          linkConfirmationToken: 'confirm-token-1',
          linkOperationId: 'link-op-1',
        }).toPromise();

        expect(linkUserAccounts.calledOnce).to.be.true;
        expect(linkUserAccounts.firstCall.args[0]).to.include({
          brandId: 'brand-1',
          primaryUserId: 'primary-1',
          secondaryUserId: 'secondary-1',
          requestId: 'link-req-2',
          primaryExpectedVersion: 3,
          secondaryExpectedVersion: 5,
          linkConfirmationToken: 'confirm-token-1',
          linkOperationId: 'link-op-1',
        });
        expect(result.recordsPending).to.equal(true);
        expect(result.linkOperationId).to.equal('link-op-1');
      } finally {
        delete (mockSails.services as any).roleadministrationservice;
      }
    });

    it('should surface guarded link failures without persisting a link locally', async function () {
      mockUser.findOne.onFirstCall().returns(
        createQueryObject({
          id: 'primary-2',
          username: 'other-primary',
          accountLinkState: 'active',
          roles: [{ id: 'role-primary', branding: 'brand-1' }],
        })
      );
      mockUser.findOne.onSecondCall().returns(
        createQueryObject({
          id: 'primary-1',
          username: 'current-primary',
          email: 'primary@test.com',
          accountLinkState: 'active',
          roles: [{ id: 'role-secondary', branding: 'brand-1' }],
        })
      );
      const linkUserAccounts = sinon.stub().rejects(new Error('Secondary user already has linked accounts'));
      (mockSails.services as any).roleadministrationservice = { linkUserAccounts };

      try {
        await UsersService.linkAccounts('primary-2', 'primary-1', 'admin-user', 'brand-1', {
          actorContext: fakeLinkActor,
        }).toPromise();
        expect.fail('Expected linkAccounts to throw');
      } catch (error) {
        expect((error as Error).message).to.equal('Secondary user already has linked accounts');
      } finally {
        delete (mockSails.services as any).roleadministrationservice;
      }

      expect(linkUserAccounts.calledOnce).to.be.true;
      expect(mockUserLink.create.called).to.be.false;
    });

    it('P5-G3 leaves record authorizations untouched when the guarded link fails', async function () {
      configureModelMethod(mockRecord.find, []);
      (global as any).RecordsService.mutateMetaInternal.resetHistory();
      mockUser.findOne.onFirstCall().returns(
        createQueryObject({
          id: 'primary-2',
          username: 'other-primary',
          accountLinkState: 'active',
          roles: [{ id: 'role-primary', branding: 'brand-1' }],
        })
      );
      mockUser.findOne.onSecondCall().returns(
        createQueryObject({
          id: 'primary-1',
          username: 'current-primary',
          email: 'primary@test.com',
          accountLinkState: 'active',
          roles: [{ id: 'role-secondary', branding: 'brand-1' }],
        })
      );
      const linkUserAccounts = sinon.stub().rejects(new Error('Secondary user already has linked accounts'));
      (mockSails.services as any).roleadministrationservice = { linkUserAccounts };

      try {
        await UsersService.linkAccounts('primary-2', 'primary-1', 'admin-user', 'brand-1', {
          actorContext: fakeLinkActor,
        }).toPromise();
        expect.fail('Expected linkAccounts to throw');
      } catch (error) {
        expect((error as Error).message).to.equal('Secondary user already has linked accounts');
      } finally {
        delete (mockSails.services as any).roleadministrationservice;
      }

      expect(linkUserAccounts.calledOnce).to.be.true;
      expect((global as any).RecordsService.mutateMetaInternal.called).to.be.false;
    });
  });

  describe('setUserKey', function () {
    it('should set user token when user exists', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [] };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockUser.update, [{ id: 'user-1', token: 'hashed' }]);

      const result = await UsersService.setUserKey('user-1', 'new-api-key', {
        actorContext: await buildTestBrandActor(['user.token.manage']),
        expectedVersion: 1,
        requestId: 'test-set-key-1',
      }).toPromise();

      expect(result).to.exist;
    });

    it('should handle empty uuid by setting empty token', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [] };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockUser.update, [{ id: 'user-1', token: '' }]);

      const result = await UsersService.setUserKey('user-1', '', {
        actorContext: await buildTestBrandActor(['user.token.manage']),
        expectedVersion: 1,
        requestId: 'test-set-key-2',
      }).toPromise();

      expect(result).to.exist;
    });

    it('rejects setUserKey with a user.manage actor lacking the proven token scope', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [] };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockUser.update, [{ id: 'user-1', token: 'hashed' }]);

      let code: string | undefined;
      try {
        await UsersService.setUserKey('user-1', 'new-api-key', {
          actorContext: await buildTestBrandActor(['user.manage']),
          expectedVersion: 1,
          requestId: 'test-set-key-scope',
        }).toPromise();
      } catch (error) {
        code = (error as { code?: string })?.code;
      }
      expect(code).to.equal('authorization.scope-denied');
    });
  });

  describe('updateUserDetails', function () {
    it('should update user name and email', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [] };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockUser.update, [{ id: 'user-1', name: 'New Name', email: 'new@email.com' }]);

      const result = await UsersService.updateUserDetails('user-1', 'New Name', 'new@email.com', null, {
        actorContext: await buildTestBrandActor(),
        expectedVersion: 1,
        requestId: 'test-update-details-1',
      }).toPromise();

      expect(result).to.exist;
    });

    it('should update password when provided', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [] };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockUser.update, [{ id: 'user-1', name: 'Name', password: 'hashedpw' }]);

      const result = await UsersService.updateUserDetails('user-1', 'Name', '', 'newpassword', {
        actorContext: await buildTestBrandActor(),
        expectedVersion: 1,
        requestId: 'test-update-details-2',
      }).toPromise();

      expect(result).to.exist;
    });
  });

  describe('updateUserRoles', function () {
    it('routes requested role changes through the assignment service instead of direct association writes', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [{ id: 'role-1', branding: 'brand-1' }] };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockRole.find, [
        {
          id: 'role-1',
          name: 'Researcher',
          key: 'Researcher',
          branding: 'brand-1',
          contextType: 'brand',
          protectedKind: 'none',
        },
        {
          id: 'role-2',
          name: 'Librarians',
          key: 'Librarians',
          branding: 'brand-1',
          contextType: 'brand',
          protectedKind: 'none',
        },
      ]);
      // P5-G4: the whole brand role-set applies through one atomic batch.
      const applyUserRoleSet = sinon
        .stub()
        .resolves({ data: { granted: 1 }, version: 1, auditEventId: 'audit-1', requestId: 'r1', changed: true });
      (mockSails.services as any).authorizationscopeservice = {
        getRegistry: () => ({ all: [{ key: 'authorization.assignment.manage' }] }),
      };
      (mockSails.services as any).roleadministrationservice = { applyUserRoleSet };
      // AUTH-ACTOR-001: request actor is required; no system fallback on request paths.
      const requestActor = await buildTestBrandActor(['authorization.assignment.manage']);
      const systemContext = sinon.stub(AuthorizationActorIssuer, 'createSystemProcessContextInternal');

      try {
        const result = await UsersService.updateUserRoles('user-1', ['role-1', 'role-2'], {
          brandId: 'brand-1',
          actorContext: requestActor as never,
          requestId: 'req-1',
          expectedVersion: 1,
        }).toPromise();

        expect(result).to.exist;
        expect(mockUser.replaceCollection.called).to.be.false;
        expect(applyUserRoleSet.calledOnce).to.be.true;
        expect(applyUserRoleSet.firstCall.args[0]).to.include({
          brandId: 'brand-1',
          principalId: 'user-1',
        });
        expect(applyUserRoleSet.firstCall.args[0].actor).to.equal(requestActor);
        expect(applyUserRoleSet.firstCall.args[0].grants).to.deep.equal([{ roleKey: 'Librarians' }]);
        expect(applyUserRoleSet.firstCall.args[0].removals).to.deep.equal([]);
        expect(systemContext.called).to.be.false;
      } finally {
        systemContext.restore();
        delete (mockSails.services as any).authorizationscopeservice;
        delete (mockSails.services as any).roleadministrationservice;
      }
    });

    it('rejects role-set writes without a caller-observed expectedVersion (mandatory CAS)', async function () {
      const user = {
        id: 'user-1',
        username: 'testuser',
        loginDisabledVersion: 3,
        roles: [{ id: 'role-1', branding: 'brand-1' }],
      };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockRole.find, [
        {
          id: 'role-1',
          name: 'Researcher',
          key: 'Researcher',
          branding: 'brand-1',
          contextType: 'brand',
          protectedKind: 'none',
        },
      ]);
      (mockSails.services as any).roleadministrationservice = {
        applyUserRoleSet: sinon.stub().resolves({ changed: false }),
      };
      const requestActor = await buildTestBrandActor(['authorization.assignment.manage']);

      try {
        await UsersService.updateUserRoles('user-1', ['role-1'], {
          brandId: 'brand-1',
          actorContext: requestActor as never,
          requestId: 'req-cas-missing',
        } as never).toPromise();
        expect.fail('Expected missing expectedVersion to throw');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('authorization.version-conflict');
      }
      try {
        await UsersService.updateUserRoles('user-1', ['role-1'], {
          brandId: 'brand-1',
          actorContext: requestActor as never,
          requestId: 'req-cas-stale',
          expectedVersion: 2,
        }).toPromise();
        expect.fail('Expected stale expectedVersion to throw');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('authorization.version-conflict');
      }
      expect(((mockSails.services as any).roleadministrationservice.applyUserRoleSet as sinon.SinonStub).called).to.be
        .false;
      delete (mockSails.services as any).roleadministrationservice;
    });

    it('rejects requested roles outside the caller brand and multi-brand batches', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [] };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockRole.find, [
        {
          id: 'role-1',
          name: 'Researcher',
          key: 'Researcher',
          branding: 'brand-1',
          contextType: 'brand',
          protectedKind: 'none',
        },
        {
          id: 'role-foreign',
          name: 'Admin',
          key: 'Admin',
          branding: 'brand-2',
          contextType: 'brand',
          protectedKind: 'none',
        },
      ]);

      try {
        await UsersService.updateUserRoles('user-1', ['role-foreign'], {
          brandId: 'brand-1',
          expectedVersion: 1,
        }).toPromise();
        expect.fail('Expected cross-brand role request to throw');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('authorization.invalid-role');
      }

      try {
        await UsersService.updateUserRoles('user-1', ['role-1', 'role-foreign'], {
          expectedVersion: 1,
        }).toPromise();
        expect.fail('Expected multi-brand role batch to throw');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('authorization.invalid-role');
      }
    });

    it('preserves foreign-brand assignments while updating active-brand roles through the guarded writer', async function () {
      const user = {
        id: 'user-1',
        username: 'testuser',
        roles: [
          { id: 'role-1', name: 'Researcher', key: 'Researcher', branding: 'brand-1' },
          { id: 'role-foreign', name: 'Admin', key: 'Admin', branding: 'brand-2' },
        ],
      };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockRole.find, [
        {
          id: 'role-2',
          name: 'Librarians',
          key: 'Librarians',
          branding: 'brand-1',
          contextType: 'brand',
          protectedKind: 'none',
        },
        {
          id: 'role-foreign',
          name: 'Admin',
          key: 'Admin',
          branding: 'brand-2',
          contextType: 'brand',
          protectedKind: 'none',
        },
      ]);
      const applyUserRoleSet = sinon
        .stub()
        .resolves({ data: { granted: 1 }, version: 1, auditEventId: 'audit-1', requestId: 'r1', changed: true });
      (mockSails.services as any).authorizationscopeservice = {
        getRegistry: () => ({ all: [{ key: 'authorization.assignment.manage' }] }),
      };
      (mockSails.services as any).roleadministrationservice = { applyUserRoleSet };
      const requestActor = await buildTestBrandActor(['authorization.assignment.manage']);
      const systemContext = sinon.stub(AuthorizationActorIssuer, 'createSystemProcessContextInternal');
      const previousRoleAssignment = Object.getOwnPropertyDescriptor(globalThis, 'RoleAssignment');
      Reflect.set(globalThis, 'RoleAssignment', {
        find: (criteria: Record<string, unknown>) => {
          // Only the removed role (role-1/Researcher) has a backing tuple;
          // the granted role (role-2/Librarians) has none.
          if (String(criteria.role ?? '') !== 'role-1') return createQueryObject([]);
          return createQueryObject([
            {
              id: 'assignment-active-1',
              principalType: 'user',
              principalId: 'user-1',
              role: criteria.role,
              source: 'manual',
              sourceKey: 'manual',
              status: 'active',
              version: 2,
            },
          ]);
        },
      });

      try {
        const result = await UsersService.updateUserRoles('user-1', ['role-foreign', 'role-2'], {
          brandId: 'brand-1',
          actorContext: requestActor as never,
          requestId: 'req-2',
          expectedVersion: 1,
        }).toPromise();

        expect(result).to.exist;
        expect(applyUserRoleSet.calledOnce).to.be.true;
        expect(applyUserRoleSet.firstCall.args[0]).to.include({ brandId: 'brand-1', principalId: 'user-1' });
        expect(applyUserRoleSet.firstCall.args[0].actor).to.equal(requestActor);
        expect(applyUserRoleSet.firstCall.args[0].grants).to.deep.equal([{ roleKey: 'Librarians' }]);
        expect(applyUserRoleSet.firstCall.args[0].removals).to.deep.equal([
          { roleKey: 'Researcher', source: 'manual', sourceKey: 'manual', expectedVersion: 2 },
        ]);
        expect(systemContext.called).to.be.false;
        expect(mockUser.replaceCollection.called).to.be.false;
      } finally {
        systemContext.restore();
        delete (mockSails.services as any).authorizationscopeservice;
        delete (mockSails.services as any).roleadministrationservice;
        if (previousRoleAssignment === undefined) Reflect.deleteProperty(globalThis, 'RoleAssignment');
        else Object.defineProperty(globalThis, 'RoleAssignment', previousRoleAssignment);
      }
    });

    it('rejects unheld foreign-brand role grants through a same-brand update', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [] };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockRole.find, [
        {
          id: 'role-foreign',
          name: 'Admin',
          key: 'Admin',
          branding: 'brand-2',
          contextType: 'brand',
          protectedKind: 'none',
        },
      ]);

      try {
        await UsersService.updateUserRoles('user-1', ['role-foreign'], {
          brandId: 'brand-1',
          expectedVersion: 1,
        }).toPromise();
        expect.fail('Expected unheld foreign role grant to throw');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('authorization.invalid-role');
      }
    });

    it('removes every source tuple behind a dropped role and suppresses external rows', async function () {
      const user = {
        id: 'user-1',
        username: 'testuser',
        roles: [{ id: 'role-2', name: 'Librarians', key: 'Librarians', branding: 'brand-1' }],
      };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockRole.find, [
        {
          id: 'role-1',
          name: 'Researcher',
          key: 'Researcher',
          branding: 'brand-1',
          contextType: 'brand',
          protectedKind: 'none',
        },
      ]);
      // P5-G4: removals for every source tuple go through one atomic batch.
      const applyUserRoleSet = sinon
        .stub()
        .resolves({ data: { granted: 1 }, version: 1, auditEventId: 'audit-1', requestId: 'r1', changed: true });
      (mockSails.services as any).authorizationscopeservice = {
        getRegistry: () => ({ all: [{ key: 'authorization.assignment.manage' }] }),
      };
      (mockSails.services as any).roleadministrationservice = { applyUserRoleSet };
      const requestActorMulti = await buildTestBrandActor(['authorization.assignment.manage']);
      const systemContext = sinon.stub(AuthorizationActorIssuer, 'createSystemProcessContextInternal');
      const previousRoleAssignment = Object.getOwnPropertyDescriptor(globalThis, 'RoleAssignment');
      Reflect.set(globalThis, 'RoleAssignment', {
        find: (criteria: Record<string, unknown>) => {
          // Only the dropped role (role-2/Librarians) has backing tuples;
          // the granted role (role-1/Researcher) has none, so its grant
          // carries no expectedVersion.
          if (String(criteria.role ?? '') !== 'role-2') return createQueryObject([]);
          return createQueryObject([
            {
              id: 'assignment-manual-1',
              principalType: 'user',
              principalId: 'user-1',
              role: criteria.role,
              source: 'manual',
              sourceKey: 'manual',
              status: 'active',
              version: 3,
            },
            {
              id: 'assignment-external-1',
              principalType: 'user',
              principalId: 'user-1',
              role: criteria.role,
              source: 'external',
              sourceKey: 'hr-provider',
              status: 'active',
              sourcePresent: true,
              version: 5,
            },
            {
              id: 'assignment-revoked-1',
              principalType: 'user',
              principalId: 'user-1',
              role: criteria.role,
              source: 'onboarding',
              sourceKey: 'oidc',
              status: 'revoked',
              version: 9,
            },
          ]);
        },
      });

      try {
        await UsersService.updateUserRoles('user-1', ['role-1'], {
          brandId: 'brand-1',
          actorContext: requestActorMulti as never,
          requestId: 'req-multi',
          expectedVersion: 1,
        }).toPromise();

        expect(applyUserRoleSet.calledOnce).to.be.true;
        expect(applyUserRoleSet.firstCall.args[0]).to.include({
          brandId: 'brand-1',
          principalId: 'user-1',
        });
        expect(applyUserRoleSet.firstCall.args[0].grants).to.deep.equal([{ roleKey: 'Researcher' }]);
        expect(applyUserRoleSet.firstCall.args[0].removals).to.deep.equal([
          { roleKey: 'Librarians', source: 'manual', sourceKey: 'manual', expectedVersion: 3 },
          { roleKey: 'Librarians', assignmentId: 'assignment-external-1', expectedVersion: 5 },
        ]);
      } finally {
        systemContext.restore();
        delete (mockSails.services as any).authorizationscopeservice;
        delete (mockSails.services as any).roleadministrationservice;
        if (previousRoleAssignment === undefined) Reflect.deleteProperty(globalThis, 'RoleAssignment');
        else Object.defineProperty(globalThis, 'RoleAssignment', previousRoleAssignment);
      }
    });

    it('P5-G4 surfaces mid-sequence batch failures without partial writes', async function () {
      const user = {
        id: 'user-1',
        username: 'testuser',
        roles: [{ id: 'role-2', name: 'Librarians', key: 'Librarians', branding: 'brand-1' }],
      };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockRole.find, [
        {
          id: 'role-1',
          name: 'Researcher',
          key: 'Researcher',
          branding: 'brand-1',
          contextType: 'brand',
          protectedKind: 'none',
        },
      ]);
      const applyUserRoleSet = sinon
        .stub()
        .rejects(Object.assign(new Error('The assignment changed.'), { code: 'authorization.version-conflict' }));
      (mockSails.services as any).authorizationscopeservice = {
        getRegistry: () => ({ all: [{ key: 'authorization.assignment.manage' }] }),
      };
      (mockSails.services as any).roleadministrationservice = { applyUserRoleSet };
      const requestActorFail = await buildTestBrandActor(['authorization.assignment.manage']);
      const systemContext = sinon.stub(AuthorizationActorIssuer, 'createSystemProcessContextInternal');
      const previousRoleAssignment = Object.getOwnPropertyDescriptor(globalThis, 'RoleAssignment');
      Reflect.set(globalThis, 'RoleAssignment', {
        find: () => createQueryObject([]),
      });

      try {
        await UsersService.updateUserRoles('user-1', ['role-1'], {
          brandId: 'brand-1',
          actorContext: requestActorFail as never,
          requestId: 'req-fail',
          expectedVersion: 1,
        }).toPromise();
        expect.fail('Expected batch conflict to throw');
      } catch (error) {
        expect((error as { code?: string }).code ?? (error as Error).message).to.not.equal(undefined);
      } finally {
        systemContext.restore();
        delete (mockSails.services as any).authorizationscopeservice;
        delete (mockSails.services as any).roleadministrationservice;
        if (previousRoleAssignment === undefined) Reflect.deleteProperty(globalThis, 'RoleAssignment');
        else Object.defineProperty(globalThis, 'RoleAssignment', previousRoleAssignment);
      }

      expect(applyUserRoleSet.calledOnce).to.be.true;
      expect(mockUser.replaceCollection.called).to.be.false;
    });

    it('rejects empty role requests and unknown roles', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [] };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockRole.find, []);

      try {
        await UsersService.updateUserRoles('user-1', [], { expectedVersion: 1 }).toPromise();
        expect.fail('Expected empty role request to throw');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('authorization.invalid-role');
      }

      try {
        await UsersService.updateUserRoles('user-1', ['role-unknown'], { expectedVersion: 1 }).toPromise();
        expect.fail('Expected unknown role to throw');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('authorization.invalid-role');
      }
    });

    it('rejects system and Guest roles through user management', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [] };
      configureModelMethod(mockUser.findOne, user);
      mockRole.find
        .onFirstCall()
        .returns(
          createQueryObject([
            { id: 'role-system', name: 'system-admin', contextType: 'system', protectedKind: 'system-admin' },
          ])
        );
      mockRole.find
        .onSecondCall()
        .returns(
          createQueryObject([
            { id: 'role-guest', name: 'Guest', branding: 'brand-1', contextType: 'brand', protectedKind: 'guest' },
          ])
        );

      try {
        await UsersService.updateUserRoles('user-1', ['role-system'], { expectedVersion: 1 }).toPromise();
        expect.fail('Expected system role assignment to throw');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('authorization.scope-denied');
      }

      try {
        await UsersService.updateUserRoles('user-1', ['role-guest'], { expectedVersion: 1 }).toPromise();
        expect.fail('Expected Guest assignment to throw');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('authorization.invalid-role');
      }
    });

    it('forwards the request actor, request id, and reason to the atomic role-set writer', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [{ id: 'role-1', branding: 'brand-1' }] };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockRole.find, [
        {
          id: 'role-1',
          name: 'Researcher',
          key: 'Researcher',
          branding: 'brand-1',
          contextType: 'brand',
          protectedKind: 'none',
        },
        {
          id: 'role-2',
          name: 'Librarians',
          key: 'Librarians',
          branding: 'brand-1',
          contextType: 'brand',
          protectedKind: 'none',
        },
      ]);
      const applyUserRoleSet = sinon
        .stub()
        .resolves({ data: { granted: 1 }, version: 1, auditEventId: 'audit-1', requestId: 'req-actor', changed: true });
      (mockSails.services as any).authorizationscopeservice = {
        getRegistry: () => ({ all: [{ key: 'authorization.assignment.manage' }] }),
      };
      (mockSails.services as any).roleadministrationservice = { applyUserRoleSet };
      const systemContext = sinon
        .stub(AuthorizationActorIssuer, 'createSystemProcessContextInternal')
        .resolves({ principal: { category: 'system-process' } } as never);
      const previousRoleAssignment = Object.getOwnPropertyDescriptor(globalThis, 'RoleAssignment');
      Reflect.set(globalThis, 'RoleAssignment', { find: () => createQueryObject([]) });
      const requestActor = await buildTestBrandActor(['authorization.assignment.manage']);

      try {
        await UsersService.updateUserRoles('user-1', ['role-1', 'role-2'], {
          brandId: 'brand-1',
          actorContext: requestActor as never,
          requestId: 'req-actor-1',
          reason: 'grant via request actor',
          expectedVersion: 1,
        }).toPromise();

        expect(applyUserRoleSet.calledOnce).to.be.true;
        // The exact request actor must reach the guarded writer so delegation,
        // audit, and quorum use the caller identity; no system fallback occurs.
        expect(applyUserRoleSet.firstCall.args[0].actor).to.equal(requestActor);
        expect(applyUserRoleSet.firstCall.args[0]).to.include({
          brandId: 'brand-1',
          principalId: 'user-1',
          requestId: 'req-actor-1',
          reason: 'grant via request actor',
        });
        expect(systemContext.called).to.be.false;
      } finally {
        systemContext.restore();
        delete (mockSails.services as any).authorizationscopeservice;
        delete (mockSails.services as any).roleadministrationservice;
        if (previousRoleAssignment === undefined) Reflect.deleteProperty(globalThis, 'RoleAssignment');
        else Object.defineProperty(globalThis, 'RoleAssignment', previousRoleAssignment);
      }
    });
  });

  describe('addLocalUser', function () {
    it('should create new local user', async function () {
      // First call for getUserWithUsername - returns null (user doesn't exist)
      mockUser.findOne.onFirstCall().returns(createQueryObject(null));
      // Second call for findUsersWithEmail - returns empty array
      configureModelMethod(mockUser.find, []);
      // Create returns new user
      configureModelMethod(mockUser.create, { id: 'user-new', username: 'newuser' });

      const result = await UsersService.addLocalUser('newuser', 'New User', 'new@email.com', 'password123', {
        actorContext: await buildTestBrandActor(),
        requestId: 'test-add-local-user-1',
      }).toPromise();

      expect(result).to.exist;
      expect(result.username).to.equal('newuser');
    });
  });

  describe('mutation actor fail-closed contracts', function () {
    it('rejects addLocalUser without an actor context', async function () {
      try {
        await UsersService.addLocalUser('newuser', 'New User', 'new@email.com', 'password123').toPromise();
        expect.fail('Expected omitted actor to fail closed');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('authorization.authentication-required');
      }
      expect(mockUser.create.called).to.be.false;
    });

    it('rejects updateUserDetails and setUserKey without an actor context', async function () {
      try {
        await UsersService.updateUserDetails('user-1', 'Name', 'a@test.com', null, {
          expectedVersion: 1,
        }).toPromise();
        expect.fail('Expected omitted actor to fail closed');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('authorization.authentication-required');
      }

      try {
        await UsersService.setUserKey('user-1', 'key', { expectedVersion: 1 }).toPromise();
        expect.fail('Expected omitted actor to fail closed');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('authorization.authentication-required');
      }
      expect(mockUser.update.called).to.be.false;
    });

    it('rejects a forged unfrozen plain-object actor', async function () {
      const forgedActor = {
        contextType: 'brand',
        principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'admin-1' },
        brand: { requestedIdentifier: 'brand-1', id: 'brand-1', name: 'Brand 1', exists: true, authorized: true },
        roles: [],
        compatibilityRoles: [],
        grantedScopeKeys: ['user.manage'],
        effectiveScopeKeys: ['user.manage'],
        scopeProvenance: [],
      };
      expect(Object.isFrozen(forgedActor)).to.be.false;

      try {
        await UsersService.addLocalUser('newuser', 'New User', 'new@email.com', 'password123', {
          actorContext: forgedActor as never,
          requestId: 'test-forged-actor',
        }).toPromise();
        expect.fail('Expected forged actor to fail closed');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('authorization.authentication-required');
      }
      expect(mockUser.create.called).to.be.false;
    });

    it('rejects an active FROZEN forgery without the server-issued capability (FORGED_FROZEN_ACTOR)', async function () {
      // The review probe: a caller freezes a structurally plausible object
      // via the PUBLIC freezer (or Object.freeze) but cannot mint the
      // module-private WeakSet capability. Must fail closed with 401.
      const forgedFrozen = freezeAuthorizationContext({
        contextType: 'brand',
        principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'attacker' },
        brand: { requestedIdentifier: 'brand-1', id: 'brand-1', name: 'Brand 1', exists: true, authorized: true },
        roles: [],
        compatibilityRoles: [],
        grantedScopeKeys: ['user.manage'] as never,
        effectiveScopeKeys: ['user.manage'] as never,
        scopeProvenance: [{ scopeKey: 'user.manage', roleIds: ['role-1'], roleKeys: ['researcher'] }] as never,
      });
      expect(Object.isFrozen(forgedFrozen)).to.be.true;

      try {
        await UsersService.addLocalUser('newuser', 'New User', 'new@email.com', 'password123', {
          actorContext: forgedFrozen as never,
          requestId: 'test-forged-frozen-actor',
        }).toPromise();
        expect.fail('Expected frozen forgery to fail closed (FORGED_FROZEN_ACTOR_ACCEPTED)');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('authorization.authentication-required');
      }
      expect(mockUser.create.called).to.be.false;
    });

    it('rejects a genuine actor whose scopes lack the required claim', async function () {
      // Provenance-free claims are impossible by construction (the resolver
      // always re-derives provenance and `authorization/context` exports no
      // minting capability), so the scope gate is proven with a genuine
      // actor that was never granted `user.manage`.
      const scopeMissing = await buildTestBrandActor(['user.account-link.manage']);
      try {
        await UsersService.addLocalUser('newuser', 'New User', 'new@email.com', 'password123', {
          actorContext: scopeMissing as never,
          requestId: 'test-scope-missing',
        }).toPromise();
        expect.fail('Expected scope-missing actor to fail closed');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('authorization.scope-denied');
      }
      expect(mockUser.create.called).to.be.false;
    });

    it('accepts a genuine canonical bearer principal (legacy-bearer category, bearer authMethod)', async function () {
      const bearerActor = await buildTestBearerActor(['user.manage']);
      expect(Object.isFrozen(bearerActor)).to.be.true;
      configureModelMethod(mockUser.findOne, { id: 'user-1', username: 'testuser', accountLinkState: 'active' });
      const setUserAccess = sinon.stub().resolves({ data: { disabled: true, changed: true }, version: 2 });
      (mockSails.services as any).roleadministrationservice = { setUserAccess };

      try {
        const result = await UsersService.disableUser('user-1', 'api-user-1', 'brand-1', {
          actorContext: bearerActor,
          expectedVersion: 1,
          requestId: 'test-bearer-disable-1',
        });

        expect(setUserAccess.calledOnce).to.be.true;
        expect(result.version).to.equal(2);
      } finally {
        delete (mockSails.services as any).roleadministrationservice;
      }
    });
  });

  describe('mapAdditionalAttributes (via protected method access)', function () {
    it('should map additional attributes from profile', function () {
      // Access the protected method through the service instance
      const profile = {
        department: 'IT',
        employeeId: '12345',
        customField: 'value',
      };
      const mappings = {
        department: 'dept',
        employeeId: 'empId',
      };

      // The mapAdditionalAttributes is protected, we can test it indirectly
      // or access it through the instance since TypeScript protection is compile-time only
      const result = (UsersService as any).mapAdditionalAttributes(profile, mappings);

      expect(result).to.have.property('department', 'IT');
      expect(result).to.have.property('employeeId', '12345');
    });
  });

  describe('trigger configuration checks', function () {
    it('hasPreSaveTriggerConfigured should return false when no hooks configured', function () {
      const config = {};

      const result = (UsersService as any).hasPreSaveTriggerConfigured(config, 'onUpdate');

      expect(result).to.be.false;
    });

    it('hasPreSaveTriggerConfigured should return true when valid hooks configured', function () {
      const config = {
        hooks: {
          onUpdate: {
            pre: [{ function: 'someFunction', options: {} }],
          },
        },
      };

      const result = (UsersService as any).hasPreSaveTriggerConfigured(config, 'onUpdate');

      expect(result).to.be.true;
    });

    it('hasPostSaveTriggerConfigured should return false when no hooks configured', function () {
      const config = {};

      const result = (UsersService as any).hasPostSaveTriggerConfigured(config, 'onUpdate');

      expect(result).to.be.false;
    });

    it('hasPostSaveTriggerConfigured should return true when valid hooks configured', function () {
      const config = {
        hooks: {
          onUpdate: {
            post: [{ function: 'someFunction', options: {} }],
          },
        },
      };

      const result = (UsersService as any).hasPostSaveTriggerConfigured(config, 'onUpdate');

      expect(result).to.be.true;
    });

    it('hasPostSaveSyncTriggerConfigured should return false when no hooks configured', function () {
      const config = {};

      const result = (UsersService as any).hasPostSaveSyncTriggerConfigured(config, 'onUpdate');

      expect(result).to.be.false;
    });

    it('hasPostSaveSyncTriggerConfigured should return true when valid hooks configured', function () {
      const config = {
        hooks: {
          onUpdate: {
            postSync: [{ function: 'someFunction', options: {} }],
          },
        },
      };

      const result = (UsersService as any).hasPostSaveSyncTriggerConfigured(config, 'onUpdate');

      expect(result).to.be.true;
    });
  });

  describe('checkAllTriggersSuccessOrFailure', function () {
    it('should return true when no additionalInfoFound', function () {
      const user = {};

      const result = (UsersService as any).checkAllTriggersSuccessOrFailure(user);

      expect(result).to.be.true;
    });

    it('should return true when all triggers succeed', function () {
      const user = {
        additionalInfoFound: [{ isSuccess: true }, { isSuccess: true }],
      };

      const result = (UsersService as any).checkAllTriggersSuccessOrFailure(user);

      expect(result).to.be.true;
    });

    it('should return false when any trigger fails', function () {
      const user = {
        additionalInfoFound: [{ isSuccess: true }, { isSuccess: false }],
      };

      const result = (UsersService as any).checkAllTriggersSuccessOrFailure(user);

      expect(result).to.be.false;
    });
  });

  describe('resolveHookResponse', function () {
    it('should resolve observable to promise', async function () {
      const observable = of({ result: 'success' });

      const result = await (UsersService as any).resolveHookResponse(observable);

      expect(result).to.deep.equal({ result: 'success' });
    });

    it('should return promise as-is for non-observable', async function () {
      const value = { result: 'direct' };

      const result = await (UsersService as any).resolveHookResponse(value);

      expect(result).to.deep.equal({ result: 'direct' });
    });
  });

  describe('triggerPostSaveTriggers', function () {
    it('should not throw when no hooks configured', function () {
      const user = { username: 'test' };
      const config = {};

      expect(() => {
        UsersService.triggerPostSaveTriggers(user, config, 'onUpdate');
      }).to.not.throw();
    });

    it('should execute hooks when configured', function () {
      const user = { username: 'test' };
      // Create a global function that the trigger can call
      (global as any).testTriggerFunction = sinon.stub().returns(Promise.resolve({ success: true }));

      const config = {
        hooks: {
          onUpdate: {
            post: [{ function: 'testTriggerFunction', options: { key: 'value' } }],
          },
        },
      };

      expect(() => {
        UsersService.triggerPostSaveTriggers(user, config, 'onUpdate');
      }).to.not.throw();

      delete (global as any).testTriggerFunction;
    });
  });

  describe('triggerPostSaveSyncTriggers', function () {
    it('should return response when no hooks configured', async function () {
      const user = { username: 'test' };
      const config = {};
      const response = { message: 'original' };

      const result = await UsersService.triggerPostSaveSyncTriggers(user, config, 'onUpdate', response);

      expect(result).to.deep.equal(response);
    });
  });

  describe('exports', function () {
    it('should export all public methods', function () {
      const exported = UsersService.exports();

      expect(exported).to.have.property('hasRole');
      expect(exported).to.have.property('bootstrap');
      expect(exported).to.have.property('updateUserRoles');
      expect(exported).to.have.property('updateUserDetails');
      expect(exported).to.have.property('updateUserDetailsForBrand');
      expect(exported).to.have.property('getUserWithId');
      expect(exported).to.have.property('getUserWithUsername');
      expect(exported).to.have.property('addLocalUser');
      expect(exported).to.have.property('setUserKey');
      expect(exported).to.have.property('findUsersWithName');
      expect(exported).to.have.property('findUsersWithEmail');
      expect(exported).to.have.property('findUsersWithQuery');
      // AUTH-P5-002: the old actor-less export name is gone; the lifecycle
      // helper is a registered internal capability attached by the exports()
      // override (production-mode coverage lives in UsersLifecycleLoader.test;
      // mocha export-everything mode intentionally exposes all methods).
      expect(exported).to.not.have.property('findAndAssignAccessToRecords');
      expect((UsersService as any).assignAccessToPendingRecordsForLifecycle).to.be.a('function');
      expect(exported).to.have.property('getUsers');
      expect(exported).to.have.property('getUsersForBrand');
      expect(exported).to.have.property('getUserForBrand');
      expect(exported).to.have.property('findUserForBrand');
      expect(exported).to.have.property('getEffectiveUser');
      expect(exported).to.have.property('getLinkedAccounts');
      expect(exported).to.have.property('getLinkedAccountsForBrand');
      expect(exported).to.have.property('searchLinkCandidates');
      expect(exported).to.have.property('linkAccounts');
      expect(exported).to.have.property('addUserAuditEvent');
      expect(exported).to.have.property('checkAuthorizedEmail');
      expect(exported).to.have.property('enrichUsersWithEffectiveDisabledState');
      expect(exported).to.have.property('disableUser');
      expect(exported).to.have.property('disableUserForBrand');
      expect(exported).to.have.property('enableUser');
      expect(exported).to.have.property('enableUserForBrand');
      expect(exported).to.have.property('getUserAudit');
      expect(exported).to.have.property('getUserAuditForBrand');
      expect(exported).to.have.property('setUserKeyForBrand');
    });
  });

  describe('getUserAudit', function () {
    it('should merge, deduplicate, sort, redact, and summarize audit rows for a selected user', async function () {
      configureModelMethod(mockUser.findOne, {
        id: 'user-1',
        username: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
      });
      mockUserAudit.find.onFirstCall().returns(
        createQueryObject([
          {
            id: 'audit-login-1',
            action: 'login',
            user: { id: 'user-1', username: 'testuser', name: 'Test User', email: 'test@example.com' },
            additionalContext: JSON.stringify({
              ip: '127.0.0.1',
              headers: {
                cookie: 'secret-cookie',
                authorization: 'Bearer secret',
                'x-forwarded-for': '10.0.0.1',
              },
              rawHeaders: [
                'Host',
                'localhost:1500',
                'Cookie',
                'secret-cookie',
                'Authorization',
                'Bearer secret',
                'X-Forwarded-For',
                '10.0.0.1',
              ],
              cookies: {
                lng: 'en',
                'redbox.sid': 'secret-session',
              },
              password: 'hidden',
            }),
            createdAt: '2026-03-27T10:00:00.000Z',
          },
          {
            id: 'audit-logout-1',
            action: 'logout',
            user: { id: 'someone-else', username: 'otheruser' },
            additionalContext: JSON.stringify({ ip: '127.0.0.2' }),
            createdAt: '2026-03-27T09:00:00.000Z',
          },
          {
            id: 'audit-shared',
            action: 'login',
            user: { id: 'user-1', username: 'testuser' },
            additionalContext: JSON.stringify({ ip: '127.0.0.3' }),
            createdAt: new Date('2026-03-27T08:00:00.000Z'),
          },
        ])
      );
      mockUserAudit.find.onSecondCall().returns(
        createQueryObject([
          {
            id: 'audit-disable-1',
            action: 'disable-user',
            user: { username: 'admin-user' },
            additionalContext: JSON.stringify({ userId: 'user-1', brandId: 'brand-1' }),
            createdAt: '2026-03-27T12:00:00.000Z',
          },
          {
            id: 'audit-enable-1',
            action: 'enable-user',
            user: { username: 'admin-user' },
            additionalContext: JSON.stringify({ userId: 'someone-else', brandId: 'brand-1' }),
            createdAt: '2026-03-27T11:00:00.000Z',
          },
          {
            id: 'audit-link-1',
            action: 'link-accounts',
            user: { username: 'admin-user' },
            additionalContext: JSON.stringify({ primaryUserId: 'user-1', secondaryUserId: 'alias-1' }),
            createdAt: '2026-03-27T13:00:00.000Z',
          },
          {
            id: 'audit-link-2',
            action: 'link-accounts',
            user: { username: 'admin-user' },
            additionalContext: '{"broken"',
            createdAt: '2026-03-27T07:00:00.000Z',
          },
          {
            id: 'audit-shared',
            action: 'disable-user',
            user: { username: 'admin-user' },
            additionalContext: JSON.stringify({ userId: 'user-1', brandId: 'brand-1' }),
            createdAt: '2026-03-27T08:30:00.000Z',
          },
        ])
      );

      const result = await UsersService.getUserAudit('user-1');

      expect(mockUserAudit.find.calledTwice).to.be.true;
      expect(mockUserAudit.find.firstCall.args[0]).to.deep.equal({
        action: ['login', 'logout'],
        or: [{ 'user.id': 'user-1' }, { 'user.username': 'testuser' }],
      });
      expect(mockUserAudit.find.secondCall.args[0]).to.deep.equal({
        action: ['disable-user', 'enable-user', 'link-accounts'],
        or: [
          {
            additionalContext: {
              contains: '"userId":"user-1"',
            },
          },
          {
            additionalContext: {
              contains: '"primaryUserId":"user-1"',
            },
          },
          {
            additionalContext: {
              contains: '"secondaryUserId":"user-1"',
            },
          },
        ],
      });
      expect(result.summary.returnedCount).to.equal(4);
      expect(result.summary.truncated).to.equal(false);
      expect(result.records.map((record: any) => record.id)).to.deep.equal([
        'audit-link-1',
        'audit-disable-1',
        'audit-login-1',
        'audit-shared',
      ]);
      expect(result.records[0].details).to.equal(
        'This account was chosen as the primary account during account linking'
      );
      expect(result.records[1].details).to.equal('Admin disabled this account');
      expect(result.records[2].details).to.equal('User logged in');
      expect(result.records[2].actor).to.deep.equal({
        username: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
      });
      expect(result.records[2].parsedAdditionalContext).to.deep.equal({
        ip: '127.0.0.1',
        headers: {
          cookie: '[REDACTED]',
          authorization: '[REDACTED]',
          'x-forwarded-for': '[REDACTED]',
        },
        rawHeaders: [
          'Host',
          'localhost:1500',
          'Cookie',
          '[REDACTED]',
          'Authorization',
          '[REDACTED]',
          'X-Forwarded-For',
          '[REDACTED]',
        ],
        cookies: {
          lng: '[REDACTED]',
          'redbox.sid': '[REDACTED]',
        },
        password: '[REDACTED]',
      });
      expect(result.records[2].rawAdditionalContext).to.equal(
        JSON.stringify({
          ip: '127.0.0.1',
          headers: {
            cookie: '[REDACTED]',
            authorization: '[REDACTED]',
            'x-forwarded-for': '[REDACTED]',
          },
          rawHeaders: [
            'Host',
            'localhost:1500',
            'Cookie',
            '[REDACTED]',
            'Authorization',
            '[REDACTED]',
            'X-Forwarded-For',
            '[REDACTED]',
          ],
          cookies: {
            lng: '[REDACTED]',
            'redbox.sid': '[REDACTED]',
          },
          password: '[REDACTED]',
        })
      );
    });

    it('should fall back to the generic link summary for malformed or unmatched link context', async function () {
      configureModelMethod(mockUser.findOne, { id: 'user-1', username: 'testuser' });
      mockUserAudit.find.onFirstCall().returns(createQueryObject([]));
      mockUserAudit.find.onSecondCall().returns(
        createQueryObject([
          {
            id: 'audit-link-1',
            action: 'link-accounts',
            user: { username: 'admin-user' },
            additionalContext: '{"broken"',
            createdAt: '2026-03-27T13:00:00.000Z',
          },
        ])
      );

      const result = await UsersService.getUserAudit('user-1');

      expect(result.records).to.deep.equal([]);
    });

    it('should truncate to the newest 100 rows', async function () {
      configureModelMethod(mockUser.findOne, { id: 'user-1', username: 'testuser' });
      const directRows = Array.from({ length: 101 }, (_unused, index) => ({
        id: `audit-${index}`,
        action: 'login',
        user: { id: 'user-1', username: 'testuser' },
        additionalContext: JSON.stringify({ ip: `127.0.0.${index}` }),
        createdAt: new Date(Date.UTC(2026, 2, 27, 0, 0, index)).toISOString(),
      }));
      mockUserAudit.find.onFirstCall().returns(createQueryObject(directRows));
      mockUserAudit.find.onSecondCall().returns(createQueryObject([]));

      const result = await UsersService.getUserAudit('user-1');

      expect(result.records).to.have.length(100);
      expect(result.summary.returnedCount).to.equal(100);
      expect(result.summary.truncated).to.equal(true);
      expect(result.records[0].id).to.equal('audit-100');
    });
  });

  describe('disableUser', function () {
    let fakeAccessActor: any;
    before(async function () {
      fakeAccessActor = await buildTestBrandActor(['user.manage']);
    });

    it('should route disable through the versioned guarded mutation', async function () {
      configureModelMethod(mockUser.findOne, { id: 'user-1', username: 'testuser', accountLinkState: 'active' });
      const setUserAccess = sinon.stub().resolves({ data: { disabled: true, changed: true }, version: 2 });
      (mockSails.services as any).roleadministrationservice = { setUserAccess };

      try {
        await UsersService.disableUser('user-1', 'admin', 'brand-1', {
          actorContext: fakeAccessActor,
          requestId: 'disable-req-1',
          expectedVersion: 1,
        });

        expect(setUserAccess.calledOnce).to.be.true;
        expect(setUserAccess.firstCall.args[0]).to.include({
          brandId: 'brand-1',
          userId: 'user-1',
          disabled: true,
          expectedVersion: 1,
          requestId: 'disable-req-1',
        });
        // The guarded writer owns the User and audit writes on its
        // transaction; this facade must not dual-write them directly.
        expect(mockUser.update.called).to.be.false;
        expect(mockUserAudit.create.called).to.be.false;
      } finally {
        delete (mockSails.services as any).roleadministrationservice;
      }
    });

    it('should reject disabling a linked alias user', async function () {
      configureModelMethod(mockUser.findOne, {
        id: 'alias-1',
        username: 'alias',
        accountLinkState: 'linked-alias',
        linkedPrimaryUserId: 'primary-1',
      });

      try {
        await UsersService.disableUser('alias-1', 'admin', 'brand-1', {
          actorContext: fakeAccessActor,
          expectedVersion: 1,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot disable a linked alias user');
      }
    });

    it('should reject disabling a non-existent user', async function () {
      configureModelMethod(mockUser.findOne, null);

      try {
        await UsersService.disableUser('no-such-user', 'admin', 'brand-1', {
          actorContext: fakeAccessActor,
          expectedVersion: 1,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('User not found');
      }
    });
  });

  describe('enableUser', function () {
    let fakeAccessActor: any;
    before(async function () {
      fakeAccessActor = await buildTestBrandActor(['user.manage']);
    });

    it('should route enable through the versioned guarded mutation', async function () {
      configureModelMethod(mockUser.findOne, { id: 'user-1', username: 'testuser', accountLinkState: 'active' });
      const setUserAccess = sinon.stub().resolves({ data: { disabled: false, changed: true }, version: 3 });
      (mockSails.services as any).roleadministrationservice = { setUserAccess };

      try {
        await UsersService.enableUser('user-1', 'admin', 'brand-1', {
          actorContext: fakeAccessActor,
          requestId: 'enable-req-1',
          expectedVersion: 2,
        });

        expect(setUserAccess.calledOnce).to.be.true;
        expect(setUserAccess.firstCall.args[0]).to.include({
          brandId: 'brand-1',
          userId: 'user-1',
          disabled: false,
          expectedVersion: 2,
          requestId: 'enable-req-1',
        });
        expect(mockUser.update.called).to.be.false;
        expect(mockUserAudit.create.called).to.be.false;
      } finally {
        delete (mockSails.services as any).roleadministrationservice;
      }
    });

    it('should reject enabling a linked alias user', async function () {
      configureModelMethod(mockUser.findOne, {
        id: 'alias-1',
        username: 'alias',
        accountLinkState: 'linked-alias',
        linkedPrimaryUserId: 'primary-1',
      });

      try {
        await UsersService.enableUser('alias-1', 'admin', 'brand-1', {
          actorContext: fakeAccessActor,
          expectedVersion: 1,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot enable a linked alias user');
      }
    });
  });

  describe('enrichUsersWithEffectiveDisabledState', function () {
    it('should mark directly disabled users', async function () {
      const users = [{ id: 'user-1', username: 'test', loginDisabled: true }] as any[];
      configureModelMethod(mockUser.find, []);

      const result = await UsersService.enrichUsersWithEffectiveDisabledState(users);

      expect(result[0].effectiveLoginDisabled).to.be.true;
    });

    it('should mark users disabled via primary', async function () {
      const users = [
        { id: 'alias-1', username: 'alias', loginDisabled: false, linkedPrimaryUserId: 'primary-1' },
      ] as any[];
      configureModelMethod(mockUser.find, [{ id: 'primary-1', username: 'primary-user', loginDisabled: true }]);

      const result = await UsersService.enrichUsersWithEffectiveDisabledState(users);

      expect(result[0].effectiveLoginDisabled).to.be.true;
      expect(result[0].disabledByPrimaryUserId).to.equal('primary-1');
      expect(result[0].disabledByPrimaryUsername).to.equal('primary-user');
    });

    it('should mark enabled users as not disabled', async function () {
      const users = [{ id: 'user-1', username: 'test', loginDisabled: false }] as any[];
      configureModelMethod(mockUser.find, []);

      const result = await UsersService.enrichUsersWithEffectiveDisabledState(users);

      expect(result[0].effectiveLoginDisabled).to.be.false;
    });
  });

  describe('AUTH-P5-002 guarded mutations', function () {
    it('pins the observed version into the update predicate (atomic CAS)', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [], loginDisabledVersion: 4 };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockUser.update, [{ id: 'user-1', name: 'New Name' }]);

      const result = await UsersService.updateUserDetails('user-1', 'New Name', 'new@email.com', null, {
        actorContext: await buildTestBrandActor(),
        expectedVersion: 4,
        requestId: 'test-cas-predicate',
      }).toPromise();

      expect(result).to.exist;
      expect(mockUser.update.calledOnce).to.be.true;
      expect(mockUser.update.firstCall.args[0]).to.deep.equal({ id: 'user-1', loginDisabledVersion: 4 });
    });

    it('heals legacy null versions into the predicate instead of blind id-only writes', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [] };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockUser.update, [{ id: 'user-1', token: 'hashed' }]);

      await UsersService.setUserKey('user-1', 'new-api-key', {
        actorContext: await buildTestBrandActor(['user.token.manage']),
        expectedVersion: 1,
        requestId: 'test-cas-heal',
      }).toPromise();

      expect(mockUser.update.calledOnce).to.be.true;
      expect(mockUser.update.firstCall.args[0]).to.deep.equal({
        id: 'user-1',
        or: [{ loginDisabledVersion: 1 }, { loginDisabledVersion: null }],
      });
    });

    it('fails closed on audit failure and compensates the created row', async function () {
      mockUser.findOne.onFirstCall().returns(createQueryObject(null));
      configureModelMethod(mockUser.find, []);
      configureModelMethod(mockUser.create, { id: 'user-new', username: 'newuser' });
      mockUserAudit.create.returns(createQueryObject(null, new Error('audit store down')));

      let code: string | undefined;
      try {
        await UsersService.addLocalUser('newuser', 'New User', 'new@email.com', 'password123', {
          actorContext: await buildTestBrandActor(),
          requestId: 'test-audit-fail-closed',
        }).toPromise();
        expect.fail('Expected audit failure to fail closed');
      } catch (error) {
        code = (error as { code?: string })?.code;
      }
      expect(code).to.equal('authorization.audit-unavailable');
      expect(mockUser.destroy.calledOnce).to.be.true;
      expect(mockUser.destroy.firstCall.args[0]).to.deep.equal({
        id: 'user-new',
        or: [{ loginDisabledVersion: 1 }, { loginDisabledVersion: null }],
      });
    });

    it('surfaces a failed create compensation instead of swallowing it', async function () {
      mockUser.findOne.onFirstCall().returns(createQueryObject(null));
      configureModelMethod(mockUser.find, []);
      configureModelMethod(mockUser.create, { id: 'user-new', username: 'newuser' });
      mockUserAudit.create.returns(createQueryObject(null, new Error('audit store down')));
      mockUser.destroy.returns(createQueryObject(null, new Error('destroy store down')));

      let error: any;
      try {
        await UsersService.addLocalUser('newuser', 'New User', 'new@email.com', 'password123', {
          actorContext: await buildTestBrandActor(),
          requestId: 'test-audit-compensation-failed',
        }).toPromise();
        expect.fail('Expected audit failure to fail closed');
      } catch (caught) {
        error = caught;
      }
      expect(error?.code).to.equal('authorization.audit-unavailable');
      expect((error?.details as { compensation?: string })?.compensation).to.equal('compensation-failed');
    });

    it('rejects profile and token mutations without a mandatory expectedVersion', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [], loginDisabledVersion: 4 };
      configureModelMethod(mockUser.findOne, user);

      for (const call of [
        async () =>
          UsersService.updateUserDetails('user-1', 'Name', 'a@test.com', null, {
            actorContext: await buildTestBrandActor(),
            requestId: 'test-mandatory-missing',
          } as never).toPromise(),
        async () =>
          UsersService.setUserKey('user-1', 'key', {
            actorContext: await buildTestBrandActor(['user.token.manage']),
            requestId: 'test-mandatory-missing',
          } as never).toPromise(),
      ]) {
        let code: string | undefined;
        try {
          await call();
          expect.fail('Expected omitted expectedVersion to fail closed');
        } catch (error) {
          code = (error as { code?: string })?.code;
        }
        expect(code).to.equal('authorization.version-conflict');
      }
      expect(mockUser.update.called).to.be.false;
    });

    it('advances the version atomically with the predicate and rejects zero-row CAS', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [], loginDisabledVersion: 4 };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockUser.update, [{ id: 'user-1', token: 'hashed', loginDisabledVersion: 5 }]);

      const result = await UsersService.setUserKey('user-1', 'new-api-key', {
        actorContext: await buildTestBrandActor(['user.token.manage']),
        expectedVersion: 4,
        requestId: 'test-cas-advance',
      }).toPromise();

      expect(result).to.exist;
      expect(mockUser.update.firstCall.args[0]).to.deep.equal({ id: 'user-1', loginDisabledVersion: 4 });
      const keyPayload = mockUser.update.firstCall.args[1] as { token?: unknown; loginDisabledVersion?: unknown };
      expect(typeof keyPayload.token).to.equal('string');
      expect((keyPayload.token as string).length).to.be.greaterThan(0);
      expect(keyPayload.loginDisabledVersion).to.equal(5);

      // A zero-row result is a lost race: 409 with no success audit.
      configureModelMethod(mockUser.update, []);
      mockUserAudit.create.resetHistory();
      let code: string | undefined;
      try {
        await UsersService.setUserKey('user-1', 'new-api-key', {
          actorContext: await buildTestBrandActor(['user.token.manage']),
          expectedVersion: 4,
          requestId: 'test-cas-zero-row',
        }).toPromise();
        expect.fail('Expected zero-row CAS to fail closed');
      } catch (error) {
        code = (error as { code?: string })?.code;
      }
      expect(code).to.equal('authorization.version-conflict');
      expect(mockUserAudit.create.called).to.be.false;
    });

    it('restores the prior profile best-effort when the update audit fails', async function () {
      const user = { id: 'user-1', username: 'testuser', name: 'Old', email: 'old@test.com', roles: [] };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockUser.update, [{ id: 'user-1', name: 'New' }]);
      mockUserAudit.create.returns(createQueryObject(null, new Error('audit store down')));

      let error: any;
      try {
        await UsersService.updateUserDetails('user-1', 'New', 'new@test.com', null, {
          actorContext: await buildTestBrandActor(),
          expectedVersion: 1,
          requestId: 'test-audit-restore',
        }).toPromise();
        expect.fail('Expected audit failure to fail closed');
      } catch (caught) {
        error = caught;
      }
      expect(error?.code).to.equal('authorization.audit-unavailable');
      expect((error?.details as { compensation?: string })?.compensation).to.equal('restored');
      // Mutation write + compensating restore write.
      expect(mockUser.update.callCount).to.equal(2);
      expect(mockUser.update.secondCall.args[1]).to.deep.equal({
        name: 'Old',
        email: 'old@test.com',
        loginDisabledVersion: 2,
      });
    });

    it('rejects pending-record discovery without a bounded limit capability', async function () {
      mockRecord.find.returns({ meta: () => createQueryObject([]) });

      let code: string | undefined;
      try {
        await UsersService.assignAccessToPendingRecordsForLifecycle('pending@test.com', 'user-1');
        expect.fail('Expected unbounded discovery to fail closed');
      } catch (error) {
        code = (error as { code?: string })?.code;
      }
      expect(code).to.equal('authorization.query-bound-exceeded');
    });

    it('rejects oversized pending-record discovery instead of unbounded fan-out', async function () {
      configureModelMethod(mockRecord.find, new Array(501).fill({ redboxOid: 'record-1' }));

      let code: string | undefined;
      try {
        await UsersService.assignAccessToPendingRecordsForLifecycle('pending@test.com', 'user-1');
        expect.fail('Expected oversized discovery to fail closed');
      } catch (error) {
        code = (error as { code?: string })?.code;
      }
      expect(code).to.equal('authorization.query-bound-exceeded');
      expect((global as any).RecordsService.provideUserAccessAndRemovePendingAccess.called).to.be.false;
    });
  });

  describe('AUTH-P5-007 exact-restore compensator', function () {
    it('restores empty email and null password hash verbatim with CAS and audit', async function () {
      const user = {
        id: 'user-1',
        username: 'testuser',
        roles: [{ id: 'role-1', branding: 'brand-1' }],
        loginDisabledVersion: 4,
        name: 'Changed',
        email: 'changed@test.com',
      };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockUser.update, [{ id: 'user-1', name: 'Old' }]);

      const result = await UsersService.compensateUserDetailsForBrand(
        'user-1',
        { name: 'Old', email: '', passwordHash: null },
        'brand-1',
        { actorContext: await buildTestBrandActor(), requestId: 'test-compensate-verbatim' }
      ).toPromise();

      expect(result).to.exist;
      expect(mockUser.update.calledOnce).to.be.true;
      // Version-pinned atomic predicate (CAS), never a blind id-only write.
      expect(mockUser.update.firstCall.args[0]).to.deep.equal({ id: 'user-1', loginDisabledVersion: 4 });
      // Every field restored verbatim, including empty-string email and null hash.
      expect(mockUser.update.firstCall.args[1]).to.deep.equal({
        loginDisabledVersion: 5,
        name: 'Old',
        email: '',
        password: null,
      });
      expect(mockUserAudit.create.calledOnce).to.be.true;
    });

    it('fails closed with version-conflict when the restore predicate matches nothing', async function () {
      const user = {
        id: 'user-1',
        username: 'testuser',
        roles: [{ id: 'role-1', branding: 'brand-1' }],
        loginDisabledVersion: 4,
      };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockUser.update, []);

      let code: string | undefined;
      try {
        await UsersService.compensateUserDetailsForBrand(
          'user-1',
          { name: 'Old', email: '', passwordHash: null },
          'brand-1',
          { actorContext: await buildTestBrandActor(), requestId: 'test-compensate-conflict' }
        ).toPromise();
        expect.fail('Expected restore conflict to fail closed');
      } catch (error) {
        code = (error as { code?: string })?.code;
      }
      expect(code).to.equal('authorization.version-conflict');
    });

    it('rejects compensation without a proven user.manage actor', async function () {
      let code: string | undefined;
      try {
        await UsersService.compensateUserDetailsForBrand('user-1', { name: 'Old' }, 'brand-1', {
          actorContext: await buildTestBrandActor(['user.token.manage']),
          requestId: 'test-compensate-scope',
        }).toPromise();
        expect.fail('Expected scope denial');
      } catch (error) {
        code = (error as { code?: string })?.code;
      }
      expect(code).to.equal('authorization.scope-denied');
      expect(mockUser.update.called).to.be.false;
    });
  });
});
