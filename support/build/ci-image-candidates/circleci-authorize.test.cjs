'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CircleCIReadClient, createCircleCIAuthorizer, producerReceipt } = require('./circleci-authorize.cjs');
const { json, sha256 } = require('./candidates.cjs');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function fixture() {
  const projectSlug = 'gh/example/portal', projectId = uuid(1), pipelineId = uuid(2), workflowId = uuid(3);
  const id = { revision: 'a'.repeat(40), pipeline: 20, workflow: workflowId, attempt: 1 };
  const configuration = { source: 'reviewed source', compiled: 'reviewed expansion' };
  const names = ['test-playwright', 'docs', 'prepare-amd64', 'prepare-arm64'];
  const jobs = [...names, 'promote'].map((name, i) => ({
    id: uuid(10 + i), name, job_number: 100 + i, type: 'build', project_slug: projectSlug,
    status: name === 'promote' ? 'running' : 'success', dependencies: [],
  }));
  const details = Object.fromEntries(jobs.map(job => [job.id, {
    ...job, project_id: projectId, pipeline_id: pipelineId, workflow_id: workflowId,
  }]));
  const policy = { identity: id, mode: 'branch', gitRef: 'refs/heads/develop', repository: 'registry.example/team/portal',
    tags: { runtime: 'develop', runtime_pdfgen: 'develop-pdfgen' }, requiredChecks: names };
  const catalogs = { 'linux/amd64': sha256('amd64 catalog'), 'linux/arm64': sha256('arm64 catalog') };
  const producers = Object.fromEntries(Object.keys(catalogs).map(platform => [platform, {
    name: `prepare-${platform.split('/')[1]}`, artifactPath: `ci-provenance/${platform.split('/')[1]}.json`,
  }]));
  const artifacts = {};
  for (const [platform, value] of Object.entries(producers)) {
    const job = jobs.find(item => item.name === value.name);
    artifacts[job.job_number] = producerReceipt({ identity: id, platform, catalogSha256: catalogs[platform], producer: {
      projectSlug, pipelineId, workflowId, jobId: job.id, jobNumber: job.job_number,
    } });
  }
  const state = {
    workflow: { id: workflowId, pipeline_id: pipelineId, pipeline_number: id.pipeline, project_slug: projectSlug,
      name: 'build-and-test', status: 'running' },
    pipeline: { id: pipelineId, number: id.pipeline, project_slug: projectSlug, errors: [], vcs: {
      provider_name: 'GitHub', revision: id.revision, branch: 'develop',
      origin_repository_url: 'https://github.com/example/portal', target_repository_url: 'https://github.com/example/portal',
    } }, configuration, jobs, details, artifacts,
  };
  const events = [];
  const client = {
    workflow: async () => structuredClone(state.workflow), pipeline: async () => structuredClone(state.pipeline),
    configuration: async () => structuredClone(state.configuration), jobs: async () => structuredClone(state.jobs),
    job: async id => structuredClone(state.details[id]),
    artifact: async (slug, number, path) => {
      events.push([slug, number, path]);
      return structuredClone(state.artifacts[number]);
    },
  };
  const trust = { projectSlug, projectId, pipelineId, workflowId, workflowName: 'build-and-test', promoterJobNumber: 104,
    configurationSha256: sha256(json(configuration)), producers, policy: structuredClone(policy) };
  const gate = { schemaVersion: 1, status: 'success', identity: id, policySha256: sha256(json(policy)),
    checks: Object.fromEntries(names.map(name => [name, 'success'])), candidates: catalogs };
  const request = { policy, gate, fingerprint: sha256(json({ policy, catalogs })) };
  return { state, trust, request, client, events, authorize: () => createCircleCIAuthorizer({ client, trust })(request) };
}

test('authenticates exact successful jobs and obtains each catalog from that producer job artifact', async () => {
  const f = fixture();
  assert.equal(await f.authorize(), true);
  assert.deepEqual(f.events, [
    ['gh/example/portal', 102, 'ci-provenance/amd64.json'],
    ['gh/example/portal', 103, 'ci-provenance/arm64.json'],
  ]);
});

