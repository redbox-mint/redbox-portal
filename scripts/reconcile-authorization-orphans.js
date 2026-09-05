#!/usr/bin/env node
'use strict';

const rc = require('rc');
const sails = require('sails');
const { generateAllShims } = require('@researchdatabox/redbox-core');
const { lift, lower } = require('./lib/sails-lift');

function argument(name) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find(candidate => candidate.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const expectedGeneration = argument('generation');
  if (apply && !expectedGeneration) {
    throw new Error('--apply requires --generation=<reviewed-registry-generation>.');
  }
  const { recordContractContributorState } = await generateAllShims(process.cwd(), { forceRegenerate: true });
  await lift({ ...rc('sails'), recordContractContributorState, hooks: { grunt: false } });
  // Operator lease for the apply path: orphan-marking mutates scope rows, so
  // --apply acquires the shared durable migration lease and threads the exact
  // owner+fence into every reconcileOrphans page transaction (entry +
  // pre-commit same-session fences inside the service). Preview runs
  // read-only and leaseless. A live lease held by a lift fails apply closed
  // instead of racing it; a takeover mid-run aborts the remaining pages.
  let applyLease;
  let releaseApplyLease;
  if (apply) {
    const migrationModule = require('@researchdatabox/redbox-core/dist/services/AuthorizationMigrationService');
    const handle = await migrationModule.acquireMigrationLease(
      `orphan-reconcile:${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`
    );
    applyLease = { owner: handle.owner, fence: handle.fence };
    releaseApplyLease = () => handle.release();
  }
  try {
    let afterKey;
    const seenCursors = new Set();
    let pages = 0;
    const maxPages = 10000;
    do {
      const result = await sails.services.authorizationscopeservice.reconcileOrphans({
        apply,
        expectedGeneration,
        afterKey,
        ...(applyLease !== undefined ? { lease: applyLease } : {}),
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      const next = result.nextCursor;
      // Fail-closed loop guard: the service must return strictly increasing
      // cursors. A repeated, non-advancing, or unbounded cursor aborts
      // instead of looping forever against a predicate-ignoring adapter.
      if (next) {
        if (typeof next !== 'string' || (afterKey !== undefined && next <= afterKey) || seenCursors.has(next)) {
          throw new Error('Orphan reconciliation cursor did not advance; aborting to avoid an infinite loop.');
        }
        seenCursors.add(next);
      }
      afterKey = next;
      pages += 1;
      if (pages > maxPages) {
        throw new Error('Orphan reconciliation exceeded the bounded page limit; aborting.');
      }
    } while (afterKey);
  } finally {
    if (releaseApplyLease !== undefined) {
      await releaseApplyLease();
    }
    await lower();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
