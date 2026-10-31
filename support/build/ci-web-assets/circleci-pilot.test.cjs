'use strict';
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const {
  PROJECT,
  BRANCH,
  WORKFLOW,
  PRODUCER,
  CONSUMER,
  ARTIFACT,
  context,
  identity,
  producerRecord,
  authenticateProducer,
  verifyPlan,
} = require('./circleci-pilot.cjs');

const uuid = n => `${String(n).padStart(8, '0')}-0000-0000-0000-000000000000`;
const sha = 'a'.repeat(64);
const configuration = { source: 'reviewed source', compiled: 'approved compiled' };
const configurationSha256 = createHash('sha256')
  .update(`${JSON.stringify(configuration, null, 2)}\n`)
  .digest('hex');
const ctx = {
  project: PROJECT,
  branch: BRANCH,
  tag: '',
  revision: 'b'.repeat(40),
  pipelineId: uuid(1),
  workflowId: uuid(2),
  jobId: uuid(4),
  pipelineNumber: 9,
  jobNumber: 12,
  configurationSha256,
};
function fixture() {
  const workflow = {
    id: ctx.workflowId,
    pipeline_id: ctx.pipelineId,
    pipeline_number: ctx.pipelineNumber,
    project_slug: PROJECT,
    name: WORKFLOW,
    status: 'running',
  };
  const pipeline = {
    id: ctx.pipelineId,
    number: ctx.pipelineNumber,
    project_slug: PROJECT,
    errors: [],
    vcs: {
      revision: ctx.revision,
      branch: BRANCH,
      provider_name: 'GitHub',
      origin_repository_url: 'https://github.com/redbox-mint/redbox-portal',
      target_repository_url: 'https://github.com/redbox-mint/redbox-portal',
    },
  };
  const config = structuredClone(configuration);
  const producer = {
    id: uuid(3),
    name: PRODUCER,
    job_number: 11,
    status: 'success',
    type: 'build',
    project_slug: PROJECT,
  };
  const consumer = {
    id: uuid(4),
    name: CONSUMER,
    job_number: ctx.jobNumber,
    status: 'running',
    type: 'build',
    project_slug: PROJECT,
  };
  const jobs = [producer, consumer];
  const details = Object.fromEntries(
    jobs.map(job => [job.id, { ...job, project_id: uuid(5), pipeline_id: ctx.pipelineId, workflow_id: ctx.workflowId }])
  );
  const record = producerRecord({ ...ctx, jobId: producer.id, jobNumber: producer.job_number }, producer.id, sha);
  const client = {
    workflow: async () => structuredClone(workflow),
    pipeline: async () => structuredClone(pipeline),
    configuration: async () => structuredClone(config),
    jobs: async () => structuredClone(jobs),
    job: async id => structuredClone(details[id]),
    artifact: async (project, number, artifact) => {
      assert.equal(project, PROJECT);
      assert.equal(number, 11);
      assert.equal(artifact, ARTIFACT);
      return structuredClone(record);
    },
  };
  return { workflow, pipeline, config, jobs, details, record, client };
}

test('authenticates an exact successful producer and running consumer', async () => {
  const f = fixture();
  assert.deepEqual(await authenticateProducer(f.client, ctx), { identity: identity(ctx, 11), receiptSha256: sha });
});

