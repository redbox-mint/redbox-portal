'use strict';

// Read-only CircleCI identity and plan checks for the default-off asset pilot.
// The caller supplies a CircleCIReadClient; workspace data is never a trust root.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHash } = require('node:crypto');

const PROJECT = 'gh/redbox-mint/redbox-portal';
const BRANCH = 'chore/circleci-performance';
const WORKFLOW = 'ci_web_assets_shadow';
const PRODUCER = 'web-assets-produce';
const CONSUMER = 'web-assets-shared-arm64';
const CONTROL = 'web-assets-control-arm64';
const ARTIFACT = 'ci-web-assets-pilot/producer-success.json';
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const positive = value => Number.isSafeInteger(value) && value > 0;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function context(value) {
  assert.equal(value.project, PROJECT);
  assert.equal(value.branch, BRANCH);
  assert.equal(value.tag, '');
  assert.match(value.revision, REVISION);
  assert.match(value.pipelineId, UUID);
  assert.match(value.workflowId, UUID);
  assert.match(value.jobId, UUID);
  assert.match(value.configurationSha256, SHA);
  assert.ok(positive(value.pipelineNumber));
  assert.ok(positive(value.jobNumber));
  return { ...value };
}

function identity(ctx, attempt) {
  assert.ok(positive(attempt));
  return {
    project: ctx.project,
    revision: ctx.revision,
    pipeline: ctx.pipelineNumber,
    workflow: ctx.workflowId,
    attempt,
  };
}

function producerRecord(ctx, jobId, receiptSha256) {
  context(ctx);
  assert.match(jobId, UUID);
  assert.equal(jobId, ctx.jobId);
  assert.match(receiptSha256, SHA);
  return {
    schemaVersion: 1,
    identity: identity(ctx, ctx.jobNumber),
    receiptSha256,
    producer: { jobId, jobNumber: ctx.jobNumber, pipelineId: ctx.pipelineId, workflowId: ctx.workflowId },
  };
}

async function authenticateWorkflow(client, supplied) {
  const ctx = context(supplied);
  const workflow = await client.workflow(ctx.workflowId);
  assert.equal(workflow.id, ctx.workflowId);
  assert.equal(workflow.pipeline_id, ctx.pipelineId);
  assert.equal(workflow.pipeline_number, ctx.pipelineNumber);
  assert.equal(workflow.project_slug, PROJECT);
  assert.equal(workflow.name, WORKFLOW);
  assert.equal(workflow.status, 'running');
  const pipeline = await client.pipeline(ctx.pipelineId);
  assert.equal(pipeline.id, ctx.pipelineId);
  assert.equal(pipeline.number, ctx.pipelineNumber);
  assert.equal(pipeline.project_slug, PROJECT);
  assert.ok(Array.isArray(pipeline.errors) && pipeline.errors.length === 0);
  assert.equal(pipeline.vcs?.revision, ctx.revision);
  assert.equal(pipeline.vcs?.branch, BRANCH);
  assert.ok(!pipeline.vcs?.tag);
  assert.equal(pipeline.vcs?.provider_name, 'GitHub');
  const repository = `https://github.com/${PROJECT.slice(3)}`;
  assert.equal(pipeline.vcs?.origin_repository_url, repository);
  assert.equal(pipeline.vcs?.target_repository_url, repository);
  const configuration = await client.configuration(ctx.pipelineId);
  for (const key of ['setup_config', 'compiled_setup_config', 'setup-config', 'compiled-setup-config'])
    assert.ok(configuration[key] == null || configuration[key] === '', 'dynamic setup is not supported');
  assert.equal(typeof configuration.source, 'string');
  assert.equal(typeof configuration.compiled, 'string');
  assert.equal(
    digest(
      Buffer.from(`${JSON.stringify({ source: configuration.source, compiled: configuration.compiled }, null, 2)}\n`)
    ),
    ctx.configurationSha256,
    'pipeline configuration is not independently approved'
  );
  return ctx;
}

