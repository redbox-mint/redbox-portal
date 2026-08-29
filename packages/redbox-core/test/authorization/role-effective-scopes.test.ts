import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import {
  asScopeKey,
  createScopeRegistry,
  getRoleEffectiveScopes,
  normalizeRoleScopeOverrides,
  previewRoleTemplateUpgrade,
} from '../../src/authorization';

describe('role effective scopes', () => {
  const registry = createScopeRegistry([
    {
      sourceType: 'core',
      sourcePackage: '@researchdatabox/redbox-core',
      sourceVersion: '1.0.0',
      definitions: [
        {
          key: asScopeKey('record.read'),
          label: 'Read records',
          description: 'Allows reading records in an authorized brand.',
          risk: 'read',
        },
        {
          key: asScopeKey('record.update'),
          label: 'Update records',
          description: 'Allows updating records in an authorized brand.',
          risk: 'write',
        },
        {
          key: asScopeKey('authorization.role.manage'),
          label: 'Manage roles',
          description: 'Allows brand role administration.',
          risk: 'admin',
        },
        {
          key: asScopeKey('record.legacy-read'),
          label: 'Legacy record read',
          description: 'Legacy compatibility scope.',
          risk: 'read',
          deprecated: true,
          replacementKey: asScopeKey('record.read'),
        },
      ],
    },
  ]);

  it('applies unique remove/add overrides deterministically', () => {
    const result = getRoleEffectiveScopes({
      baseScopeKeys: [asScopeKey('record.update'), asScopeKey('record.read'), asScopeKey('record.read')],
      overrides: [
        { scopeKey: asScopeKey('record.update'), effect: 'remove' },
        { scopeKey: asScopeKey('authorization.role.manage'), effect: 'add' },
        { scopeKey: asScopeKey('authorization.role.manage'), effect: 'add' },
      ],
    });

    assert.deepEqual(result.effectiveScopeKeys, ['authorization.role.manage', 'record.read']);
    assert.deepEqual(result.inactiveScopeKeys, []);
    assert.deepEqual(result.missingScopeKeys, []);
  });

  it('applies removals before additions independent of override order', () => {
    const removeThenAdd = getRoleEffectiveScopes({
      baseScopeKeys: [asScopeKey('record.read')],
      overrides: [
        { scopeKey: asScopeKey('record.read'), effect: 'remove' },
        { scopeKey: asScopeKey('record.read'), effect: 'add' },
      ],
    });
    const addThenRemove = getRoleEffectiveScopes({
      baseScopeKeys: [asScopeKey('record.read')],
      overrides: [
        { scopeKey: asScopeKey('record.read'), effect: 'add' },
        { scopeKey: asScopeKey('record.read'), effect: 'remove' },
      ],
    });

    assert.deepEqual(removeThenAdd.effectiveScopeKeys, ['record.read']);
    assert.deepEqual(addThenRemove.effectiveScopeKeys, removeThenAdd.effectiveScopeKeys);
  });

  it('drops inactive and missing scopes from authority while keeping evidence', () => {
    const result = getRoleEffectiveScopes({
      baseScopeKeys: [asScopeKey('record.read'), asScopeKey('record.legacy-read')],
      overrides: [{ scopeKey: asScopeKey('record.publish'), effect: 'add' }],
      registry,
    });

    assert.deepEqual(result.effectiveScopeKeys, ['record.read']);
    assert.deepEqual(result.inactiveScopeKeys, ['record.legacy-read']);
    assert.deepEqual(result.missingScopeKeys, ['record.publish']);
  });

  it('normalizes minimal overrides relative to a pinned template revision', () => {
    const overrides = normalizeRoleScopeOverrides({
      baseScopeKeys: [asScopeKey('record.read'), asScopeKey('record.update')],
      desiredScopeKeys: [asScopeKey('authorization.role.manage'), asScopeKey('record.read')],
    });

    assert.deepEqual(overrides, [
      { scopeKey: 'record.update', effect: 'remove' },
      { scopeKey: 'authorization.role.manage', effect: 'add' },
    ]);
  });

  it('preserves explicit removals while collapsing redundant adds on template upgrade', () => {
    const preview = previewRoleTemplateUpgrade({
      currentBaseScopeKeys: [asScopeKey('record.read'), asScopeKey('record.update')],
      nextBaseScopeKeys: [
        asScopeKey('authorization.role.manage'),
        asScopeKey('record.read'),
        asScopeKey('record.update'),
      ],
      overrides: [
        { scopeKey: asScopeKey('record.update'), effect: 'remove' },
        { scopeKey: asScopeKey('authorization.role.manage'), effect: 'add' },
      ],
      registry,
    });

    assert.deepEqual(preview.currentEffectiveScopeKeys, ['authorization.role.manage', 'record.read']);
    assert.deepEqual(preview.nextEffectiveScopeKeys, ['authorization.role.manage', 'record.read']);
    assert.deepEqual(preview.addedScopeKeys, []);
    assert.deepEqual(preview.removedScopeKeys, []);
    assert.deepEqual(preview.nextOverrides, [{ scopeKey: 'record.update', effect: 'remove' }]);
  });

  it('preserves explicit inactive and missing additions in template previews', () => {
    const preview = previewRoleTemplateUpgrade({
      currentBaseScopeKeys: [asScopeKey('record.read')],
      nextBaseScopeKeys: [asScopeKey('record.read')],
      overrides: [
        { scopeKey: asScopeKey('record.legacy-read'), effect: 'add' },
        { scopeKey: asScopeKey('record.publish'), effect: 'add' },
      ],
      registry,
    });

    assert.deepEqual(preview.nextEffectiveScopeKeys, ['record.read']);
    assert.deepEqual(preview.inactiveScopeKeys, ['record.legacy-read']);
    assert.deepEqual(preview.missingScopeKeys, ['record.publish']);
    assert.deepEqual(preview.nextOverrides, [
      { scopeKey: 'record.legacy-read', effect: 'add' },
      { scopeKey: 'record.publish', effect: 'add' },
    ]);
  });
});
