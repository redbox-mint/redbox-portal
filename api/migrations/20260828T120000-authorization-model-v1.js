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
    // Fail-closed truncation: a capped 500-entry prefix is not the full set.
    // When `issuesTruncated` is set, unseen issues beyond the visible prefix
    // may include blockers, so the migration must block even when no visible
    // blocker entry is present (for example 500 warnings preceding a blocker).
    const truncated = result.issuesTruncated === true;
    if (blockers.length > 0 || truncated) {
      const counts = blockers.reduce((summary, issue) => {
        summary[issue.code] = (summary[issue.code] || 0) + 1;
        return summary;
      }, {});
      if (truncated) counts['migration-issues-truncated'] = (counts['migration-issues-truncated'] || 0) + 1;
      throw new Error(`${MIGRATION_NAME} blocked: ${JSON.stringify(counts)}`);
    }
  },
};
