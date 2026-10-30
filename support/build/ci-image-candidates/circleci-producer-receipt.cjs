'use strict';

const fs = require('node:fs/promises');
const { verify, json, identity } = require('./candidates.cjs');
const { producerReceipt } = require('./circleci-authorize.cjs');

// Run AFTER the native job's contract/startup checks. Inputs are a prepare result
// plus platform, not a replacement gate. stdout is suitable for store_artifacts.
async function main(argv, { env = process.env, stdout = process.stdout } = {}) {
  if (argv.length !== 1) throw new Error('usage: node circleci-producer-receipt.cjs PREPARE-RESULT-WITH-PLATFORM.json');
  const request = JSON.parse(await fs.readFile(argv[0], 'utf8'));
  const id = identity({ revision: env.CIRCLE_SHA1, pipeline: Number(env.REDBOX_CIRCLE_PIPELINE_NUMBER),
    workflow: env.CIRCLE_WORKFLOW_ID, attempt: 1 });
  if (env.CIRCLE_PROJECT_USERNAME === undefined || env.CIRCLE_PROJECT_REPONAME === undefined) {
    throw new Error('CircleCI project environment required');
  }
  await verify({ directory: request.directory, platform: request.platform, catalogSha256: request.catalogSha256,
    identity: id, load: false });
  const receipt = producerReceipt({ identity: id, platform: request.platform, catalogSha256: request.catalogSha256,
    producer: { projectSlug: `gh/${env.CIRCLE_PROJECT_USERNAME}/${env.CIRCLE_PROJECT_REPONAME}`,
      pipelineId: env.REDBOX_CIRCLE_PIPELINE_ID, workflowId: env.CIRCLE_WORKFLOW_ID,
      jobId: env.CIRCLE_WORKFLOW_JOB_ID, jobNumber: Number(env.CIRCLE_BUILD_NUM) } });
  stdout.write(json(receipt));
  return receipt;
}

if (require.main === module) main(process.argv.slice(2)).catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
module.exports = { main };