test('gate cannot substitute destination, required suites, workflow, or producer catalog metadata', async t => {
  for (const [name, mutate] of Object.entries({
    destination: f => { f.request.policy.tags.runtime = 'latest'; },
    suite: f => { f.request.policy.requiredChecks.pop(); },
    workflow: f => { f.request.policy.identity.workflow = uuid(999); },
    catalog: f => {
      f.request.gate.candidates['linux/amd64'] = sha256('substituted workspace catalog');
      f.request.fingerprint = sha256(json({ policy: f.request.policy, catalogs: f.request.gate.candidates }));
    },
    metadata: f => { f.state.artifacts[102].producer.jobId = uuid(999); },
    platform: f => { f.state.artifacts[102].platform = 'linux/arm64'; },
    revision: f => { f.state.artifacts[102].identity.revision = 'b'.repeat(40); },
    attempt: f => { f.state.artifacts[102].identity.attempt = 2; },
    producerWorkflow: f => { f.state.artifacts[102].producer.workflowId = uuid(999); },
  })) await t.test(name, async () => {
    const f = fixture(); mutate(f);
    await assert.rejects(f.authorize());
  });
});

test('rejects stale, foreign, forked, ambiguous, unsuccessful, and inherited rerun jobs', async t => {
  for (const [name, mutate] of Object.entries({
    fork: f => { f.state.pipeline.vcs.origin_repository_url = 'https://github.com/attacker/portal'; },
    project: f => { f.state.pipeline.project_slug = 'gh/other/portal'; },
    revision: f => { f.state.pipeline.vcs.revision = 'b'.repeat(40); },
    pipeline: f => { f.state.pipeline.number++; },
    branch: f => { f.state.pipeline.vcs.branch = 'feature'; },
    tagAndBranch: f => { f.state.pipeline.vcs.tag = 'v1.0.0'; },
    config: f => { f.state.configuration.compiled = 'weakened validation'; },
    setupConfig: f => { f.state.configuration['setup-config'] = 'unreviewed setup'; },
    compiledSetupConfig: f => { f.state.configuration['compiled-setup-config'] = 'unreviewed setup expansion'; },
    apiSetupConfig: f => { f.state.configuration.setup_config = 'unreviewed setup'; },
    apiCompiledSetupConfig: f => { f.state.configuration.compiled_setup_config = 'unreviewed setup expansion'; },
    oldWorkflow: f => { f.state.workflow.pipeline_id = uuid(999); },
    canceled: f => { f.state.workflow.status = 'canceled'; },
    duplicate: f => { f.state.jobs.push({ ...f.state.jobs[0], id: uuid(99), status: 'failed' }); },
    missing: f => { f.state.jobs.shift(); },
    failed: f => { f.state.jobs[0].status = 'failed'; },
    reusedJobNumber: f => { f.state.details[f.state.jobs[0].id].job_number++; },
    inheritedPartialRerun: f => { f.state.details[f.state.jobs[0].id].workflow_id = uuid(999); },
    foreignProjectId: f => { f.state.details[f.state.jobs[0].id].project_id = uuid(999); },
    approvalIsNotValidation: f => { f.state.jobs[0].type = 'approval'; },
    promoterStopped: f => { f.state.details[f.state.jobs[4].id].status = 'canceled'; },
  })) await t.test(name, async () => {
    const f = fixture(); mutate(f);
    await assert.rejects(f.authorize());
  });
});

test('release/RC use the exact tag; manual mode uses the same authenticated suite gate', async () => {
  for (const mode of ['release', 'rc', 'manual']) {
    const f = fixture();
    if (mode !== 'manual') {
      delete f.state.pipeline.vcs.branch;
      f.state.pipeline.vcs.tag = mode === 'rc' ? 'v1.0.0-rc.1' : 'v1.0.0';
      f.request.policy.gitRef = `refs/tags/${f.state.pipeline.vcs.tag}`;
    }
    f.request.policy.mode = mode;
    f.trust.policy = structuredClone(f.request.policy);
    f.request.gate.policySha256 = sha256(json(f.request.policy));
    f.request.fingerprint = sha256(json({ policy: f.request.policy, catalogs: f.request.gate.candidates }));
    assert.equal(await f.authorize(), true);
    f.state.jobs[0].status = 'failed';
    await assert.rejects(f.authorize());
  }
});

