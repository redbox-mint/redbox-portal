let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { Services } from '../../src/services/PathRulesService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';
import { of } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { auth } from '../../src/config/auth.config';

describe('PathRulesService', function() {
  let service: Services.PathRules;
  let mockSails: any;

  beforeEach(function() {
    mockSails = createMockSails();
    mockSails.config.auth = {
      rules: [
        { role: 'admin', path: '/admin/*', can_read: true, can_update: true },
        { role: 'guest', path: '/public/*', can_read: true, can_update: false }
      ]
    };
    
    setupServiceTestGlobals(mockSails);
    
    const mockDeferred = (result: unknown) => ({
      exec: sinon.stub().yields(null, result)
    });

    (global as any).PathRule = {
      find: sinon.stub().returns(mockDeferred([])),
      create: sinon.stub().returns(mockDeferred({}))
    };

    (global as any).RolesService = {
      getRoleWithName: sinon.stub().returns({ id: 'role1' })
    };

    (global as any).BrandingService = {
      getDefault: sinon.stub().returns({ id: 'brand1', name: 'default' })
    };
    
    service = new Services.PathRules();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).PathRule;
    delete (global as any).RolesService;
    delete (global as any).BrandingService;
    sinon.restore();
  });

  describe('bootstrap', function() {
    it('should load existing rules', async function() {
      const existingRules = [{ id: 'rule1', path: '/foo' }];
      
      const findStub = sinon.stub().returns({
        populate: sinon.stub().returns({
          populate: sinon.stub().returns({
             exec: sinon.stub().yields(null, existingRules)
          })
        })
      });
      (global as any).PathRule.find = findStub;
      
      const result = await new Promise((resolve, reject) => {
        service.bootstrap(null, []).subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(existingRules);
    });

    it('should seed rules if missing', async function() {
      // First find returns empty, second find returns created rules
      const createdRules = [{ id: 'rule1', path: '/foo' }];
      
      const findStub = sinon.stub();
      findStub.onFirstCall().returns({
        populate: sinon.stub().returns({
          populate: sinon.stub().returns({
             exec: sinon.stub().yields(null, [])
          })
        })
      });
      findStub.onSecondCall().returns({
        populate: sinon.stub().returns({
          populate: sinon.stub().returns({
             exec: sinon.stub().yields(null, createdRules)
          })
        })
      });
      
      (global as any).PathRule.find = findStub;
      
      const createDeferred = (data: unknown) => ({
        exec: sinon.stub().yields(null, data)
      });
      (global as any).PathRule.create.callsFake((data: unknown) => createDeferred(data));
      
      const result = await new Promise((resolve, reject) => {
        service.bootstrap(null, []).subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(createdRules);
      expect((global as any).PathRule.create.calledTwice).to.be.true; // 2 rules in config
    });
  });

  describe('legacy Librarian metadata permission upgrade', function() {
    const brand = { id: 'brand1', name: 'default' };
    const librarian = { id: 'librarian', name: 'Librarians' };
    const researcher = { id: 'researcher', name: 'Researcher' };
    const metadataPath = '/:branding/:portal/recordmeta(/*)';
    let rows: any[];
    beforeEach(function() {
      mockSails.config.auth = structuredClone(auth);
      rows = [
        { path: '/:branding/:portal/record(/*)', branding: brand, role: librarian, can_update: true },
        { path: metadataPath, branding: brand, role: researcher, can_update: true },
      ];
      const query: any = { populate: () => query, exec: (callback: any) => callback(null, rows) };
      (global as any).PathRule.find = sinon.stub().returns(query);
      (global as any).PathRule.create = sinon.stub().callsFake((data: any) => ({ exec: (callback: any) => {
        const row = { ...data, branding: brand, role: librarian }; rows.push(row); callback(null, row);
      } }));
    });

    it('repairs the stock upgrade once and reloads authorization without changing existing rules', async function() {
      const before = structuredClone(rows);
      await firstValueFrom(service.bootstrap(null, [librarian, researcher]));
      await firstValueFrom(service.bootstrap(null, [librarian, researcher]));
      expect((global as any).PathRule.create.calledOnce).to.equal(true);
      expect((global as any).PathRule.create.firstCall.args[0]).to.deep.equal({ path: metadataPath, role: librarian.id, branding: brand.id, can_update: true });
      expect(rows.slice(0, 2)).to.deep.equal(before);
      const rules = service.getRulesFromPath('/default/rdmp/recordmeta/record-1', brand as any)!;
      expect(service.canWrite(rules, [librarian], brand.name)).to.equal(true);
      expect(service.canWrite(rules, [{ id: 'guest' }], brand.name)).to.equal(false);
    });

    for (const scenario of ['configured grant removed', 'configured grant disabled', 'configured record disabled', 'configured metadata restriction',
      'stored record disabled', 'stored metadata restriction', 'stored metadata custom', 'stored explicit denial', 'stored broad denial']) {
      it(`preserves ${scenario} without adding authorization`, async function() {
        const configured = mockSails.config.auth.rules;
        const grant = configured.find((rule: any) => rule.path === metadataPath && rule.role === 'Librarians');
        if (scenario === 'configured grant removed') configured.splice(configured.indexOf(grant), 1);
        if (scenario === 'configured grant disabled') grant.can_update = false;
        if (scenario === 'configured record disabled') configured.find((rule: any) => rule.path === '/:branding/:portal/record(/*)' && rule.role === 'Librarians').can_update = false;
        if (scenario === 'configured metadata restriction') configured.push({ path: '/:branding/:portal/recordmeta/restricted', role: 'Librarians', can_update: false });
        if (scenario === 'stored record disabled') rows[0].can_update = false;
        if (scenario === 'stored metadata restriction') rows.push({ path: '/:branding/:portal/recordmeta/restricted', branding: brand, role: researcher, can_update: true });
        if (scenario === 'stored metadata custom') rows[1].custom = 'operator policy';
        if (scenario === 'stored explicit denial') rows.push({ path: metadataPath, branding: brand, role: librarian, can_read: false, can_update: false });
        if (scenario === 'stored broad denial') rows.push({ path: '/:branding/:portal(/*)', branding: brand, role: librarian, can_read: false, can_update: false });
        const before = structuredClone(rows);
        await firstValueFrom(service.bootstrap(null, [librarian, researcher]));
        expect((global as any).PathRule.create.called).to.equal(false);
        expect(rows).to.deep.equal(before);
      });
    }
  });

  describe('getRulesFromPath', function() {
    beforeEach(async function() {
       // Load some rules into the service cache
       const rules = [
         { id: '1', path: '/admin/*', branding: { id: 'brand1' }, role: { id: 'admin' } },
         { id: '2', path: '/public/*', branding: { id: 'brand1' }, role: { id: 'guest' } },
         { id: '3', path: '/other/*', branding: { id: 'brand2' }, role: { id: 'guest' } }
       ];
       
       const findStub = sinon.stub().returns({
        populate: sinon.stub().returns({
          populate: sinon.stub().returns({
             exec: sinon.stub().yields(null, rules)
          })
        })
      });
      (global as any).PathRule.find = findStub;
      
      await new Promise((resolve) => service.loadRules().subscribe(resolve));
    });

    it('should return matching rules for brand', function() {
      const brand = { id: 'brand1' };
      const rules = service.getRulesFromPath('/admin/dashboard', brand as any);
      expect(rules).to.have.length(1);
      expect((rules as any[])[0].id).to.equal('1');
    });
    
    it('should not return matching rules for other brand', function() {
      const brand = { id: 'brand1' };
      const rules = service.getRulesFromPath('/other/foo', brand as any);
      // Rule 3 matches path but wrong brand
      expect(rules).to.be.null;
    });

    it('should return null if no match', function() {
      const brand = { id: 'brand1' };
      const rules = service.getRulesFromPath('/nomatch', brand as any);
      expect(rules).to.be.null;
    });
  });

  describe('canRead', function() {
    it('should return true if user has role with can_read=true', function() {
      const rules = [
        { can_read: true, can_update: false, role: { id: 'role1' }, branding: { name: 'brand1' } }
      ];
      const roles = [{ id: 'role1' }];
      const result = service.canRead(rules, roles, 'brand1');
      expect(result).to.be.true;
    });

    it('should return true if user has role with can_update=true', function() {
      const rules = [
        { can_read: false, can_update: true, role: { id: 'role1' }, branding: { name: 'brand1' } }
      ];
      const roles = [{ id: 'role1' }];
      const result = service.canRead(rules, roles, 'brand1');
      expect(result).to.be.true;
    });

    it('should return false if user does not have role', function() {
      const rules = [
        { can_read: true, can_update: false, role: { id: 'role1' }, branding: { name: 'brand1' } }
      ];
      const roles = [{ id: 'role2' }];
      const result = service.canRead(rules, roles, 'brand1');
      expect(result).to.be.false;
    });
    
    it('should return false if wrong branding', function() {
      const rules = [
        { can_read: true, can_update: false, role: { id: 'role1' }, branding: { name: 'brand1' } }
      ];
      const roles = [{ id: 'role1' }];
      const result = service.canRead(rules, roles, 'brand2');
      expect(result).to.be.false;
    });
  });

  describe('canWrite', function() {
    it('should return true if user has role with can_update=true', function() {
      const rules = [
        { can_read: true, can_update: true, role: { id: 'role1' }, branding: { name: 'brand1' } }
      ];
      const roles = [{ id: 'role1' }];
      const result = service.canWrite(rules, roles, 'brand1');
      expect(result).to.be.true;
    });

    it('should return false if user has role with can_update=false', function() {
      const rules = [
        { can_read: true, can_update: false, role: { id: 'role1' }, branding: { name: 'brand1' } }
      ];
      const roles = [{ id: 'role1' }];
      const result = service.canWrite(rules, roles, 'brand1');
      expect(result).to.be.false;
    });
  });

  describe('exports', function() {
    it('should export all public methods', function() {
      const exported = service.exports();
      expect(exported).to.have.property('bootstrap');
      expect(exported).to.have.property('getRulesFromPath');
      expect(exported).to.have.property('canRead');
      expect(exported).to.have.property('canWrite');
    });
  });
});
