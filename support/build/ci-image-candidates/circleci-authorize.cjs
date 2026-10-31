'use strict';

// Read-only authentication. This deliberately supplies no promotion coordinator.
const { identity, json, sha256, PLATFORMS } = require('./candidates.cjs');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const isUUID = value => typeof value === 'string' && UUID.test(value);
const isDigest = value => typeof value === 'string' && DIGEST.test(value);
function check(ok, message) { if (!ok) throw new Error(message); }
const same = (a, b) => json(a) === json(b);

class CircleCIReadClient {
  constructor({ token, artifactOrigins, authenticatedArtifactOrigins = [], fetch: request = globalThis.fetch }) {
    check(Array.isArray(artifactOrigins) && artifactOrigins.length, 'explicit artifact HTTPS origin allowlist required');
    this.origins = new Set(artifactOrigins.map(value => {
      const url = new URL(value);
      check(url.protocol === 'https:' && url.origin === value, 'invalid artifact origin');
      return value;
    }));
    check(Array.isArray(authenticatedArtifactOrigins) && authenticatedArtifactOrigins.every(origin => this.origins.has(origin)),
      'authenticated artifact origins must be explicitly allowlisted');
    this.authenticatedOrigins = new Set(authenticatedArtifactOrigins);
    this.token = token;
    this.fetch = request;
  }
  async read(url, headers = {}) {
    // API reads reject redirects. Artifact redirects are checked separately below.
    const response = await this.fetch(url, { method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
    check(response.status === 200, `CircleCI read failed (HTTP ${response.status})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    check(bytes.length <= 4 * 1024 * 1024, 'CircleCI JSON exceeds size limit');
    return JSON.parse(bytes.toString('utf8'));
  }
  api(path) {
    check(/^\/(?:api\/v2\/|api\/v1\.1\/project\/)/.test(path) && !path.includes('..'), 'invalid CircleCI API path');
    return this.read(`https://circleci.com${path}`, this.token ? { 'Circle-Token': this.token } : {});
  }
  async pages(path) {
    const items = [], seen = new Set();
    let token;
    for (let page = 0; page < 100; page++) {
      const result = await this.api(`${path}${token ? `?page-token=${encodeURIComponent(token)}` : ''}`);
      check(Array.isArray(result.items), 'invalid CircleCI paginated response');
      items.push(...result.items);
      token = result.next_page_token;
      if (token == null || token === '') return items;
      check(typeof token === 'string' && !seen.has(token), 'missing or repeated CircleCI page token');
      seen.add(token);
    }
    throw new Error('CircleCI pagination limit exceeded');
  }
  workflow(id) { return this.api(`/api/v2/workflow/${id}`); }
  pipeline(id) { return this.api(`/api/v2/pipeline/${id}`); }
  configuration(id) { return this.api(`/api/v2/pipeline/${id}/config`); }
  jobs(id) { return this.pages(`/api/v2/workflow/${id}/job`); }
  job(id) { return this.api(`/api/v2/jobs/${id}`); }
  async artifact(projectSlug, jobNumber, artifactPath) {
    // Current v2 OpenAPI has /jobs/{job_id}, but no artifact-list operation.
    // v1.1 documents this job-specific artifact endpoint. No guessed v2 fallback.
    const [vcs, owner, repo] = projectSlug.split('/');
    check(vcs === 'gh' && owner && repo, 'only GitHub CircleCI projects supported');
    const artifacts = await this.api(`/api/v1.1/project/github/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${jobNumber}/artifacts`);
    check(Array.isArray(artifacts), 'invalid CircleCI artifact listing');
    const matches = artifacts.filter(item => item.path === artifactPath);
    check(matches.length === 1 && matches[0].node_index === 0, 'producer artifact missing, duplicated, or parallel node is ambiguous');
    let url = new URL(matches[0].url);
    for (let hop = 0; hop < 5; hop++) {
      check(url.protocol === 'https:' && !url.username && !url.password && !url.hash && this.origins.has(url.origin), 'unapproved artifact URL');
      // Authentication is recomputed per hop, NEVER forwarded to a signed CDN URL.
      // The default sends no token to artifact origins. Private artifact delivery
      // requires separately approved authenticatedArtifactOrigins.
      const headers = this.token && this.authenticatedOrigins.has(url.origin) ? { 'Circle-Token': this.token } : {};
      const response = await this.fetch(url.href, { method: 'GET', headers, redirect: 'manual', signal: AbortSignal.timeout(30000) });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        check(response.headers.get('location'), 'artifact redirect omitted Location');
        url = new URL(response.headers.get('location'), url);
        continue;
      }
      check(response.status === 200, `CircleCI artifact read failed (HTTP ${response.status})`);
      const bytes = Buffer.from(await response.arrayBuffer());
      check(bytes.length <= 1024 * 1024, 'producer receipt exceeds size limit');
      return JSON.parse(bytes.toString('utf8'));
    }
    throw new Error('artifact redirect limit exceeded');
  }
}

// Called in the native producer AFTER archive verification and all native checks.
// Store the output as a CircleCI artifact at the independently configured path.
// Workspace copies of this output are not accepted by the authorizer.
function producerReceipt({ identity: value, platform, catalogSha256, producer }) {
  const id = identity(value);
  check(PLATFORMS.includes(platform) && isDigest(catalogSha256), 'invalid producer catalog');
  check(producer && isUUID(producer.pipelineId) && isUUID(producer.jobId) &&
    producer.workflowId === id.workflow && Number.isSafeInteger(producer.jobNumber) && producer.jobNumber > 0 &&
    typeof producer.projectSlug === 'string', 'invalid producer job identity');
  return { schemaVersion: 1, identity: id, platform, catalogSha256, producer };
}

function createCircleCIAuthorizer({ client, trust }) {
  // trust MUST be loaded from protected code/config and current promoter identity,
  // never from promotion.json, its gate, an attached workspace or pipeline parameters.
  check(trust && isUUID(trust.pipelineId) && isUUID(trust.workflowId) && isUUID(trust.projectId), 'trusted CircleCI IDs required');
  check(typeof trust.projectSlug === 'string' && /^gh\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trust.projectSlug), 'trusted GitHub project required');
  check(Number.isSafeInteger(trust.promoterJobNumber) && trust.promoterJobNumber > 0, 'trusted current promoter job number required');
  check(typeof trust.workflowName === 'string' && trust.workflowName.length && isDigest(trust.configurationSha256), 'reviewed workflow and configuration digest required');
  check(same(Object.keys(trust.producers || {}).sort(), PLATFORMS), 'both trusted producer mappings required');
  const expected = structuredClone(trust);
  // Do not let a caller mutate the approval policy while network reads are pending.
  const approvedPolicy = structuredClone(expected.policy);
  identity(approvedPolicy?.identity);
  check(approvedPolicy.identity.workflow === expected.workflowId && approvedPolicy.identity.attempt === 1, 'stock CircleCI adapter permits attempt 1 only; use a new pipeline for replacement');
  check(Array.isArray(approvedPolicy.requiredChecks) && approvedPolicy.requiredChecks.length &&
    new Set(approvedPolicy.requiredChecks).size === approvedPolicy.requiredChecks.length &&
    approvedPolicy.requiredChecks.every(name => typeof name === 'string' && name.length), 'reviewed explicit validation names required');
  for (const producer of Object.values(expected.producers)) {
    check(approvedPolicy.requiredChecks.includes(producer.name) && typeof producer.artifactPath === 'string' && producer.artifactPath.length,
      'producer must be a required validation job with a fixed artifact path');
  }
  check(new Set(Object.values(expected.producers).map(item => item.name)).size === 2, 'distinct native producer jobs required');
  return async ({ policy, gate, fingerprint }) => {
    check(same(policy, approvedPolicy), 'promotion policy differs from independently approved policy');
    const id = identity(policy.identity);
    check(gate?.schemaVersion === 1 && gate.status === 'success' && same(gate.identity, id) &&
      gate.policySha256 === sha256(json(policy)), 'invalid gate identity or policy binding');
    check(same(Object.keys(gate.checks || {}).sort(), [...policy.requiredChecks].sort()) &&
      policy.requiredChecks.every(name => gate.checks[name] === 'success'), 'gate validation set differs from approved suite set');
    check(same(Object.keys(gate.candidates || {}).sort(), PLATFORMS) &&
      fingerprint === sha256(json({ policy, catalogs: gate.candidates })), 'gate fingerprint mismatch');
    const workflow = await client.workflow(expected.workflowId);
    check(workflow.id === expected.workflowId && workflow.pipeline_id === expected.pipelineId &&
      workflow.project_slug === expected.projectSlug && workflow.name === expected.workflowName &&
      workflow.pipeline_number === id.pipeline && workflow.status === 'running', 'workflow is not the current running promotion workflow');
    const pipeline = await client.pipeline(expected.pipelineId);
    const repositoryURL = `https://github.com/${expected.projectSlug.slice(3)}`;
    const vcs = pipeline.vcs;
    check(pipeline.id === expected.pipelineId && pipeline.project_slug === expected.projectSlug &&
      pipeline.number === id.pipeline && Array.isArray(pipeline.errors) && pipeline.errors.length === 0 &&
      vcs?.provider_name === 'GitHub' && vcs.revision === id.revision &&
      vcs.origin_repository_url === repositoryURL && vcs.target_repository_url === repositoryURL,
    'pipeline project, source revision, or repository provenance mismatch');
    const ref = vcs.tag && !vcs.branch ? `refs/tags/${vcs.tag}` : vcs.branch && !vcs.tag ? `refs/heads/${vcs.branch}` : null;
    check(ref === policy.gitRef, 'pipeline ref differs from approved source ref');
    const configuration = await client.configuration(expected.pipelineId);
    // Dynamic setup can execute before the continuation configuration. Until
    // its provenance is supported, reject it instead of authorizing only the
    // continuation and silently trusting unreviewed setup commands.
    check([configuration.setup_config, configuration.compiled_setup_config,
      configuration['setup-config'], configuration['compiled-setup-config']]
      .every(value => value == null || value === ''), 'dynamic setup configuration is not supported');
    check(typeof configuration.source === 'string' && typeof configuration.compiled === 'string' &&
      sha256(json({ source: configuration.source, compiled: configuration.compiled })) === expected.configurationSha256,
    'pipeline configuration is not independently approved');
    const jobs = await client.jobs(expected.workflowId);
    const select = name => {
      const matches = jobs.filter(job => job.name === name);
      check(matches.length === 1, `missing or ambiguous workflow job: ${name}`);
      return matches[0];
    };
    const promoter = jobs.find(job => job.job_number === expected.promoterJobNumber);
    check(promoter && jobs.filter(job => job.job_number === expected.promoterJobNumber).length === 1 &&
      promoter.status === 'running', 'current promoter job is not running');
    async function authenticateJob(job, status) {
      check(isUUID(job.id) && job.project_slug === expected.projectSlug && job.type === 'build' &&
        job.status === status && Number.isSafeInteger(job.job_number) && job.job_number > 0, 'workflow job is not an exact eligible build');
      const detail = await client.job(job.id);
      check(detail.id === job.id && detail.name === job.name && detail.job_number === job.job_number &&
        detail.type === 'build' && detail.status === status && detail.project_id === expected.projectId &&
        detail.pipeline_id === expected.pipelineId && detail.workflow_id === expected.workflowId,
      'job metadata mismatch or inherited rerun job');
    }
    await authenticateJob(promoter, 'running');
    for (const name of policy.requiredChecks) await authenticateJob(select(name), 'success');
    for (const platform of PLATFORMS) {
      const producer = expected.producers[platform], job = select(producer.name);
      const receipt = await client.artifact(expected.projectSlug, job.job_number, producer.artifactPath);
      const verified = producerReceipt(receipt);
      check(verified.schemaVersion === receipt.schemaVersion && same(verified.identity, id) && verified.platform === platform &&
        verified.catalogSha256 === gate.candidates[platform] && same(verified.producer, {
          projectSlug: expected.projectSlug, pipelineId: expected.pipelineId, workflowId: expected.workflowId,
          jobId: job.id, jobNumber: job.job_number,
        }), 'candidate catalog is not bound to the exact successful native producer artifact');
    }
    // Catch status changes during artifact reads; this is a snapshot, not a lock.
    for (const name of policy.requiredChecks) await authenticateJob(select(name), 'success');
    await authenticateJob(promoter, 'running');
    check((await client.workflow(expected.workflowId)).status === 'running', 'workflow stopped during authorization');
    return true;
  };
}

module.exports = { CircleCIReadClient, producerReceipt, createCircleCIAuthorizer };
