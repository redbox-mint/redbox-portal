'use strict';

// AUTH-LINK-RACE-001 + AUTH-TXN-001: enforceable account-link constraints.
//
// - `userlink { secondaryUserId: 1, status: 1 }` unique: exactly one active
//   link per secondary (concurrent writers fail closed on duplicate-key,
//   normalized to 409 `authorization.version-conflict`).
// - `userlinkoperation { operationId: 1 }` unique: durable link-operation
//   outbox key for pending/running/completed/failed transitions and bounded
//   idempotent retry.
//
// Index definitions are canonical in
// `AuthorizationPersistenceService.AUTHORIZATION_PERSISTENCE_MODEL_INDEXES`
// (applied at lift via `init`); this migration ensures them explicitly so
// existing deployments converge without a fresh lift.

const MIGRATION_NAME = '20260905T120000-account-link-uniqueness';

module.exports = {
  name: MIGRATION_NAME,
  up: async ({ context: sails } = {}) => {
    const init = sails?.services?.authorizationpersistenceservice?.init;
    if (typeof init === 'function') {
      await init();
      return;
    }
    const {
      ensureAuthorizationPersistenceIndexes,
    } = require('../../packages/redbox-core/dist/services/AuthorizationPersistenceService');
    if (typeof ensureAuthorizationPersistenceIndexes !== 'function') {
      throw new Error(`${MIGRATION_NAME} blocked: AuthorizationPersistenceService index ensure is unavailable.`);
    }
    await ensureAuthorizationPersistenceIndexes();
  },
};
