#!/usr/bin/env node
'use strict';

const rc = require('rc');
const sails = require('sails');
const { lift, lower } = require('./lib/sails-lift');

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

main().catch(error => {
  process.stderr.write(`Readiness report failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
