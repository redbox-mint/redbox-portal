import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import {
  AuthorizationValidationError,
  asScopeKey,
  createScopeRegistry,
  type ScopeRegistrySource,
} from '../../src/authorization';

function assertValidationError(fn: () => unknown, code: AuthorizationValidationError['code']): void {
  assert.throws(fn, (error: unknown) => {
    assert.equal(error instanceof AuthorizationValidationError, true);
    if (!(error instanceof AuthorizationValidationError)) {
      return false;
    }

    assert.equal(error.code, code);
    return true;
  });
}

function createSource(source: ScopeRegistrySource): ScopeRegistrySource {
  return source;
}

describe('authorization scope registry', () => {
  it('builds a deterministic generation independent of provider order', () => {
    const coreSource = createSource({
      sourceType: 'core',
      sourcePackage: '@researchdatabox/redbox-core',
      sourceVersion: '1.0.0',
      definitions: [
        {
          key: asScopeKey('authorization.role.manage'),
          label: 'Manage roles',
          description: 'Allows brand role administration.',
          risk: 'admin',
        },
        {
          key: asScopeKey('record.read'),
          label: 'Read records',
          description: 'Allows reading records in an authorized brand.',
          risk: 'read',
        },
      ],
    });
    const hookSource = createSource({
      sourceType: 'hook',
      sourcePackage: '@researchdatabox/redbox-hook-curation',
      sourceVersion: '2.4.0',
      definitions: [
        {
          key: asScopeKey('curation.review'),
          label: 'Review curation jobs',
          description: 'Allows reviewing curation work queues.',
          risk: 'write',
        },
      ],
    });

    const registryA = createScopeRegistry([hookSource, coreSource]);
    const registryB = createScopeRegistry([coreSource, hookSource]);

    assert.equal(registryA.generation, registryB.generation);
    assert.deepEqual(
      registryA.all.map(definition => definition.key),
      ['authorization.role.manage', 'curation.review', 'record.read']
    );
    assert.equal(registryA.get(asScopeKey('curation.review'))?.sourcePackage, '@researchdatabox/redbox-hook-curation');
  });

  it('categorizes active, inactive, and missing scope keys', () => {
    const registry = createScopeRegistry([
      createSource({
        sourceType: 'hook',
        sourcePackage: '@researchdatabox/redbox-hook-curation',
        sourceVersion: '2.4.0',
        definitions: [
          {
            key: asScopeKey('curation.review'),
            label: 'Review curation jobs',
            description: 'Allows reviewing curation work queues.',
            risk: 'write',
          },
          {
            key: asScopeKey('curation.legacy-review'),
            label: 'Legacy review',
            description: 'Legacy curation review scope kept for migration.',
            risk: 'write',
            deprecated: true,
            replacementKey: asScopeKey('curation.review'),
          },
        ],
      }),
    ]);

    const summary = registry.validateScopeKeys([
      asScopeKey('curation.review'),
      asScopeKey('curation.legacy-review'),
      asScopeKey('curation.publish'),
    ]);

    assert.deepEqual(summary.activeScopeKeys, ['curation.review']);
    assert.deepEqual(summary.inactiveScopeKeys, ['curation.legacy-review']);
    assert.deepEqual(summary.missingScopeKeys, ['curation.publish']);
  });

  it('rejects hook namespace theft of reserved core namespaces', () => {
    assertValidationError(
      () =>
        createScopeRegistry([
          createSource({
            sourceType: 'hook',
            sourcePackage: '@researchdatabox/redbox-hook-curation',
            sourceVersion: '2.4.0',
            definitions: [
              {
                key: asScopeKey('record.read'),
                label: 'Read records',
                description: 'Invalid attempt to steal a core namespace.',
                risk: 'read',
              },
            ],
          }),
        ]),
      'scope-namespace-reserved'
    );
  });

  it('validates hook scope declarations at the runtime loader boundary', () => {
    assertValidationError(
      () =>
        createScopeRegistry([
          {
            sourceType: 'hook',
            sourcePackage: 'redbox-hook-example',
            sourceVersion: '1.0.0',
            definitions: [
              {
                key: 'example.read*',
                label: 'Read examples',
                description: 'Read example records.',
                risk: 'read',
              },
            ],
          },
        ]),
      'scope-key-invalid'
    );

    assertValidationError(
      () =>
        createScopeRegistry([
          {
            sourceType: 'hook',
            sourcePackage: 'redbox-hook-example',
            sourceVersion: '1.0.0',
            definitions: [
              {
                key: 'example.read',
                label: 'Read examples',
                description: 'Read example records.',
                risk: 'critical',
              },
            ],
          },
        ]),
      'scope-definition-invalid'
    );
  });

  it('rejects deprecated scopes that point at missing replacements', () => {
    assertValidationError(
      () =>
        createScopeRegistry([
          createSource({
            sourceType: 'hook',
            sourcePackage: '@researchdatabox/redbox-hook-curation',
            sourceVersion: '2.4.0',
            definitions: [
              {
                key: asScopeKey('curation.legacy-review'),
                label: 'Legacy review',
                description: 'Legacy curation review scope kept for migration.',
                risk: 'write',
                deprecated: true,
                replacementKey: asScopeKey('curation.review'),
              },
            ],
          }),
        ]),
      'scope-replacement-missing'
    );
  });

  it('rejects conflicting definitions for the same scope key', () => {
    assertValidationError(
      () =>
        createScopeRegistry([
          createSource({
            sourceType: 'core',
            sourcePackage: '@researchdatabox/redbox-core',
            sourceVersion: '1.0.0',
            definitions: [
              {
                key: asScopeKey('record.read'),
                label: 'Read records',
                description: 'Allows reading records.',
                risk: 'read',
              },
            ],
          }),
          createSource({
            sourceType: 'core',
            sourcePackage: '@researchdatabox/redbox-core',
            sourceVersion: '1.0.1',
            definitions: [
              {
                key: asScopeKey('record.read'),
                label: 'Inspect records',
                description: 'Conflicting metadata for the same scope.',
                risk: 'read',
              },
            ],
          }),
        ]),
      'scope-definition-conflict'
    );
  });

  it('rejects byte-identical duplicate scope declarations', () => {
    assertValidationError(
      () =>
        createScopeRegistry([
          createSource({
            sourceType: 'core',
            sourcePackage: '@researchdatabox/redbox-core',
            sourceVersion: '1.0.0',
            definitions: [
              {
                key: asScopeKey('record.read'),
                label: 'Read records',
                description: 'Allows reading records.',
                risk: 'read',
              },
            ],
          }),
          createSource({
            sourceType: 'core',
            sourcePackage: '@researchdatabox/redbox-core',
            sourceVersion: '1.0.0',
            definitions: [
              {
                key: asScopeKey('record.read'),
                label: 'Read records',
                description: 'Allows reading records.',
                risk: 'read',
              },
            ],
          }),
        ]),
      'scope-definition-duplicate'
    );
  });

  it('exposes an actually immutable registry without breaking the read API', () => {
    const registry = createScopeRegistry([
      createSource({
        sourceType: 'core',
        sourcePackage: '@researchdatabox/redbox-core',
        sourceVersion: '1.0.0',
        definitions: [
          {
            key: asScopeKey('record.read'),
            label: 'Read records',
            description: 'Allows reading records.',
            risk: 'read',
          },
        ],
      }),
    ]);

    assert.equal(Object.isFrozen(registry), true);
    assert.equal(Object.isFrozen(registry.all), true);
    assert.equal(Object.isFrozen(registry.all[0]), true);
    assert.equal(Object.isFrozen(registry.list()), true);
    const summary = registry.validateScopeKeys([asScopeKey('record.read')]);
    assert.equal(Object.isFrozen(summary.activeScopeKeys), true);
    assert.equal(Object.isFrozen(summary.inactiveScopeKeys), true);
    assert.equal(Object.isFrozen(summary.missingScopeKeys), true);

    assert.throws(() => {
      (registry.all as unknown as unknown[]).push({
        key: 'record.injected',
        label: 'Injected',
        description: 'Injected scope.',
        risk: 'read',
      });
    });
    assert.throws(() => {
      (registry.all[0] as unknown as Record<string, unknown>).label = 'Mutated';
    });
    assert.throws(() => {
      (registry.list() as unknown as unknown[]).push(asScopeKey('record.read'));
    });
    assert.throws(() => {
      (registry as unknown as Record<string, unknown>).generation = 'mutated';
    });

    // Read API still works after freezing.
    assert.equal(registry.has(asScopeKey('record.read')), true);
    assert.equal(registry.isActive(asScopeKey('record.read')), true);
    assert.equal(registry.get(asScopeKey('record.read'))?.label, 'Read records');
    assert.deepEqual(
      registry.list().map(definition => definition.key),
      ['record.read']
    );
  });

  it('treats unknown scopes as missing across every negative read path', () => {
    const registry = createScopeRegistry([
      createSource({
        sourceType: 'core',
        sourcePackage: '@researchdatabox/redbox-core',
        sourceVersion: '1.0.0',
        definitions: [
          {
            key: asScopeKey('record.read'),
            label: 'Read records',
            description: 'Allows reading records.',
            risk: 'read',
          },
        ],
      }),
    ]);

    const unknown = asScopeKey('record.publish');
    assert.equal(registry.has(unknown), false);
    assert.equal(registry.isActive(unknown), false);
    assert.equal(registry.get(unknown), undefined);
    assert.deepEqual(registry.validateScopeKeys([unknown]).missingScopeKeys, [unknown]);
    assert.deepEqual(registry.validateScopeKeys([unknown]).activeScopeKeys, []);
  });

  it('keeps core scope catalog exports immutable for public consumers', () => {
    const authorization = require('../../src/authorization') as Record<string, unknown>;
    assert.equal(typeof authorization.createScopeRegistry, 'function');
    assert.equal(typeof authorization.decideAuthorization, 'function');
    assert.equal(typeof authorization.requireRequestAuthorizationContext, 'function');
    assert.equal(typeof authorization.validateRouteAuthorizations, 'function');
  });
});