async function authenticateProducer(client, supplied) {
  const ctx = await authenticateWorkflow(client, supplied);
  const jobs = await client.jobs(ctx.workflowId);
  const producerJobs = jobs.filter(job => job.name === PRODUCER);
  const consumerJobs = jobs.filter(job => job.name === CONSUMER);
  assert.equal(producerJobs.length, 1, 'missing or ambiguous producer');
  assert.equal(consumerJobs.length, 1, 'missing or ambiguous consumer');
  const [producer] = producerJobs,
    [consumer] = consumerJobs;
  assert.equal(consumer.job_number, ctx.jobNumber);
  assert.equal(consumer.id, ctx.jobId);
  async function checkJob(job, expectedStatus) {
    assert.match(job.id, UUID);
    assert.equal(job.project_slug, PROJECT);
    assert.equal(job.type, 'build');
    assert.equal(job.status, expectedStatus);
    assert.ok(positive(job.job_number));
    const detail = await client.job(job.id);
    for (const key of ['id', 'name', 'job_number', 'type', 'status']) assert.equal(detail[key], job[key]);
    assert.equal(detail.pipeline_id, ctx.pipelineId);
    assert.equal(detail.workflow_id, ctx.workflowId);
    return detail;
  }
  const producerDetail = await checkJob(producer, 'success');
  const consumerDetail = await checkJob(consumer, 'running');
  assert.match(producerDetail.project_id, UUID);
  assert.equal(producerDetail.project_id, consumerDetail.project_id);
  const record = await client.artifact(PROJECT, producer.job_number, ARTIFACT);
  const producerCtx = { ...ctx, jobId: producer.id, jobNumber: producer.job_number };
  assert.deepEqual(record, producerRecord(producerCtx, producer.id, record.receiptSha256));
  // Recheck the statuses after artifact retrieval; reruns are never silently accepted.
  await checkJob(producer, 'success');
  await checkJob(consumer, 'running');
  assert.equal((await client.workflow(ctx.workflowId)).status, 'running');
  return { identity: identity(ctx, producer.job_number), receiptSha256: record.receiptSha256 };
}

async function authenticateCurrent(client, supplied, name) {
  const ctx = await authenticateWorkflow(client, supplied);
  assert.ok([PRODUCER, CONTROL].includes(name));
  const jobs = await client.jobs(ctx.workflowId);
  const selected = jobs.filter(job => job.name === name);
  assert.equal(selected.length, 1, 'missing or ambiguous current job');
  const [job] = selected;
  assert.equal(job.id, ctx.jobId);
  assert.equal(job.job_number, ctx.jobNumber);
  assert.equal(job.project_slug, PROJECT);
  assert.equal(job.type, 'build');
  assert.equal(job.status, 'running');
  const detail = await client.job(job.id);
  for (const key of ['id', 'name', 'job_number', 'type', 'status']) assert.equal(detail[key], job[key]);
  assert.equal(detail.pipeline_id, ctx.pipelineId);
  assert.equal(detail.workflow_id, ctx.workflowId);
  assert.match(detail.project_id, UUID);
  return ctx;
}

function verifyPlan(bytes, trustedSha256, expected) {
  assert.match(trustedSha256, SHA);
  assert.equal(digest(bytes), trustedSha256, 'plan checksum mismatch');
  const plan = JSON.parse(bytes.toString('utf8'));
  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.contract, 'redbox-shared-web-assets-pilot-v1');
  assert.deepEqual(plan.identity, expected.identity);
  assert.equal(plan.consumerPlatform, 'linux/arm64');
  assert.equal(plan.producerPlatform, 'linux/amd64');
  assert.equal(plan.receiptSha256, expected.receiptSha256);
  assert.match(plan.assets?.manifestSha256, SHA);
  assert.equal(plan.assets.manifestSha256, expected.manifestSha256);
  assert.equal(plan.stage, path.join(expected.output, 'web-assets'));
  assert.deepEqual(plan.invocation, {
    command: 'docker',
    args: [
      'buildx',
      'build',
      '--platform',
      'linux/arm64',
      '--target',
      'runtime',
      '--build-arg',
      'WEB_ASSETS=shared',
      '--build-arg',
      `SOURCE_REVISION=${expected.identity.revision}`,
      '--build-arg',
      `WEB_ASSETS_MANIFEST_SHA256=${plan.assets.manifestSha256}`,
      '--build-context',
      `web-assets=${plan.stage}`,
      '--output',
      `type=oci,dest=${path.join(expected.output, 'image.oci.tar')}`,
      expected.root,
    ],
    cwd: expected.root,
    shell: false,
  });
  return plan.invocation;
}

module.exports = {
  PROJECT,
  BRANCH,
  WORKFLOW,
  PRODUCER,
  CONTROL,
  CONSUMER,
  ARTIFACT,
  context,
  identity,
  producerRecord,
  authenticateWorkflow,
  authenticateProducer,
  authenticateCurrent,
  verifyPlan,
};
