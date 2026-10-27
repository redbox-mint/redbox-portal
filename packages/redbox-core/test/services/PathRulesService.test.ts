import { expect } from 'chai';
import * as sinon from 'sinon';
import { PathRules } from '../../src/authorization/PathRules';
import { bootstrapPathRules } from '../../src/identity/bootstrap';

describe('PathRulesService', function () {
  let service: PathRules;
  let read: sinon.SinonStub;
  const rules = [
    { role: 'admin', path: '/admin/*', can_read: true, can_update: true },
    { role: 'guest', path: '/public/*', can_read: true, can_update: false },
  ];
  beforeEach(function () {
    read = sinon.stub().resolves([]);
    service = new PathRules(() => read());
  });
  afterEach(() => sinon.restore());
  async function bootstrap(create: sinon.SinonStub) {
    await bootstrapPathRules({
      repository: { create },
      brandId: 'brand1',
      rules,
      readRules: () => read(),
      roleId: name => (name === 'admin' ? 'admin-id' : 'guest-id'),
    });
    return service.loadRules();
  }
  describe('bootstrap', function () {
    it('should load existing rules', async function () {
      const existingRules = [{ id: 'rule1', path: '/foo' }];
      read.resolves(existingRules);
      const create = sinon.stub().resolves({});
      expect(await bootstrap(create)).to.deep.equal(existingRules);
      sinon.assert.notCalled(create);
    });
    it('should seed rules if missing', async function () {
      const createdRules = [{ id: 'rule1', path: '/foo' }];
      read.onFirstCall().resolves([]);
      read.onSecondCall().resolves(createdRules);
      const create = sinon.stub().resolves({});
      expect(await bootstrap(create)).to.deep.equal(createdRules);
      sinon.assert.calledTwice(create);
      expect(create.firstCall.args).to.deep.equal(['pathrule', { ...rules[0], role: 'admin-id', branding: 'brand1' }]);
      expect(create.secondCall.args).to.deep.equal(['pathrule', { ...rules[1], role: 'guest-id', branding: 'brand1' }]);
    });
  });
  describe('getRulesFromPath', function () {
    beforeEach(async function () {
      read.resolves([
        { id: '1', path: '/admin/*', branding: { id: 'brand1' }, role: { id: 'admin' } },
        { id: '2', path: '/public/*', branding: { id: 'brand1' }, role: { id: 'guest' } },
        { id: '3', path: '/other/*', branding: { id: 'brand2' }, role: { id: 'guest' } },
      ]);
      await service.loadRules();
    });
    it('should return matching rules for brand', function () {
      const brand = { id: 'brand1' };
      const rules = service.getRulesFromPath('/admin/dashboard', brand as any);
      expect(rules).to.have.length(1);
      expect((rules as any[])[0].id).to.equal('1');
    });

    it('should not return matching rules for other brand', function () {
      const brand = { id: 'brand1' };
      const rules = service.getRulesFromPath('/other/foo', brand as any);
      // Rule 3 matches path but wrong brand
      expect(rules).to.be.null;
    });

    it('should return null if no match', function () {
      const brand = { id: 'brand1' };
      const rules = service.getRulesFromPath('/nomatch', brand as any);
      expect(rules).to.be.null;
    });
  });

  describe('canRead', function () {
    it('should return true if user has role with can_read=true', function () {
      const rules = [{ can_read: true, can_update: false, role: { id: 'role1' }, branding: { name: 'brand1' } }];
      const roles = [{ id: 'role1' }];
      const result = service.canRead(rules, roles, 'brand1');
      expect(result).to.be.true;
    });

    it('should return true if user has role with can_update=true', function () {
      const rules = [{ can_read: false, can_update: true, role: { id: 'role1' }, branding: { name: 'brand1' } }];
      const roles = [{ id: 'role1' }];
      const result = service.canRead(rules, roles, 'brand1');
      expect(result).to.be.true;
    });

    it('should return false if user does not have role', function () {
      const rules = [{ can_read: true, can_update: false, role: { id: 'role1' }, branding: { name: 'brand1' } }];
      const roles = [{ id: 'role2' }];
      const result = service.canRead(rules, roles, 'brand1');
      expect(result).to.be.false;
    });

    it('should return false if wrong branding', function () {
      const rules = [{ can_read: true, can_update: false, role: { id: 'role1' }, branding: { name: 'brand1' } }];
      const roles = [{ id: 'role1' }];
      const result = service.canRead(rules, roles, 'brand2');
      expect(result).to.be.false;
    });
  });

  describe('canWrite', function () {
    it('should return true if user has role with can_update=true', function () {
      const rules = [{ can_read: true, can_update: true, role: { id: 'role1' }, branding: { name: 'brand1' } }];
      const roles = [{ id: 'role1' }];
      const result = service.canWrite(rules, roles, 'brand1');
      expect(result).to.be.true;
    });

    it('should return false if user has role with can_update=false', function () {
      const rules = [{ can_read: true, can_update: false, role: { id: 'role1' }, branding: { name: 'brand1' } }];
      const roles = [{ id: 'role1' }];
      const result = service.canWrite(rules, roles, 'brand1');
      expect(result).to.be.false;
    });
  });

  describe('exports', function () {
    it('should export all public methods', function () {
      const exported = service;
      expect(exported).to.have.property('loadRules');
      expect(exported).to.have.property('getRulesFromPath');
      expect(exported).to.have.property('canRead');
      expect(exported).to.have.property('canWrite');
    });
  });
});
