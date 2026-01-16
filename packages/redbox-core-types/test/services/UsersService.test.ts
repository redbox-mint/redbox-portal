import { expect } from 'chai';
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('UsersService', function() {
  let mockSails: any;
  let UsersService: any;
  let mockUser: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        auth: {
          roles: [
            { name: 'Admin' },
            { name: 'Maintainer' },
            { name: 'Researcher' },
            { name: 'Guest' }
          ]
        }
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
      find: sinon.stub(),
      findOne: sinon.stub(),
      create: sinon.stub(),
      update: sinon.stub(),
      destroy: sinon.stub()
    };

    setupServiceTestGlobals(mockSails);
    (global as any).User = mockUser;
    (global as any).Role = {
      find: sinon.stub(),
      findOne: sinon.stub()
    };
    (global as any).RolesService = {
      getRoleByName: sinon.stub().returns({ id: 'role-1', name: 'Admin' }),
      getAdminFromBrand: sinon.stub().returns({ id: 'role-admin', name: 'Admin' })
    };
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      getDefault: sinon.stub().returns({ id: 'brand-1', name: 'default' })
    };
    (global as any).ConfigService = {
      getBrand: sinon.stub().returns({
        local: { usernameField: 'username', passwordField: 'password' }
      })
    };

    // Import after mocks are set up
    const { Services } = require('../../src/services/UsersService');
    UsersService = new Services.Users();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).User;
    delete (global as any).Role;
    delete (global as any).RolesService;
    delete (global as any).BrandingService;
    delete (global as any).ConfigService;
    sinon.restore();
  });

  describe('hasRole', function() {
    it('should return role object when user has the role', function() {
      const user = {
        roles: [{ id: 'role-1', name: 'Admin' }, { id: 'role-2', name: 'Researcher' }]
      };
      const targetRole = { id: 'role-1', name: 'Admin' };
      
      const result = UsersService.hasRole(user, targetRole);
      
      expect(result).to.deep.equal({ id: 'role-1', name: 'Admin' });
    });

    it('should return undefined when user does not have the role', function() {
      const user = {
        roles: [{ id: 'role-2', name: 'Researcher' }]
      };
      const targetRole = { id: 'role-1', name: 'Admin' };
      
      const result = UsersService.hasRole(user, targetRole);
      
      expect(result).to.be.undefined;
    });

    it('should return undefined for user with no roles', function() {
      const user = { roles: [] };
      const targetRole = { id: 'role-1', name: 'Admin' };
      
      const result = UsersService.hasRole(user, targetRole);
      
      expect(result).to.be.undefined;
    });
  });

  describe('exports', function() {
    it('should export all public methods', function() {
      const exported = UsersService.exports();

      expect(exported).to.have.property('hasRole');
      expect(exported).to.have.property('bootstrap');
      expect(exported).to.have.property('updateUserRoles');
      expect(exported).to.have.property('getUserWithId');
    });
  });
});
