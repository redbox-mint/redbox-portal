#!/usr/bin/env node
'use strict';

const rc = require('rc');
const sails = require('sails');
const { lift, lower } = require('./lib/sails-lift');

// Shared authorization credential redactor. This is the authoritative
// implementation; there is intentionally no copied regex fallback here so a
// drift between this script and the persistence contract cannot silently
// become the normal path. The subpath below is an officially exported,
// runtime-safe module (see `packages/redbox-core/package.json` `exports`:
// it depends only on the pure `authorization/errors` module, never on Sails
// or Waterline).
const SHARED_REDACTOR_SPECIFIER = '@researchdatabox/redbox-core/authorization/persistence-contracts';
// eslint-disable-next-line global-require
const { redactAuthorizationCredentialStrings } = require(SHARED_REDACTOR_SPECIFIER);

function sharedRedact(value) {
  return redactAuthorizationCredentialStrings(value);
}

/**
 * Formats a readiness failure for stderr without leaking credential
 * material. Both Sails lift failures (which may echo connection strings or
 * environment-derived secrets) and report failures (which may echo
 * datastore-backed error detail) funnel through the shared authorization
 * credential redactor.
 */
function formatReadinessFailure(error) {
  const raw = error instanceof Error ? error.message : String(error);
  return `Readiness report failed: ${sharedRedact(raw)}\n`;
}

async function main() {
  await lift({ ...rc('sails'), hooks: { grunt: false } });
  try {
    // getOperatorReport builds the privileged system-process context internally;
    // a hand-rolled actor cannot satisfy requireSystemActor.
    const report = await sails.services.authorizationreadinessservice.getOperatorReport();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    const blockerCount = report.blockers.length;
    process.stdout.write(
      `\nAuthorization readiness: ${report.readyForEnforce ? 'READY for enforce evaluation' : 'NOT ready'} (${blockerCount} blocker(s), mode=${report.mode}).\n`
    );
    if (!report.readyForEnforce) {
      process.exitCode = 2;
    }
  } finally {
    await lower();
  }
}

module.exports = { formatReadinessFailure, sharedRedact, SHARED_REDACTOR_SPECIFIER };

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(formatReadinessFailure(error));
    process.exitCode = 1;
  });
}
