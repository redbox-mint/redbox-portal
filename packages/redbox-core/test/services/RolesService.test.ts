let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails, createQueryObject } from './testHelper';
import { of } from 'rxjs';

describe('RolesService', function() {
  let mockSails: any;
  let RolesService: any;
  let mockRole: any;
  let mockBrandingConfig: any;

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

    mockRole = {
      find: sinon.stub().returns(createQueryObject([])),
      create: sinon.stub().returns(createQueryObject({ id: 'new-role' })),
      findOne: sinon.stub().returns(createQueryObject(null))
    };

    mockBrandingConfig = {
      addToCollection: sinon.stub().returns({
        members: sinon.stub().returns(createQueryObject({}))
      })
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
    (global as any).BrandingService = {
      getDefault: sinon.stub().returns({ id: 'brand-1' }),
      loadAvailableBrands: sinon.stub().returns(of([]))
    };

    const { Services } = require('../../src/services/RolesService');
    RolesService = new Services.Roles();
    
    // Inject brandingservice into sails.services for bootstrap
    mockSails.services.brandingservice = (global as any).BrandingService;
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).Role;
    delete (global as any).BrandingConfig;
    delete (global as any).ConfigService;
    delete (global as any).BrandingService;
    sinon.restore();
  });

  describe('getRoleWithName', function() {
    it('should find role by name', function() {
      const roles = [{ name: 'Admin' }, { name: 'Guest' }];
      const result = RolesService.getRoleWithName(roles, 'Admin');
      expect(result).to.deep.equal({ name: 'Admin' });
    });
  });

  describe('getRole', function() {
    it('should find role from brand', function() {
      const brand = { roles: [{ name: 'Admin' }] };
      const result = RolesService.getRole(brand, 'Admin');
      expect(result).to.deep.equal({ name: 'Admin' });
    });
  });

  describe('getRoleByName', function() {
    it('should find role by name using config', function() {
      const brand = { roles: [{ name: 'Admin' }] };
      const result = RolesService.getRoleByName(brand, 'Admin');
      expect(result).to.deep.equal({ name: 'Admin' });
    });
  });

  describe('getAdmin', function() {
    it('should return admin role', function() {
      const brand = { roles: [{ name: 'Admin' }] };
      const result = RolesService.getAdmin(brand);
      expect(result).to.deep.equal({ name: 'Admin' });
    });
  });

  describe('getAdminFromRoles', function() {
    it('should return admin from roles array', function() {
      const roles = [{ name: 'Admin' }];
      const result = RolesService.getAdminFromRoles(roles);
      expect(result).to.deep.equal({ name: 'Admin' });
    });
  });

  describe('getDefAuthenticatedRole', function() {
    it('should return default authenticated role', function() {
      const brand = { id: 'brand-1', name: 'default', roles: [{ name: 'Researcher' }] };
      const result = RolesService.getDefAuthenticatedRole(brand);
      expect(result.name).to.equal('Researcher');
    });
  });

  describe('getDefUnathenticatedRole', function() {
    it('should return default unauthenticated role', function() {
      const brand = { id: 'brand-1', name: 'default', roles: [{ name: 'Guest' }] };
      const result = RolesService.getDefUnathenticatedRole(brand);
      expect(result.name).to.equal('Guest');
    });
  });

  describe('getNestedRoles', function() {
    it('should return nested roles for Admin', function() {
      const brandRoles = [{ name: 'Admin' }, { name: 'Maintainer' }, { name: 'Researcher' }, { name: 'Guest' }];
      const result = RolesService.getNestedRoles('Admin', brandRoles);
      // Should include all 4
      expect(result).to.have.length(4);
    });

    it('should return nested roles for Researcher', function() {
      const brandRoles = [{ name: 'Admin' }, { name: 'Maintainer' }, { name: 'Researcher' }, { name: 'Guest' }];
      const result = RolesService.getNestedRoles('Researcher', brandRoles);
      // Researcher + Guest
      expect(result).to.have.length(2);
    });
  });

  describe('getRolesWithBrand', function() {
    it('should return observable of roles', async function() {
      const brand = { id: 'brand-1' };
      mockRole.find.returns(createQueryObject([{ id: 'role-1' }]));
      
      const result = await RolesService.getRolesWithBrand(brand).toPromise();
      
      expect(mockRole.find.calledWith({ branding: 'brand-1' })).to.be.true;
      expect(result).to.have.length(1);
    });
  });

  describe('getRoleIds', function() {
    it('should return ids of matching roles', function() {
      const fromRoles = [{ id: '1', name: 'Admin' }, { id: '2', name: 'Guest' }];
      const roleNames = ['Admin'];
      
      const result = RolesService.getRoleIds(fromRoles, roleNames);
      
      expect(result).to.deep.equal(['1']);
    });
  });

  describe('createRoleWithBrand', function() {
    it('should create role if not exists', async function() {
      const brand = { id: 'brand-1' };
      
      // getRolesWithBrand returns empty
      sinon.stub(RolesService, 'getRolesWithBrand').returns(of([]));
      
      mockRole.create.returns(createQueryObject({ id: 'new-role' }));
      mockBrandingConfig.addToCollection.returns({ members: sinon.stub().returns(createQueryObject({})) });
      
      await RolesService.createRoleWithBrand(brand, 'NewRole');
      
      expect(mockRole.create.called).to.be.true;
      expect(mockBrandingConfig.addToCollection.called).to.be.true;
    });

    it('should skip creation if role exists', async function() {
      const brand = { id: 'brand-1' };
      
      sinon.stub(RolesService, 'getRolesWithBrand').returns(of([{ name: 'ExistingRole' }]));
      
      await RolesService.createRoleWithBrand(brand, 'ExistingRole');
      
      expect(mockRole.create.called).to.be.false;
    });
  });

  describe('getConfigRoles', function() {
    it('should return config roles', function() {
      const result = (RolesService as any).getConfigRoles();
      expect(result).to.have.length(4);
    });

    it('should format roles with prop', function() {
      const result = (RolesService as any).getConfigRoles('role');
      expect(result[0]).to.have.property('role');
    });
  });

  describe('bootstrap', function() {
    it('should bootstrap roles if admin missing', async function() {
      const defBrand = { id: 'brand-1', roles: [] };
      sinon.stub(RolesService, 'getAdmin').returns(null);
      sinon.stub(RolesService, 'getConfigRoles').returns([{ name: 'Admin' }]);
      mockRole.create.returns(createQueryObject({ id: 'role-admin' }));
      
      await RolesService.bootstrap(defBrand).toPromise();
      
      expect(mockRole.create.called).to.be.true;
    });

    it('should skip bootstrap if admin exists', async function() {
      const defBrand = { id: 'brand-1', roles: [{ name: 'Admin' }] };
      sinon.stub(RolesService, 'getAdmin').returns({ name: 'Admin' });
      
      await RolesService.bootstrap(defBrand).toPromise();
      
      expect(mockRole.create.called).to.be.false;
    });
  });
  
  describe('exports', function() {
    it('should export all public methods', function() {
      const exported = RolesService.exports();
      
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
