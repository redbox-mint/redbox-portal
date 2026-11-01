// Docker Hub metadata client. HEAD resolves immutable digests without spending
// pull allowance; only the tested-runtime identity check needs a manifest GET.
const { createHash } = require('node:crypto');
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const accept = 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json';

class RegistryError extends Error {
  constructor(message, code = 1) { super(message); this.code = code; }
}

function reference(value) {
  const match = /^(?:docker\.io\/)?([a-z0-9_./-]+)(?:@|:)([^/]+)$/.exec(value);
  if (!match) throw new RegistryError('Expected a Docker Hub repository:tag or repository@digest');
  return { repository: match[1].includes('/') ? match[1] : `library/${match[1]}`, version: match[2] };
}

async function client(repository, fetcher = fetch, log = console.error) {
  const headers = {};
  if (process.env.DOCKER_USER && process.env.DOCKER_PASS) {
    headers.Authorization = `Basic ${Buffer.from(`${process.env.DOCKER_USER}:${process.env.DOCKER_PASS}`).toString('base64')}`;
  }
  const auth = await fetcher(`https://auth.docker.io/token?service=registry.docker.io&scope=${encodeURIComponent(`repository:${repository}:pull`)}`, { headers, signal: AbortSignal.timeout(30000) });
  if (!auth.ok) throw new RegistryError(`Registry authentication failed: HTTP ${auth.status}`, auth.status === 429 ? 4 : 1);
  const { token } = await auth.json();
  if (typeof token !== 'string' || !token) throw new RegistryError('Missing registry bearer token');
  return async (path, method = 'GET') => {
    const response = await fetcher(`https://registry-1.docker.io/v2/${repository}/${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, Accept: accept }, signal: AbortSignal.timeout(30000),
    });
    const remaining = response.headers.get('ratelimit-remaining');
    const limit = response.headers.get('ratelimit-limit');
    log(`Registry ${method} ${repository}/${path}: HTTP ${response.status}; quota ${remaining ?? 'unknown'}/${limit ?? 'unknown'}`);
    if (response.status === 429) throw new RegistryError('Docker Hub pull quota exhausted (HTTP 429)', 4);
    if (response.status === 404) throw new RegistryError('Registry manifest unknown', 3);
    if (!response.ok) throw new RegistryError(`Registry request failed: HTTP ${response.status}`);
    return response;
  };
}

async function verifiedJson(response, expected) {
  const bytes = Buffer.from(await response.arrayBuffer());
  if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== expected) {
    throw new RegistryError('Registry content does not match its pinned digest');
  }
  return JSON.parse(bytes.toString('utf8'));
}

async function run(action, value, fetcher, log) {
  const { repository, version } = reference(value);
  const request = await client(repository, fetcher, log);
  if (action === 'head' || action === 'cache') {
    const response = await request(`manifests/${version}`, 'HEAD');
    // A successful HEAD still works when GET allowance has reached zero.
    if (action === 'cache' && /^0(?:;|$)/.test(response.headers.get('ratelimit-remaining') ?? '')) {
      throw new RegistryError('Docker Hub pull quota exhausted; cache reads disabled', 4);
    }
    const digest = response.headers.get('docker-content-digest');
    if (!digestPattern.test(digest)) throw new RegistryError('Invalid registry manifest digest');
    return digest;
  }
  if (action !== 'config' || !digestPattern.test(version)) throw new RegistryError('Config inspection requires a pinned digest');
  const manifest = await verifiedJson(await request(`manifests/${version}`), version);
  const config = manifest.config?.digest;
  if (!digestPattern.test(config)) throw new RegistryError('Expected a single-platform image manifest');
  return JSON.stringify({ ...await verifiedJson(await request(`blobs/${config}`), config), Id: config });
}

module.exports = { run, RegistryError };
if (require.main === module) {
  run(...process.argv.slice(2)).then(console.log).catch(error => {
    console.error(error.message);
    process.exitCode = error.code === 3 || error.code === 4 ? error.code : 1;
  });
}
