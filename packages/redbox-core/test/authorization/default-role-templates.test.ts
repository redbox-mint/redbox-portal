import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import {
  CORE_AUTHORIZATION_CATALOG_VERSION,
  DEFAULT_ROLE_TEMPLATES,
  GUEST_SCOPE_ALLOWLIST,
  asScopeKey,
  createCoreAuthorizationScopeSource,
  createScopeRegistry,
  validateDefaultRoleTemplates,
} from '../../src/authorization';

describe('default authorization declarations', () => {
  it('publishes a deterministic core catalog and valid immutable templates', () => {
    const source = createCoreAuthorizationScopeSource(CORE_AUTHORIZATION_CATALOG_VERSION);
    const registry = createScopeRegistry([source]);
    const repeated = createScopeRegistry([createCoreAuthorizationScopeSource(CORE_AUTHORIZATION_CATALOG_VERSION)]);

    validateDefaultRoleTemplates(registry);

    assert.equal(registry.generation, repeated.generation);
    assert.ok(registry.has(asScopeKey('authorization.self.read')));
    assert.ok(registry.has(asScopeKey('system.authorization.manage')));
    assert.deepEqual(
      DEFAULT_ROLE_TEMPLATES.map(template => template.key),
      ['brand-admin', 'guest', 'librarian', 'researcher', 'system-admin']
    );
    assert.equal(new Set(DEFAULT_ROLE_TEMPLATES.map(template => template.contentHash)).size, 5);
  });

  it('keeps Guest inside the reviewed safe allowlist and system administration explicit', () => {
    const guest = DEFAULT_ROLE_TEMPLATES.find(template => template.key === 'guest');
    const system = DEFAULT_ROLE_TEMPLATES.find(template => template.key === 'system-admin');
    assert.ok(guest);
    assert.ok(system);
    assert.ok(guest.scopeKeys.every(scopeKey => GUEST_SCOPE_ALLOWLIST.has(scopeKey)));
    assert.ok(guest.scopeKeys.includes(asScopeKey('authorization.self.read')));
    assert.deepEqual(
      system.scopeKeys.filter(scopeKey => scopeKey.startsWith('system.')),
      ['system.authorization.manage', 'system.brand.read']
    );
    assert.equal(system.scopeKeys.includes(asScopeKey('record.read.all')), false);
  });
});
