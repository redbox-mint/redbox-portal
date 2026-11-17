import assert from 'node:assert/strict';
import sinon from 'sinon';


import path from 'node:path';
import { PathRules } from '../../src/authorization/PathRules';
import { BrandingModel } from '../../src/model/storage/BrandingModel';
let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));

describe('Path-rule routing authorization', function () {

const brand = Object.assign(new BrandingModel(), { id: 'brand-1', name: 'default' });
const admin = { id: 'admin-1' };
const researcher = { id: 'researcher-1' };
const guest = { id: 'guest-1' };
const rules = [
    { path: '/:branding/:portal/admin(/*)', role: admin, branding: brand, can_update: true },
    { path: '/:branding/:portal/user/genKey', role: admin, branding: brand, can_update: true },
    { path: '/:branding/:portal/user/revokeKey', role: admin, branding: brand, can_update: true },
    { path: '/:branding/:portal/home/', role: guest, branding: brand, can_read: true },
  ];
let service: PathRules;
beforeEach(async () => {
    service = new PathRules(async () => rules);
    await service.loadRules();
  });
const protectedPaths = [
    '/default/rdmp/admin/users/get',
    '/default/rdmp/AdMiN/users/get',
    '/default/rdmp/ADMIN/users/generateKey',
    '/default/rdmp/user/genKey',
    '/default/rdmp/USER/GENKEY',
    '/default/rdmp/user/genKey/',
    '/default/rdmp/USER/REVOKEKEY/',
  ];
for (const path of protectedPaths) {


    it(`retains administrator access to ${path}`, () => {
      const matches = service.getRulesFromPath(path, brand);
      assert.ok(matches);
      assert.equal(service.canRead(matches, [admin], brand.name), true);
    });
  }
it('keeps rules scoped to the stored brand ID', () => {
    const otherBrand = Object.assign(new BrandingModel(), { id: 'brand-2', name: 'other' });
    assert.equal(service.getRulesFromPath('/other/rdmp/ADMIN/users/get', otherBrand), null);
  });
it('matches configured trailing slashes and preserves public access', () => {
    for (const path of ['/default/rdmp/home', '/default/rdmp/HOME/']) {
      const matches = service.getRulesFromPath(path, brand);
      assert.ok(matches);
      assert.equal(service.canRead(matches, [guest], brand.name), true);
    }
  });
afterEach(() => sinon.restore());
});
