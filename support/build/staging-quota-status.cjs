// A dry run may tolerate an absent image only with evidence that its producer
// skipped staging for quota in this same pipeline. Never used by real releases.
async function skipped(variant, arch, env = process.env, fetcher = fetch) {
  const project = 'gh/redbox-mint/redbox-portal';
  if (!/^(runtime|pdfgen)$/.test(variant) || !/^(amd64|arm64)$/.test(arch) ||
      !/^[a-f0-9-]{36}$/.test(env.CIRCLE_WORKFLOW_ID ?? '')) return false;
  const get = async url => {
    const response = await fetcher(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Staging quota evidence unavailable: HTTP ${response.status}`);
    return response;
  };
  const jobs = await (await get(`https://circleci.com/api/v2/workflow/${env.CIRCLE_WORKFLOW_ID}/job`)).json();
  const name = variant === 'runtime' && arch === 'amd64' ? 'build-1' : `stage-${variant}-${arch}`;
  const job = jobs.items.find(job => job.name === name && job.status === 'success');
  if (!job) return false;
  const artifacts = await (await get(`https://circleci.com/api/v2/project/${project}/${job.job_number}/artifacts`)).json();
  const artifact = artifacts.items.find(item => item.path === `ci-staging-status/${variant}-${arch}`);
  if (!artifact) return false;
  const text = await (await get(artifact.url)).text();
  return text === `${env.CIRCLE_SHA1}\n${env.STAGING_RUN_ID}\nquota-skipped\n`;
}
module.exports = { skipped };
if (require.main === module) {
  skipped(...process.argv.slice(2)).then(value => { process.exitCode = value ? 0 : 1; }).catch(error => {
    console.error(error.message); process.exitCode = 1;
  });
}
