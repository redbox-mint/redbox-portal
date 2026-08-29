'use strict';

const MIGRATION_NAME = '20260828T120000-authorization-model-v1';

module.exports = {
  name: MIGRATION_NAME,
  up: async ({ context: sails } = {}) => {
    if (!sails?.services?.authorizationmigrationservice) {
      throw new Error('AuthorizationMigrationService is unavailable. Regenerate ReDBox shims before lifting.');
    }
    const result = await sails.services.authorizationmigrationservice.run();
    const blockers = result.issues.filter(issue => issue.severity === 'blocker');
    if (blockers.length > 0) {
      const counts = blockers.reduce((summary, issue) => {
        summary[issue.code] = (summary[issue.code] || 0) + 1;
        return summary;
      }, {});
      throw new Error(`${MIGRATION_NAME} blocked: ${JSON.stringify(counts)}`);
    }
  },
};
