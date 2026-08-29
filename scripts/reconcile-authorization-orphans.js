#!/usr/bin/env node
'use strict';

const rc = require('rc');
const sails = require('sails');
const { generateAllShims } = require('@researchdatabox/redbox-core');

function argument(name) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find(candidate => candidate.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}

async function lift(config) {
  await new Promise((resolve, reject) => {
    sails.lift(config, error => (error ? reject(error) : resolve()));
  });
}

async function lower() {
  await new Promise((resolve, reject) => {
    sails.lower(error => (error ? reject(error) : resolve()));
  });
}

async function main() {
  const apply = process.argv.includes('--apply');
  const expectedGeneration = argument('generation');
  if (apply && !expectedGeneration) {
    throw new Error('--apply requires --generation=<reviewed-registry-generation>.');
  }
  const { recordContractContributorState } = await generateAllShims(process.cwd(), { forceRegenerate: true });
  await lift({ ...rc('sails'), recordContractContributorState, hooks: { grunt: false } });
  try {
    let afterKey;
    do {
      const result = await sails.services.authorizationscopeservice.reconcileOrphans({
        apply,
        expectedGeneration,
        afterKey,
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      afterKey = result.nextCursor;
    } while (afterKey);
  } finally {
    await lower();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
