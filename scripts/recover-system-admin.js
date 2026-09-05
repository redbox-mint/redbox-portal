#!/usr/bin/env node
'use strict';

const rc = require('rc');
const sails = require('sails');
const { lift, lower } = require('./lib/sails-lift');

function argument(name) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find(candidate => candidate.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}

async function main() {
  const target = argument('target');
  const reason = argument('reason');
  const operator = argument('operator');
  const confirmation = argument('confirm');
  if (!target || !reason || !confirmation) {
    process.stderr.write(
      'Usage: npm run authorization:recover-system-admin -- --target=<username|userId> --reason="<operator reason>" --confirm=RECOVER-SYSTEM-ADMIN [--operator=<operator identity>]\n'
    );
    throw new Error('Recovery requires --target, --reason, and --confirm=RECOVER-SYSTEM-ADMIN.');
  }
  await lift({ ...rc('sails'), hooks: { grunt: false } });
  try {
    const result = await sails.services.authorizationbootstrapservice.recoverSystemAdministrator({
      target,
      reason,
      confirmation,
      operator,
    });
    // Bounded verification output only: recovery state and principal reference.
    // Role topology (role identifiers, scopes, assignment graphs) is never
    // printed; verify authority through the readiness report instead.
    process.stdout.write(
      `${JSON.stringify({
        recovered: true,
        principalId: result.principalId,
        assignmentCreated: result.assignmentCreated,
        assignmentReactivated: result.assignmentReactivated,
        assignmentState: result.assignmentState,
      })}\n`
    );
  } finally {
    await lower();
  }
}

main().catch(error => {
  process.stderr.write(`Recovery failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
