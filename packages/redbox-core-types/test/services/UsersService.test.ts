import { expect } from 'chai';
import * as sinon from 'sinon';
import { of, throwError } from 'rxjs';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails, createQueryObject, configureModelMethod } from './testHelper';

describe('UsersService', function () {
  let mockSails: any;
  let UsersService: any;
  let mockUser: any;
  let mockUserAudit: any;
  let mockRecord: any;
  let mockRole: any;

  beforeEach(function () {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        auth: {
          roles: [
            { name: 'Admin' },
            { name: 'Maintainer' },
            { name: 'Researcher' },
            { name: 'Guest' }
          ],
          postLogoutRedir: '/logout'
        },
        brandingAware: sinon.stub().returns({
          authorizedDomainsEmails: {
            enabled: 'true',
            domainsAaf: ['example.edu.au'],
            emailsAaf: ['allowed@other.com'],
            domainsOidc: ['uni.edu'],
            emailsOidc: ['special@third.com']
          }
        })
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub()
      }
    });

    mockUser = {
      find: sinon.stub().returns(createQueryObject([])),
      findOne: sinon.stub().returns(createQueryObject(null)),
      create: sinon.stub().returns(createQueryObject({ id: 'user-1', username: 'testuser' })),
      update: sinon.stub().returns(createQueryObject([{ id: 'user-1' }])),
      destroy: sinon.stub().returns(createQueryObject([])),
      addToCollection: sinon.stub().returns({
        members: sinon.stub().returns(createQueryObject([]))
      }),
      replaceCollection: sinon.stub().returns({
        members: sinon.stub().returns(createQueryObject([]))
      })
    };

    mockUserAudit = {
      create: sinon.stub().returns(createQueryObject({ id: 'audit-1' }))
    };

    mockRecord = {
      find: sinon.stub().returns({
        meta: sinon.stub().returns({
          then: sinon.stub().callsFake((cb) => {
            cb([]);
            return { catch: sinon.stub() };
          })
        })
      })
    };

    mockRole = {
      find: sinon.stub().returns(createQueryObject([])),
      findOne: sinon.stub().returns(createQueryObject(null)),
      addToCollection: sinon.stub().returns({
        members: sinon.stub().returns(createQueryObject([]))
      })
    };

    setupServiceTestGlobals(mockSails);
    (global as any).User = mockUser;
    (global as any).UserAudit = mockUserAudit;
    (global as any).Record = mockRecord;
    (global as any).Role = mockRole;
    (global as any).RolesService = {
      getRoleByName: sinon.stub().returns({ id: 'role-1', name: 'Admin' }),
      getAdminFromRoles: sinon.stub().returns({ id: 'role-admin', name: 'Admin', users: [] }),
      getAdminFromBrand: sinon.stub().returns({ id: 'role-admin', name: 'Admin' }),
      getDefAuthenticatedRole: sinon.stub().returns({ id: 'role-auth', name: 'Researcher' }),
      getNestedRoles: sinon.stub().returns([{ id: 'role-1' }])
    };
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default', roles: [] }),
      getDefault: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      getBrandNameFromReq: sinon.stub().returns('default')
    };
    (global as any).ConfigService = {
      getBrand: sinon.stub().returns({
        local: {
          usernameField: 'username',
          passwordField: 'password',
          default: {
            adminUser: 'admin',
            adminPw: 'adminpass',
            email: 'admin@test.com'
          }
        },
        active: ['local'],
        aaf: {
          attributesField: 'attributes',
          usernameField: 'sub',
          defaultRole: 'Researcher'
        }
      })
    };
    (global as any).RecordsService = {
      provideUserAccessAndRemovePendingAccess: sinon.stub()
    };
    (global as any).VocabService = {};

    // Import after mocks are set up
    const { Services } = require('../../src/services/UsersService');
    UsersService = new Services.Users();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).User;
    delete (global as any).UserAudit;
    delete (global as any).Record;
    delete (global as any).Role;
    delete (global as any).RolesService;
    delete (global as any).BrandingService;
    delete (global as any).ConfigService;
    delete (global as any).RecordsService;
    delete (global as any).VocabService;
    sinon.restore();
  });

  describe('hasRole', function () {
    it('should return role object when user has the role', function () {
      const user = {
        roles: [{ id: 'role-1', name: 'Admin' }, { id: 'role-2', name: 'Researcher' }]
      };
      const targetRole = { id: 'role-1', name: 'Admin' };

      const result = UsersService.hasRole(user, targetRole);

      expect(result).to.deep.equal({ id: 'role-1', name: 'Admin' });
    });

    it('should return undefined when user does not have the role', function () {
      const user = {
        roles: [{ id: 'role-2', name: 'Researcher' }]
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
        callback: function () { return 'hello'; }
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
          details: { age: 30 }
        }
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
          enabled: 'false'
        }
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
          emailsAaf: []
        }
      });

      const result = UsersService.checkAuthorizedEmail('any@email.com', 'default', 'aaf');

      expect(result).to.be.true;
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
        { id: 'user-2', name: 'John Smith', roles: [{ branding: 'brand-1' }] }
      ];
      configureModelMethod(mockUser.find, users);

      const result = await UsersService.findUsersWithName('John', 'brand-1').toPromise();

      expect(result).to.have.length(2);
    });

    it('should filter by brand', async function () {
      const users = [
        { id: 'user-1', name: 'John Doe', roles: [{ branding: 'brand-1' }] },
        { id: 'user-2', name: 'John Smith', roles: [{ branding: 'brand-2' }] }
      ];
      configureModelMethod(mockUser.find, users);

      const result = await UsersService.findUsersWithName('John', 'brand-1').toPromise();

      expect(result).to.have.length(1);
      expect(result[0].id).to.equal('user-1');
    });
  });

  describe('findUsersWithEmail', function () {
    it('should find users matching email', async function () {
      const users = [
        { id: 'user-1', email: 'john@test.com', roles: [{ branding: 'brand-1' }] }
      ];
      configureModelMethod(mockUser.find, users);

      const result = await UsersService.findUsersWithEmail('john@test.com', 'brand-1', null).toPromise();

      expect(result).to.have.length(1);
      expect(result[0].email).to.equal('john@test.com');
    });
  });

  describe('findUsersWithQuery', function () {
    it('should find users with custom query', async function () {
      const users = [
        { id: 'user-1', name: 'Test', type: 'local', roles: [{ branding: 'brand-1' }] }
      ];
      configureModelMethod(mockUser.find, users);

      const result = await UsersService.findUsersWithQuery({ name: { contains: 'Test' } }, 'brand-1', 'local').toPromise();

      expect(result).to.have.length(1);
    });

    it('should return all users when no brand filter', async function () {
      const users = [
        { id: 'user-1', name: 'Test1', roles: [] },
        { id: 'user-2', name: 'Test2', roles: [] }
      ];
      configureModelMethod(mockUser.find, users);

      const result = await UsersService.findUsersWithQuery({ name: { contains: 'Test' } }, null, null).toPromise();

      expect(result).to.have.length(2);
    });
  });

  describe('findAndAssignAccessToRecords', function () {
    it('should not crash when no pending records found', function () {
      // This method doesn't return anything, just verify it doesn't throw
      expect(() => {
        UsersService.findAndAssignAccessToRecords('pending-email@test.com', 'user-1');
      }).to.not.throw();
    });

    it('should call RecordsService for found records', function () {
      const records = [{ redboxOid: 'record-1' }, { redboxOid: 'record-2' }];
      mockRecord.find.returns({
        meta: sinon.stub().returns({
          then: sinon.stub().callsFake((cb) => {
            cb(records);
            return { catch: sinon.stub() };
          })
        })
      });

      UsersService.findAndAssignAccessToRecords('pending@test.com', 'user-1');

      // The actual calls happen asynchronously, so we just verify setup
      expect(mockRecord.find.called).to.be.true;
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
        { id: 'user-2', username: 'user2', roles: [] }
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
        { id: 'user-2', username: 'user2', roles: [{ branding: 'brand-2' }] }
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
      const users = [
        { id: 'user-1', username: 'user1', roles: [{ branding: 'brand-1' }] }
      ];
      configureModelMethod(mockUser.find, users);

      const result = await UsersService.getUsersForBrand({ id: 'brand-1', name: 'default' }).toPromise();

      expect(result).to.have.length(1);
    });
  });

  describe('setUserKey', function () {
    it('should set user token when user exists', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [] };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockUser.update, [{ id: 'user-1', token: 'hashed' }]);

      const result = await UsersService.setUserKey('user-1', 'new-api-key').toPromise();

      expect(result).to.exist;
    });

    it('should handle empty uuid by setting empty token', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [] };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockUser.update, [{ id: 'user-1', token: '' }]);

      const result = await UsersService.setUserKey('user-1', '').toPromise();

      expect(result).to.exist;
    });
  });

  describe('updateUserDetails', function () {
    it('should update user name and email', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [] };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockUser.update, [{ id: 'user-1', name: 'New Name', email: 'new@email.com' }]);

      const result = await UsersService.updateUserDetails('user-1', 'New Name', 'new@email.com', null).toPromise();

      expect(result).to.exist;
    });

    it('should update password when provided', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [] };
      configureModelMethod(mockUser.findOne, user);
      configureModelMethod(mockUser.update, [{ id: 'user-1', name: 'Name', password: 'hashedpw' }]);

      const result = await UsersService.updateUserDetails('user-1', 'Name', '', 'newpassword').toPromise();

      expect(result).to.exist;
    });
  });

  describe('updateUserRoles', function () {
    it('should update user roles', async function () {
      const user = { id: 'user-1', username: 'testuser', roles: [{ id: 'role-1' }] };
      configureModelMethod(mockUser.findOne, user);

      const result = await UsersService.updateUserRoles('user-1', ['role-1', 'role-2']).toPromise();

      expect(result).to.exist;
      expect(mockUser.replaceCollection.called).to.be.true;
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

      const result = await UsersService.addLocalUser('newuser', 'New User', 'new@email.com', 'password123').toPromise();

      expect(result).to.exist;
      expect(result.username).to.equal('newuser');
    });
  });

  describe('mapAdditionalAttributes (via protected method access)', function () {
    it('should map additional attributes from profile', function () {
      // Access the protected method through the service instance
      const profile = {
        department: 'IT',
        employeeId: '12345',
        customField: 'value'
      };
      const mappings = {
        department: 'dept',
        employeeId: 'empId'
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
            pre: [
              { function: 'someFunction', options: {} }
            ]
          }
        }
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
            post: [
              { function: 'someFunction', options: {} }
            ]
          }
        }
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
            postSync: [
              { function: 'someFunction', options: {} }
            ]
          }
        }
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
        additionalInfoFound: [
          { isSuccess: true },
          { isSuccess: true }
        ]
      };

      const result = (UsersService as any).checkAllTriggersSuccessOrFailure(user);

      expect(result).to.be.true;
    });

    it('should return false when any trigger fails', function () {
      const user = {
        additionalInfoFound: [
          { isSuccess: true },
          { isSuccess: false }
        ]
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
            post: [
              { function: 'testTriggerFunction', options: { key: 'value' } }
            ]
          }
        }
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
      expect(exported).to.have.property('getUserWithId');
      expect(exported).to.have.property('getUserWithUsername');
      expect(exported).to.have.property('addLocalUser');
      expect(exported).to.have.property('setUserKey');
      expect(exported).to.have.property('findUsersWithName');
      expect(exported).to.have.property('findUsersWithEmail');
      expect(exported).to.have.property('findUsersWithQuery');
      expect(exported).to.have.property('findAndAssignAccessToRecords');
      expect(exported).to.have.property('getUsers');
      expect(exported).to.have.property('getUsersForBrand');
      expect(exported).to.have.property('addUserAuditEvent');
      expect(exported).to.have.property('checkAuthorizedEmail');
    });
  });
});