for (const [label, change] of [
  [
    'other project',
    f => {
      f.workflow.project_slug = 'gh/other/repo';
    },
  ],
  [
    'other revision',
    f => {
      f.pipeline.vcs.revision = 'c'.repeat(40);
    },
  ],
  [
    'tagged pipeline',
    f => {
      f.pipeline.vcs.tag = 'v1';
    },
  ],
  [
    'fork origin',
    f => {
      f.pipeline.vcs.origin_repository_url = 'https://github.com/other/redbox-portal';
    },
  ],
  [
    'changed configuration',
    f => {
      f.config.compiled = 'unapproved';
    },
  ],
  [
    'dynamic setup',
    f => {
      f.config.setup_config = 'unapproved setup';
    },
  ],
  [
    'wrong workflow',
    f => {
      f.workflow.name = 'other';
    },
  ],
  [
    'failed producer',
    f => {
      f.jobs[0].status = 'failed';
    },
  ],
  [
    'ambiguous producer',
    f => {
      f.jobs.push({ ...f.jobs[0] });
    },
  ],
  [
    'wrong consumer',
    f => {
      f.jobs[1].job_number = 13;
    },
  ],
  [
    'foreign job workflow',
    f => {
      f.details[f.jobs[0].id].workflow_id = uuid(8);
    },
  ],
  [
    'foreign project identity',
    f => {
      f.details[f.jobs[0].id].project_id = uuid(8);
    },
  ],
  [
    'forged receipt digest',
    f => {
      f.record.receiptSha256 = 'not-a-digest';
    },
  ],
  [
    'wrong receipt attempt',
    f => {
      f.record.identity.attempt = 10;
    },
  ],
  [
    'unexpected receipt field',
    f => {
      f.record.extra = true;
    },
  ],
])
  test(`rejects ${label}`, async () => {
    const f = fixture();
    change(f);
    await assert.rejects(authenticateProducer(f.client, ctx));
  });

test('rejects a producer whose status changes during artifact retrieval', async () => {
  const f = fixture(),
    original = f.client.artifact;
  f.client.artifact = async (...args) => {
    const result = await original(...args);
    f.details[f.jobs[0].id].status = 'failed';
    return result;
  };
  await assert.rejects(authenticateProducer(f.client, ctx));
});

test('context rejects unapproved branches, tags and malformed identity', () => {
  assert.throws(() => context({ ...ctx, branch: 'develop' }));
  assert.throws(() => context({ ...ctx, tag: 'v1' }));
  assert.throws(() => context({ ...ctx, revision: 'short' }));
});

function planFixture() {
  const id = identity(ctx, 11),
    root = '/tmp/source',
    output = '/tmp/output',
    stage = `${output}/web-assets`;
  const plan = {
    schemaVersion: 1,
    contract: 'redbox-shared-web-assets-pilot-v1',
    identity: id,
    consumerPlatform: 'linux/arm64',
    producerPlatform: 'linux/amd64',
    receiptSha256: sha,
    assets: { manifestSha256: sha },
    stage,
    invocation: {
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
        `SOURCE_REVISION=${id.revision}`,
        '--build-arg',
        `WEB_ASSETS_MANIFEST_SHA256=${sha}`,
        '--build-context',
        `web-assets=${stage}`,
        '--output',
        `type=oci,dest=${output}/image.oci.tar`,
        root,
      ],
      cwd: root,
      shell: false,
    },
  };
  const expected = { identity: id, receiptSha256: sha, manifestSha256: sha, root, output };
  return { plan, expected };
}
const bytes = value => Buffer.from(JSON.stringify(value));
const hash = value => createHash('sha256').update(value).digest('hex');
test('accepts only the fixed shell-free runtime build plan', () => {
  const { plan, expected } = planFixture(),
    data = bytes(plan);
  assert.deepEqual(verifyPlan(data, hash(data), expected), plan.invocation);
  assert.throws(() => verifyPlan(data, 'f'.repeat(64), expected), /checksum/);
  for (const mutate of [
    p => {
      p.invocation.shell = true;
    },
    p => {
      p.invocation.args.push('--push');
    },
    p => {
      p.invocation.args[p.invocation.args.length - 1] = '/other';
    },
    p => {
      p.stage = '/other';
    },
    p => {
      p.consumerPlatform = 'linux/amd64';
    },
    p => {
      p.identity.attempt++;
    },
  ]) {
    const changed = structuredClone(plan);
    mutate(changed);
    const altered = bytes(changed);
    assert.throws(() => verifyPlan(altered, hash(altered), expected));
  }
});
