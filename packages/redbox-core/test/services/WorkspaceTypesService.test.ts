let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails, createQueryObject } from './testHelper';

describe('WorkspaceTypesService', function() {
  let mockSails: any;
  let WorkspaceTypesService: any;
  let mockWorkspaceType: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        workspacetype: {
          gitlab: {
            name: 'gitlab',
            label: 'GitLab',
            subtitle: 'Git Repository',
            description: 'GitLab workspace for code repositories',
            logo: '/assets/images/gitlab.png',
            externallyProvisioned: true
          },
          omero: {
            name: 'omero',
            label: 'OMERO',
            subtitle: 'Image Repository',
            description: 'OMERO workspace for microscopy images',
            logo: '/assets/images/omero.png',
            externallyProvisioned: false
          }
        },
        workspacetype_services: []
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub()
      }
    });

    // Create mock model with proper query chain support
    mockWorkspaceType = {
      find: sinon.stub().returns(createQueryObject([])),
      findOne: sinon.stub().returns(createQueryObject(null)),
      create: sinon.stub().returns(createQueryObject({})),
      destroy: sinon.stub().returns(createQueryObject([]))
    };

    setupServiceTestGlobals(mockSails);
    (global as any).WorkspaceType = mockWorkspaceType;

    // Import after mocks are set up
    const { Services } = require('../../src/services/WorkspaceTypesService');
    WorkspaceTypesService = new Services.WorkspaceTypes();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).WorkspaceType;
    sinon.restore();
  });

  describe('bootstrap', function() {
    it('should destroy existing workspace types and create new ones', function(done) {
      const defBrand = { id: 'brand-1', name: 'default' };
      
      mockWorkspaceType.destroy.returns(createQueryObject([]));
      mockWorkspaceType.create.returns(createQueryObject({ id: 'wt-1' }));
      
      WorkspaceTypesService.bootstrap(defBrand).subscribe({
        next: (result: any) => {
          expect(mockWorkspaceType.destroy.calledOnce).to.be.true;
          expect(mockWorkspaceType.destroy.calledWith({ branding: 'brand-1' })).to.be.true;
          done();
        },
        error: done
      });
    });

    it('should handle empty workspace type configuration', function(done) {
      mockSails.config.workspacetype = {};
      const defBrand = { id: 'brand-1', name: 'default' };
      
      mockWorkspaceType.destroy.returns(createQueryObject([]));
      
      WorkspaceTypesService.bootstrap(defBrand).subscribe({
        next: (result: any) => {
          expect(mockWorkspaceType.create.called).to.be.false;
          done();
        },
        error: done
      });
    });
  });

  describe('create', function() {
    it('should create a workspace type with correct properties', function(done) {
      const brand = { id: 'brand-1', name: 'default' };
      const workspaceType = {
        name: 'test-workspace',
        label: 'Test Workspace',
        subtitle: 'Test subtitle',
        description: 'Test description',
        logo: '/assets/test.png',
        externallyProvisioned: true
      };
      
      mockWorkspaceType.create.returns(createQueryObject({
        id: 'wt-1',
        ...workspaceType,
        branding: 'brand-1'
      }));
      
      WorkspaceTypesService.create(brand, workspaceType).subscribe({
        next: (result: any) => {
          expect(mockWorkspaceType.create.calledOnce).to.be.true;
          
          const createArgs = mockWorkspaceType.create.firstCall.args[0];
          expect(createArgs.name).to.equal('test-workspace');
          expect(createArgs.label).to.equal('Test Workspace');
          expect(createArgs.branding).to.equal('brand-1');
          expect(createArgs.externallyProvisioned).to.be.true;
          done();
        },
        error: done
      });
    });
  });

  describe('get', function() {
    it('should return all workspace types for a brand', function(done) {
      const brand = { id: 'brand-1', name: 'default' };
      const mockWorkspaceTypes = [
        { id: 'wt-1', name: 'gitlab', branding: 'brand-1' },
        { id: 'wt-2', name: 'omero', branding: 'brand-1' }
      ];
      
      mockWorkspaceType.find.returns(createQueryObject(mockWorkspaceTypes));
      
      WorkspaceTypesService.get(brand).subscribe({
        next: (result: any) => {
          expect(mockWorkspaceType.find.calledOnce).to.be.true;
          expect(mockWorkspaceType.find.calledWith({ branding: 'brand-1' })).to.be.true;
          expect(result).to.deep.equal(mockWorkspaceTypes);
          done();
        },
        error: done
      });
    });

    it('should return empty array when no workspace types exist', function(done) {
      const brand = { id: 'brand-1', name: 'default' };
      
      mockWorkspaceType.find.returns(createQueryObject([]));
      
      WorkspaceTypesService.get(brand).subscribe({
        next: (result: any) => {
          expect(result).to.be.an('array').that.is.empty;
          done();
        },
        error: done
      });
    });
  });

  describe('getOne', function() {
    it('should return a specific workspace type by name', function(done) {
      const brand = { id: 'brand-1', name: 'default' };
      const mockWorkspaceTypeData = {
        id: 'wt-1',
        name: 'gitlab',
        label: 'GitLab',
        branding: 'brand-1'
      };
      
      mockWorkspaceType.findOne.returns(createQueryObject(mockWorkspaceTypeData));
      
      WorkspaceTypesService.getOne(brand, 'gitlab').subscribe({
        next: (result: any) => {
          expect(mockWorkspaceType.findOne.calledOnce).to.be.true;
          expect(mockWorkspaceType.findOne.calledWith({
            branding: 'brand-1',
            name: 'gitlab'
          })).to.be.true;
          expect(result).to.deep.equal(mockWorkspaceTypeData);
          done();
        },
        error: done
      });
    });

    it('should return null when workspace type not found', function(done) {
      const brand = { id: 'brand-1', name: 'default' };
      
      mockWorkspaceType.findOne.returns(createQueryObject(null));
      
      WorkspaceTypesService.getOne(brand, 'nonexistent').subscribe({
        next: (result: any) => {
          expect(result).to.be.null;
          done();
        },
        error: done
      });
    });
  });

  describe('exports', function() {
    it('should export all public methods', function() {
      const exported = WorkspaceTypesService.exports();
      
      expect(exported).to.have.property('bootstrap');
      expect(exported).to.have.property('create');
      expect(exported).to.have.property('get');
      expect(exported).to.have.property('getOne');
    });
  });
});
