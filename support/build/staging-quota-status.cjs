// Carry the successful producer attempt's verified digest to downstream jobs.
// Only dry runs may accept its explicit quota or credential skip result.
async function result(variant, arch, env = process.env, fetcher = fetch) {
  const project = 'gh/redbox-mint/redbox-portal';
  if (!/^(runtime|pdfgen)$/.test(variant) || !/^(amd64|arm64)$/.test(arch) ||
      !/^[a-f0-9-]{36}$/.test(env.CIRCLE_WORKFLOW_ID ?? '')) return null;
  if (!env.CIRCLE_TOKEN) throw new Error('CIRCLE_TOKEN is required to retrieve staging producer evidence');
  const get = async url => {
    const response = await fetcher(url, {
      headers: { 'Circle-Token': env.CIRCLE_TOKEN },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Staging producer evidence unavailable: HTTP ${response.status}`);
    return response;
  };
  const list = async url => {
    const items = [];
    let token;
    do {
      const page = await (await get(url + (token ? `?page-token=${encodeURIComponent(token)}` : ''))).json();
      items.push(...page.items);
      token = page.next_page_token;
    } while (token);
    return items;
  };
  const jobs = await list(`https://circleci.com/api/v2/workflow/${env.CIRCLE_WORKFLOW_ID}/job`);
  const name = variant === 'runtime' && arch === 'amd64' ? 'build-1' : `stage-${variant}-${arch}`;
  const job = jobs.filter(job => job.name === name && job.status === 'success').sort((a, b) => b.job_number - a.job_number)[0];
  if (!job) return null;
  const artifacts = await list(`https://circleci.com/api/v2/project/${project}/${job.job_number}/artifacts`);
  const artifact = artifacts.find(item => item.path === `ci-staging-status/${variant}-${arch}`);
  if (!artifact) return null;
  const text = await (await get(artifact.url)).text();
  const fields = text.split('\n');
  const [sha, run, state, digest, end] = fields;
  if (sha !== env.CIRCLE_SHA1 || run !== env.STAGING_RUN_ID) return null;
  if (['quota-skipped', 'credential-skipped'].includes(state) && digest === '' && fields.length === 4) return { state };
  if (state === 'verified' && fields.length === 5 && /^sha256:[a-f0-9]{64}$/.test(digest) && end === '') return { state, digest };
  return null;
}
async function skipped(...args) { return (await result(...args))?.state === 'quota-skipped'; }
module.exports = { skipped, result };
if (require.main === module) {
  result(...process.argv.slice(2)).then(value => {
    if (!value) throw new Error('Missing or invalid successful-producer staging artifact');
    console.log(value.state === 'verified' ? value.digest : value.state);
  }).catch(error => {
    console.error(error.message); process.exitCode = 1;
  });
}
