import { expect } from 'chai';
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('RolesService', function() {
  let mockSails: any;
  let mockRole: any;
  let mockBrandingConfig: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        auth: {
          defaultBrand: 'default',
          roles: [
            { name: 'Admin' },
            { name: 'Maintainer' },
            { name: 'Researcher' },
            { name: 'Guest' }
          ],
          aaf: {
            defaultRole: 'Researcher'
          },
          defaultRole: 'Guest'
        }
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        error: sinon.stub()
      },
      services: {
        brandingservice: {
          getDefault: () => ({ id: '1', name: 'default' }),
          loadAvailableBrands: () => of({})
        }
      }
    });

    mockRole = {
      find: sinon.stub(),
      create: sinon.stub(),
      addToCollection: sinon.stub().returns({ members: sinon.stub() })
    };

    mockBrandingConfig = {
      addToCollection: sinon.stub().returns({ members: sinon.stub() })
    };

    setupServiceTestGlobals(mockSails);
    (global as any).Role = mockRole;
    (global as any).BrandingConfig = mockBrandingConfig;
    (global as any).ConfigService = {
      getBrand: sinon.stub().returns({
        aaf: { defaultRole: 'Researcher' },
        defaultRole: 'Guest'
      })
    };
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).Role;
    delete (global as any).BrandingConfig;
    delete (global as any).ConfigService;
    sinon.restore();
  });

  describe('getRoleWithName', function() {
    it('should find role by name in array', function() {
      const { Services } = require('../../src/services/RolesService');
      const rolesService = new Services.Roles();
      
      const roles = [
        { id: '1', name: 'Admin' },
        { id: '2', name: 'Researcher' }
      ];

      const result = rolesService.getRoleWithName(roles, 'Researcher');
      
      expect(result).to.deep.equal({ id: '2', name: 'Researcher' });
    });

    it('should return undefined when role not found', function() {
      const { Services } = require('../../src/services/RolesService');
      const rolesService = new Services.Roles();
      
      const roles = [
        { id: '1', name: 'Admin' }
      ];

      const result = rolesService.getRoleWithName(roles, 'NonExistent');
      
      expect(result).to.be.undefined;
    });
  });

  describe('getRole', function() {
    it('should get role from brand by name', function() {
      const { Services } = require('../../src/services/RolesService');
      const rolesService = new Services.Roles();
      
      const brand = {
        roles: [
          { id: '1', name: 'Admin' },
          { id: '2', name: 'Researcher' }
        ]
      };

      const result = rolesService.getRole(brand, 'Admin');
      
      expect(result).to.deep.equal({ id: '1', name: 'Admin' });
    });
  });

  describe('getAdmin', function() {
    it('should return admin role from brand', function() {
      const { Services } = require('../../src/services/RolesService');
      const rolesService = new Services.Roles();
      
      const brand = {
        roles: [
          { id: '1', name: 'Admin' },
          { id: '2', name: 'Researcher' }
        ]
      };

      const result = rolesService.getAdmin(brand);
      
      expect(result).to.deep.equal({ id: '1', name: 'Admin' });
    });
  });

  describe('getAdminFromRoles', function() {
    it('should return admin role from roles array', function() {
      const { Services } = require('../../src/services/RolesService');
      const rolesService = new Services.Roles();
      
      const roles = [
        { id: '1', name: 'Admin' },
        { id: '2', name: 'Researcher' }
      ];

      const result = rolesService.getAdminFromRoles(roles);
      
      expect(result).to.deep.equal({ id: '1', name: 'Admin' });
    });
  });

  describe('getRoleIds', function() {
    it('should return ids of matching roles', function() {
      const { Services } = require('../../src/services/RolesService');
      const rolesService = new Services.Roles();
      
      const roles = [
        { id: '1', name: 'Admin' },
        { id: '2', name: 'Researcher' },
        { id: '3', name: 'Guest' }
      ];

      const result = rolesService.getRoleIds(roles, ['Admin', 'Guest']);
      
      expect(result).to.deep.equal(['1', '3']);
    });

    it('should return empty array when no matches', function() {
      const { Services } = require('../../src/services/RolesService');
      const rolesService = new Services.Roles();
      
      const roles = [
        { id: '1', name: 'Admin' }
      ];

      const result = rolesService.getRoleIds(roles, ['NonExistent']);
      
      expect(result).to.deep.equal([]);
    });
  });

  describe('getNestedRoles', function() {
    it('should return all roles from Admin down', function() {
      const { Services } = require('../../src/services/RolesService');
      const rolesService = new Services.Roles();
      
      const brandRoles = [
        { id: '1', name: 'Admin' },
        { id: '2', name: 'Maintainer' },
        { id: '3', name: 'Researcher' },
        { id: '4', name: 'Guest' }
      ];

      const result = rolesService.getNestedRoles('Admin', brandRoles);
      
      expect(result).to.have.length(4);
      expect(result.map((r: any) => r.name)).to.include.members(['Admin', 'Maintainer', 'Researcher', 'Guest']);
    });

    it('should return Maintainer and below for Maintainer role', function() {
      const { Services } = require('../../src/services/RolesService');
      const rolesService = new Services.Roles();
      
      const brandRoles = [
        { id: '1', name: 'Admin' },
        { id: '2', name: 'Maintainer' },
        { id: '3', name: 'Researcher' },
        { id: '4', name: 'Guest' }
      ];

      const result = rolesService.getNestedRoles('Maintainer', brandRoles);
      
      expect(result).to.have.length(3);
      expect(result.map((r: any) => r.name)).to.include.members(['Maintainer', 'Researcher', 'Guest']);
    });

    it('should return only Guest for Guest role', function() {
      const { Services } = require('../../src/services/RolesService');
      const rolesService = new Services.Roles();
      
      const brandRoles = [
        { id: '1', name: 'Admin' },
        { id: '2', name: 'Maintainer' },
        { id: '3', name: 'Researcher' },
        { id: '4', name: 'Guest' }
      ];

      const result = rolesService.getNestedRoles('Guest', brandRoles);
      
      expect(result).to.have.length(1);
      expect(result[0].name).to.equal('Guest');
    });
  });

  describe('exports', function() {
    it('should export all public methods', function() {
      const { Services } = require('../../src/services/RolesService');
      const rolesService = new Services.Roles();
      const exported = rolesService.exports();

      expect(exported).to.have.property('bootstrap');
      expect(exported).to.have.property('getRole');
      expect(exported).to.have.property('getAdmin');
      expect(exported).to.have.property('getRoleIds');
      expect(exported).to.have.property('getRolesWithBrand');
      expect(exported).to.have.property('getAdminFromRoles');
      expect(exported).to.have.property('getRoleWithName');
      expect(exported).to.have.property('getRoleByName');
      expect(exported).to.have.property('getDefAuthenticatedRole');
      expect(exported).to.have.property('getDefUnathenticatedRole');
      expect(exported).to.have.property('getNestedRoles');
      expect(exported).to.have.property('createRoleWithBrand');
    });
  });
});
