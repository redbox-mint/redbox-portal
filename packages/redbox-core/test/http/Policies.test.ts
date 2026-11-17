import assert from 'node:assert/strict';
import sinon from 'sinon';


import path from 'node:path';
import { PathRules } from '../../src/authorization/PathRules';
let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));

describe('standalone actor and policy context', function () {

it('owns and atomically refreshes path rules without per-request repository queries', async () => {
    const brand = { id: 'brand', name: 'default' };
    const read = sinon.stub().resolves([{ path: '/private(/*)', branding: brand, role: 'admin', can_read: true }]);
    const rules = new PathRules(read);
    assert.throws(() => rules.getRulesFromPath('/private/a', brand), /Initialize/);
    await Promise.all([rules.loadRules(), rules.loadRules()]);
    assert.equal(read.callCount, 1);
    for (const path of ['/private/a', '/PRIVATE/a/']) {
      const matched = rules.getRulesFromPath(path, brand);
      assert(matched);
      assert.equal(rules.canRead(matched, [{ id: 'admin' }], brand.name), true);
      assert.equal(rules.canRead(matched, [{ id: 'reader' }], brand.name), false);
    }
    assert.equal(rules.getRulesFromPath('/unruled', brand), null);
    assert.equal(rules.getRulesFromPath('/private/a', { id: 'other' }), null);
    assert.equal(read.callCount, 1);
    read.rejects(new Error('refresh failed'));
    await assert.rejects(rules.loadRules(), /refresh failed/);
    assert(rules.getRulesFromPath('/private/a', brand));
    read.resolves([]);
    await rules.loadRules();
    assert.equal(rules.getRulesFromPath('/private/a', brand), null);
    const second = new PathRules(async () => []);
    await second.loadRules();
    assert.equal(second.getRulesFromPath('/private/a', brand), null);
  });
afterEach(() => sinon.restore());
});