test('rerun counter is not invented from API job numbers; trust cannot mutate after construction', async () => {
  const f = fixture();
  const authorize = createCircleCIAuthorizer({ client: f.client, trust: f.trust });
  f.trust.policy.tags.runtime = 'different';
  assert.equal(await authorize(f.request), true);
  f.trust.policy.identity.attempt = 2;
  assert.throws(() => createCircleCIAuthorizer({ client: f.client, trust: f.trust }), /attempt 1 only/);
});

test('API status changes during artifact download fail closed', async () => {
  const f = fixture(), original = f.client.artifact;
  f.client.artifact = async (...args) => {
    const receipt = await original(...args);
    f.state.details[f.state.jobs[0].id].status = 'failed';
    return receipt;
  };
  await assert.rejects(f.authorize(), /job metadata mismatch/);
});

test('HTTP client uses v2 exact-job metadata and v1.1 artifacts, follows pagination and keeps tokens off CDN requests', async () => {
  const calls = [];
  const client = new CircleCIReadClient({ token: 'test-token', artifactOrigins: ['https://artifacts.example'], fetch: async (url, options) => {
    calls.push({ url, options });
    const value = url.includes('/job?') ? { items: [{ name: 'second' }] } :
      url.endsWith('/job') ? { items: [{ name: 'first' }], next_page_token: 'page/2' } :
        url.endsWith('/artifacts') ? [{ path: 'catalog.json', node_index: 0, url: 'https://artifacts.example/catalog' }] :
          url.endsWith('/catalog') ? { catalogSha256: sha256('catalog') } : { id: uuid(10) };
    return new Response(JSON.stringify(value), { status: 200 });
  } });
  assert.equal((await client.jobs(uuid(3))).length, 2);
  await client.job(uuid(10));
  assert.equal((await client.artifact('gh/example/portal', 102, 'catalog.json')).catalogSha256, sha256('catalog'));
  assert.ok(calls.some(call => call.url === `https://circleci.com/api/v2/jobs/${uuid(10)}`));
  assert.ok(calls.some(call => call.url.includes('/api/v1.1/project/github/example/portal/102/artifacts')));
  assert.ok(calls.every(call => call.options.method === 'GET'));
  assert.ok(calls.slice(0, -1).every(call => call.options.redirect === 'error'));
  assert.equal(calls.at(-1).options.redirect, 'manual');
  assert.equal(calls.at(-1).options.headers['Circle-Token'], undefined);
  assert.equal(calls[0].options.headers['Circle-Token'], 'test-token');
});

test('private artifact redirects authenticate only approved CircleCI origins and validate each CDN hop', async () => {
  const calls = [];
  const client = new CircleCIReadClient({ token: 'test-token',
    artifactOrigins: ['https://artifacts.example', 'https://cdn.example'],
    authenticatedArtifactOrigins: ['https://artifacts.example'], fetch: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/artifacts')) return new Response(JSON.stringify([
        { path: 'catalog.json', node_index: 0, url: 'https://artifacts.example/file' },
      ]));
      if (url === 'https://artifacts.example/file') return new Response('', { status: 302, headers: { Location: 'https://cdn.example/file?signed=not-a-real-secret' } });
      return new Response('{"ok":true}');
    } });
  assert.deepEqual(await client.artifact('gh/example/portal', 102, 'catalog.json'), { ok: true });
  assert.equal(calls[1].options.headers['Circle-Token'], 'test-token');
  assert.equal(calls[2].options.headers['Circle-Token'], undefined);
  client.fetch = async url => url.endsWith('/artifacts') ? new Response(JSON.stringify([
    { path: 'catalog.json', node_index: 0, url: 'https://artifacts.example/file' },
  ])) : new Response('', { status: 302, headers: { Location: 'https://evil.example/file' } });
  await assert.rejects(client.artifact('gh/example/portal', 102, 'catalog.json'), /unapproved artifact URL/);
});

