#!/usr/bin/env node
// Local command measurements and read-only CircleCI API reporting. No publishing APIs.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

function gitRevision() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { return null; }
}

async function measure(args) {
  const separator = args.indexOf('--');
  const [label, ...options] = args.slice(0, separator);
  const command = args.slice(separator + 1);
  if (separator < 1 || !/^[\w-]+$/.test(label) || !command.length ||
      (options.length && (options.length !== 2 || options[0] !== '--artifact'))) {
    throw new Error('Usage: run LABEL [--artifact PATH] -- COMMAND [ARG ...]');
  }
  const directory = path.resolve('.tmp/ci-performance');
  fs.mkdirSync(directory, { recursive: true });
  const memoryPath = path.join(directory, `${label}.memory`);
  const started = new Date();
  const clock = process.hrtime.bigint();
  // GNU time measures the local client process tree, never the remote Docker daemon.
  const useTime = process.platform === 'linux' && fs.existsSync('/usr/bin/time');
  const child = spawn(useTime ? '/usr/bin/time' : command[0], useTime
    ? ['-f', '%M', '-o', memoryPath, '--', ...command] : command.slice(1),
  { stdio: ['inherit', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  const cached = new Set();
  const executed = new Set();
  const signals = ['SIGINT', 'SIGTERM'];
  let cancellationSignal = null;
  let escalation = null;
  let outputError = null;
  const signalGroup = signal => {
    try {
      // GNU time is a parent of the measured command. Signal the entire
      // process group so cancellation reaches the command and its children.
      if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  const stopGroup = signal => {
    signalGroup(signal);
    // A child can ignore TERM/INT; do not leave a CI job hanging forever.
    if (!escalation) escalation = setTimeout(() => signalGroup('SIGKILL'), 1000);
  };
  const forward = (stream, destination) => {
    let pending = '';
    let broken = false;
    const count = line => {
      const match = line.match(/^#(\d+) (CACHED|DONE)(?: |$)/);
      if (match) (match[2] === 'CACHED' ? cached : executed).add(match[1]);
    };
    destination.on('error', error => {
      broken = true;
      outputError ||= error.code || 'OUTPUT_ERROR';
      stopGroup('SIGTERM');
    });
    stream.on('data', chunk => {
      if (!broken) destination.write(chunk);
      pending += chunk.toString();
      const lines = pending.split(/\r?\n/);
      pending = lines.pop();
      lines.forEach(count);
    });
    stream.on('end', () => { if (pending) count(pending); });
  };
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);
  const handlers = signals.map(signal => {
    const handler = () => {
      cancellationSignal ||= signal;
      stopGroup(signal);
    };
    process.on(signal, handler);
    return handler;
  });
  child.once('exit', (code, signal) => {
    // Descendants can retain stdout/stderr even after the immediate child exits.
    // Clean up before waiting for close, which otherwise waits on those pipes.
    if (cancellationSignal || outputError || signal || (code >= 128 && code <= 192)) signalGroup('SIGKILL');
  });
  const result = await new Promise(resolve => {
    child.on('error', error => resolve({ code: 127, error: error.code }));
    child.on('close', (code, signal) => resolve({ code, signal }));
  });
  if (escalation) clearTimeout(escalation);
  // The immediate child may exit while a descendant with closed stdio remains.
  if (cancellationSignal || result.signal || (result.code >= 128 && result.code <= 192)) signalGroup('SIGKILL');
  signals.forEach((signal, index) => process.removeListener(signal, handlers[index]));
  const exitCode = cancellationSignal ? 128 + os.constants.signals[cancellationSignal] : outputError ? 1
    : result.code ?? 128 + (os.constants.signals[result.signal] || 1);
  let peakMemory = null;
  if (useTime && fs.existsSync(memoryPath)) {
    const value = fs.readFileSync(memoryPath, 'utf8').trim().split('\n').pop();
    if (/^\d+$/.test(value)) peakMemory = Number(value);
    fs.unlinkSync(memoryPath);
  }
  let artifactBytes = null;
  if (options[1] && fs.existsSync(options[1])) artifactBytes = fs.statSync(options[1]).size;
  const report = {
    schema_version: 1, label,
    workflow_id: process.env.CIRCLE_WORKFLOW_ID || null,
    job: process.env.CIRCLE_JOB || null,
    job_number: process.env.CIRCLE_BUILD_NUM || null,
    revision: gitRevision(),
    pipeline_revision: process.env.CI_PIPELINE_REVISION || process.env.CIRCLE_SHA1 || null,
    branch: process.env.CIRCLE_BRANCH || null, tag: process.env.CIRCLE_TAG || null,
    executor: { platform: process.platform, architecture: os.arch(),
      resource_class: process.env.CI_RESOURCE_CLASS || null, node: process.version },
    started_at: started.toISOString(), stopped_at: new Date().toISOString(),
    duration_seconds: Number(process.hrtime.bigint() - clock) / 1e9,
    exit_code: exitCode, signal: result.signal || null, cancellation_signal: cancellationSignal,
    error: result.error || outputError || null,
    artifact_bytes: artifactBytes, peak_local_process_tree_rss_kib: peakMemory,
    remote_docker_peak_rss_kib: null,
    // DONE includes metadata/export operations: it is not a Docker layer miss count.
    buildkit_cached_operations: cached.size, buildkit_completed_operations: executed.size,
    credits: null,
  };
  fs.writeFileSync(path.join(directory, `${label}.json`), `${JSON.stringify(report, null, 2)}\n`);
  return exitCode;
}

async function getJson(endpoint) {
  const response = await fetch(`https://circleci.com/api/${endpoint}`, {
    headers: process.env.CIRCLE_TOKEN ? { 'Circle-Token': process.env.CIRCLE_TOKEN } : {},
    signal: AbortSignal.timeout(30000),
  });
  // Do not include response bodies, tokens, or signed console URLs in errors/reports.
  if (!response.ok) throw new Error(`CircleCI API returned HTTP ${response.status}`);
  return response.json();
}

async function getItems(endpoint, get = getJson) {
  const items = [];
  let token;
  do {
    const page = await get(endpoint + (token ? `?page-token=${encodeURIComponent(token)}` : ''));
    items.push(...page.items);
    token = page.next_page_token;
  } while (token);
  return items;
}

function seconds(start, stop) {
  return start && stop ? (Date.parse(stop) - Date.parse(start)) / 1000 : null;
}

async function workflowReport(id, get = getJson) {
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) throw new Error('report requires a workflow UUID');
  const workflow = await get(`v2/workflow/${id}`);
  const jobs = await getItems(`v2/workflow/${id}/job`, get);
  const report = {
    schema_version: 1, workflow_id: id, status: workflow.status,
    created_at: workflow.created_at, stopped_at: workflow.stopped_at,
    full_seconds: seconds(workflow.created_at, workflow.stopped_at),
    all_checks_seconds: null, jobs: [], credits: null,
  };
  for (const job of jobs) {
    const item = { name: job.name, status: job.status, job_number: job.job_number,
      dependencies: job.dependencies || [],
      start_from_workflow_seconds: seconds(workflow.created_at, job.started_at),
      execution_seconds: seconds(job.started_at, job.stopped_at),
      ready_to_start_seconds: null, steps: [], test_counts: null };
    const parents = (job.dependencies || []).map(parent => jobs.find(j => j.id === parent));
    if (parents.every(parent => parent?.stopped_at)) {
      const ready = parents.length ? new Date(Math.max(...parents.map(p => Date.parse(p.stopped_at)))).toISOString() : workflow.created_at;
      item.ready_to_start_seconds = seconds(ready, job.started_at);
    }
    if (job.job_number) {
      const slug = workflow.project_slug;
      // v1 uses github/bitbucket, while v2 project slugs use gh/bb.
      const project = slug.replace(/^gh\//, 'github/').replace(/^bb\//, 'bitbucket/');
      const detail = await get(`v1.1/project/${project}/${job.job_number}`);
      const jobDetail = await get(`v2/project/${slug}/job/${job.job_number}`);
      // API metadata retains the pipeline revision even after an explicit checkout.
      item.pipeline_revision = detail.vcs_revision || null;
      item.executor = { resource_class: jobDetail.executor?.resource_class || null,
        executor_type: jobDetail.executor?.type || null };
      item.steps = (detail.steps || []).map(step => ({ name: step.name,
        actions: (step.actions || []).map(action => ({ status: action.status,
          duration_seconds: action.run_time_millis == null ? null : action.run_time_millis / 1000 })) }));
      const tests = await getItems(`v2/project/${slug}/${job.job_number}/tests`, get);
      item.test_counts = {};
      for (const test of tests) item.test_counts[test.result] = (item.test_counts[test.result] || 0) + 1;
    }
    report.jobs.push(item);
  }
  const checks = jobs.filter(job => job.name.startsWith('test-') || job.name === 'generate-api-docs');
  if (checks.length && checks.every(job => job.status === 'success' && job.stopped_at)) {
    report.all_checks_seconds = seconds(workflow.created_at,
      new Date(Math.max(...checks.map(job => Date.parse(job.stopped_at)))).toISOString());
  }
  return report;
}

if (require.main === module) {
  const [mode, ...args] = process.argv.slice(2);
  (async () => {
    if (mode === 'run') process.exitCode = await measure(args);
    else if (mode === 'report') console.log(JSON.stringify(await workflowReport(args[0]), null, 2));
    else throw new Error('Usage: ci-performance.cjs run LABEL [--artifact PATH] -- COMMAND [ARG ...] | report WORKFLOW_UUID');
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { workflowReport, getItems };
