import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'mocha';
import {
  AUTHORIZATION_PERSISTENCE_MODEL_INDEXES,
  Services,
  ensureAuthorizationPersistenceIndexes,
  type AuthorizationIndexModel,
  type ExistingAuthorizationIndex,
} from '../../src/services/AuthorizationPersistenceService';
import type { RoleAssignmentCreateRecord } from '../../src/waterline-models/RoleAssignment';

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'Role');
  Reflect.deleteProperty(globalThis, 'RoleAssignment');
});

describe('AuthorizationPersistenceService', () => {
  it('creates every required runtime index and keeps legacy Role indexes partial or sparse', async () => {
    const created = new Map<string, readonly Record<string, unknown>[]>();
    const models = new Map<string, AuthorizationIndexModel>();
    for (const definition of AUTHORIZATION_PERSISTENCE_MODEL_INDEXES) {
      models.set(definition.modelIdentity, {
        tableName: definition.modelIdentity,
        getDatastore: () => ({
          manager: {
            collection: (name: string) => ({
              indexes: async () => [{ key: { _id: 1 }, name: '_id_' }],
              createIndexes: async (indexes: readonly Record<string, unknown>[]) => {
                created.set(name, indexes);
                return indexes.map(index => String(index.name));
              },
            }),
          },
        }),
      });
    }

    await ensureAuthorizationPersistenceIndexes(identity => models.get(identity));

    assert.equal(created.size, AUTHORIZATION_PERSISTENCE_MODEL_INDEXES.length);
    const roleIndexes = created.get('role');
    assert.ok(roleIndexes);
    assert.deepEqual(
      roleIndexes.find(index => index.name === 'role_identity_key_unique'),
      {
        key: { identityKey: 1 },
        name: 'role_identity_key_unique',
        sparse: true,
        unique: true,
      }
    );
    for (const index of roleIndexes.filter(index => index.name !== 'role_identity_key_unique')) {
      assert.ok(index.partialFilterExpression, `${String(index.name)} must exclude pre-migration Role rows.`);
    }
  });

  it('is idempotent for equivalent indexes and rejects an unsafe non-sparse identity index', async () => {
    const roleDefinition = AUTHORIZATION_PERSISTENCE_MODEL_INDEXES.find(
      definition => definition.modelIdentity === 'role'
    );
    assert.ok(roleDefinition);
    let createInvocations = 0;
    const modelFor = (tableName: string, indexes: readonly ExistingAuthorizationIndex[]): AuthorizationIndexModel => ({
      tableName,
      getDatastore: () => ({
        manager: {
          collection: () => ({
            indexes: async () => indexes,
            createIndexes: async () => {
              createInvocations += 1;
              return [];
            },
          }),
        },
      }),
    });

    await ensureAuthorizationPersistenceIndexes(identity => {
      const definition = AUTHORIZATION_PERSISTENCE_MODEL_INDEXES.find(
        candidate => candidate.modelIdentity === identity
      );
      assert.ok(definition);
      return modelFor(identity, [{ key: { _id: 1 }, name: '_id_' }, ...definition.indexes]);
    });
    assert.equal(createInvocations, 0);

    await assert.rejects(
      ensureAuthorizationPersistenceIndexes(identity => {
        const definition = AUTHORIZATION_PERSISTENCE_MODEL_INDEXES.find(
          candidate => candidate.modelIdentity === identity
        );
        assert.ok(definition);
        return modelFor(
          identity,
          identity === 'role'
            ? [
                { key: { _id: 1 }, name: '_id_' },
                { key: { identityKey: 1 }, name: 'identityKey_1', unique: true },
              ]
            : [{ key: { _id: 1 }, name: '_id_' }, ...definition.indexes]
        );
      }),
      /conflicts.*role_identity_key_unique.*sparse/iu
    );
  });

  it('validates the role and creates the assignment on the caller connection', async () => {
    const connection = Object.freeze({ lease: 'assignment-transaction' });
    let roleConnection: Sails.Connection | undefined;
    let assignmentConnection: Sails.Connection | undefined;
    let createdRecord: RoleAssignmentCreateRecord | undefined;
    Reflect.set(globalThis, 'Role', {
      findOne() {
        return {
          usingConnection(leasedConnection: Sails.Connection) {
            roleConnection = leasedConnection;
            return Promise.resolve({
              id: 'role-1',
              contextType: 'brand',
              branding: 'brand-1',
              protectedKind: 'none',
            });
          },
        };
      },
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      create(record: RoleAssignmentCreateRecord) {
        createdRecord = record;
        const query = {
          fetch() {
            return query;
          },
          usingConnection(leasedConnection: Sails.Connection) {
            assignmentConnection = leasedConnection;
            return Promise.resolve({ ...record, id: 'assignment-1' });
          },
        };
        return query;
      },
    });
    const input: RoleAssignmentCreateRecord = Object.freeze({
      principalType: 'user',
      principalId: 'user-1',
      role: 'role-1',
      branding: 'brand-1',
      source: 'manual',
      sourceKey: 'manual',
      status: 'active',
      sourcePresent: true,
      assignedBy: 'operator-1',
      assignedAt: '2026-08-28T00:00:00.000Z',
      version: 1,
    });

    const service = new Services.AuthorizationPersistenceService();
    const assignment = await service.createRoleAssignment(input, connection);

    assert.equal(roleConnection, connection);
    assert.equal(assignmentConnection, connection);
    assert.equal(assignment.id, 'assignment-1');
    assert.notEqual(createdRecord, input);
    assert.deepEqual(input, {
      principalType: 'user',
      principalId: 'user-1',
      role: 'role-1',
      branding: 'brand-1',
      source: 'manual',
      sourceKey: 'manual',
      status: 'active',
      sourcePresent: true,
      assignedBy: 'operator-1',
      assignedAt: '2026-08-28T00:00:00.000Z',
      version: 1,
    });
    await assert.rejects(service.createRoleAssignment(input, undefined), /caller transaction connection/);
  });
});