test('HTTP client rejects rate limits, malformed pagination, unapproved URLs and ambiguous artifacts', async () => {
  for (const value of [
    [], [{ path: 'catalog.json', node_index: 1, url: 'https://artifacts.example/file' }],
    [{ path: 'catalog.json', node_index: 0, url: 'https://evil.example/file' }],
    [{ path: 'catalog.json', node_index: 0, url: 'http://artifacts.example/file' }],
    [0, 1].map(() => ({ path: 'catalog.json', node_index: 0, url: 'https://artifacts.example/file' })),
  ]) {
    const client = new CircleCIReadClient({ artifactOrigins: ['https://artifacts.example'],
      fetch: async () => new Response(JSON.stringify(value), { status: 200 }) });
    await assert.rejects(client.artifact('gh/example/portal', 102, 'catalog.json'));
  }
  for (const status of [401, 403, 404, 429, 500]) {
    const client = new CircleCIReadClient({ artifactOrigins: ['https://artifacts.example'], fetch: async () => new Response('', { status }) });
    await assert.rejects(client.job(uuid(10)), new RegExp(String(status)));
  }
  const client = new CircleCIReadClient({ artifactOrigins: ['https://artifacts.example'],
    fetch: async () => new Response(JSON.stringify({ items: [], next_page_token: 'same' })) });
  await assert.rejects(client.jobs(uuid(3)), /repeated/);
});

test('producer CLI pins a verified candidate to current CI identity; authorization rejects substituted catalog roots', async t => {
  const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
  const { prepare } = require('./candidates.cjs');
  const { main } = require('./circleci-producer-receipt.cjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'circleci-producer-'));
  t.after(() => fs.rm(root, { force: true, recursive: true }));
  const f = fixture(), id = f.request.policy.identity;
  const platform = 'linux/amd64', images = new Map();
  const docker = {
    nativePlatform: async () => platform, versions: async () => ({ docker: 'test-engine', buildx: 'test-buildx' }),
    createBuilder: async () => {}, removeBuilder: async () => {},
    build: async options => images.set(options.reference, {
      id: sha256(options.target), platform, labels: options.labels,
    }),
    inspect: async reference => images.get(reference),
    evidence: async () => ({ node: '22.1.0', assetSha256: sha256('assets'), assetFiles: 2 }),
    save: async (ids, file) => fs.writeFile(file, JSON.stringify(ids)),
  };
  const result = await prepare({ root: path.join(root, 'workspace'), context: path.join(root, 'source'),
    identity: id, platform, toolchain: { node: '22.1.0', npm: '10.1.0', typescript: '5.9.3' } }, {
    docker, git: { revision: async () => id.revision, clean: async () => true },
  });
  const requestFile = path.join(root, 'result.json');
  await fs.writeFile(requestFile, json({ ...result, platform }));
  const env = { CIRCLE_SHA1: id.revision, REDBOX_CIRCLE_PIPELINE_NUMBER: String(id.pipeline),
    CIRCLE_WORKFLOW_ID: id.workflow, REDBOX_CIRCLE_PIPELINE_ID: f.trust.pipelineId, CIRCLE_BUILD_NUM: '102',
    CIRCLE_WORKFLOW_JOB_ID: f.state.jobs[2].id, CIRCLE_PROJECT_USERNAME: 'example', CIRCLE_PROJECT_REPONAME: 'portal' };
  let output;
  const receipt = await main([requestFile], { env, stdout: { write: value => { output = value; } } });
  assert.deepEqual(JSON.parse(output), receipt);
  f.state.artifacts[102] = receipt;
  f.request.gate.candidates[platform] = receipt.catalogSha256;
  f.request.fingerprint = sha256(json({ policy: f.request.policy, catalogs: f.request.gate.candidates }));
  assert.equal(await f.authorize(), true);
  f.request.gate.candidates[platform] = sha256('workspace replaced both metadata and archive');
  f.request.fingerprint = sha256(json({ policy: f.request.policy, catalogs: f.request.gate.candidates }));
  await assert.rejects(f.authorize(), /producer artifact/);
  await assert.rejects(main([requestFile], { env: { ...env, CIRCLE_SHA1: 'b'.repeat(40) }, stdout: { write() {} } }), /revision\/workflow\/attempt mismatch/);
  const catalog = JSON.parse(await fs.readFile(path.join(result.directory, 'candidate.json')));
  await fs.appendFile(path.join(result.directory, catalog.archive.file), 'corrupted');
  await assert.rejects(main([requestFile], { env, stdout: { write() {} } }), /checksum|archive/);
});
