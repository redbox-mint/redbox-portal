'use strict';

// A durable journal building block, NOT an exclusive coordinator. There is no
// withExclusive export: OCI Distribution + CircleCI serial-group do not provide
// fencing for a registry request left in flight by a canceled job.
const { identity, json, sha256 } = require('./candidates.cjs');
const MEDIA = 'application/vnd.oci.image.index.v1+json';
const PREFIX = 'ci-watermark-v1-';
const MARKER = `${PREFIX}initialized`;
const KEY = 'org.redbox.ci.promotion-record';
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const TAG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
function check(ok, message) { if (!ok) throw new Error(message); }

function index(value) {
  return json({ schemaVersion: 2, mediaType: MEDIA, manifests: [], annotations: { [KEY]: json(value) } });
}
function markerManifest(repository) {
  return index({ schemaVersion: 1, repository, kind: 'promotion-watermark-initialized' });
}
function recordValue(repository, reservation) {
  const id = identity(reservation.identity);
  check(typeof reservation.fingerprint === 'string' && DIGEST.test(reservation.fingerprint) &&
    Array.isArray(reservation.destinations) && reservation.destinations.length > 0 &&
    reservation.destinations.every(tag => typeof tag === 'string' && TAG.test(tag)) &&
    new Set(reservation.destinations).size === reservation.destinations.length, 'invalid watermark reservation');
  return { schemaVersion: 1, repository, identity: id, fingerprint: reservation.fingerprint,
    destinations: [...reservation.destinations].sort() };
}
function recordTag(record) {
  return `${PREFIX}${record.identity.pipeline}-${record.identity.attempt}-${sha256(json(record)).slice(7)}`;
}
function compare(a, b) {
  return a.pipeline === b.pipeline ? Math.sign(a.attempt - b.attempt) : Math.sign(a.pipeline - b.pipeline);
}

class RegistryWatermark {
  constructor({ repository, store }) {
    check(typeof repository === 'string' && /^[a-z0-9][a-z0-9.:-]*\/[a-z0-9][a-z0-9._/-]*$/.test(repository), 'fully qualified registry repository required');
    this.repository = repository;
    this.store = store;
  }
  async read() {
    const tags = await this.store.listTags();
    check(Array.isArray(tags) && tags.every(tag => typeof tag === 'string'), 'invalid registry tag inventory');
    check(tags.includes(MARKER), 'watermark is not initialized; missing state must never bootstrap automatically');
    check(await this.store.getManifest(MARKER) === markerManifest(this.repository), 'watermark initialization marker mismatch');
    const records = [], destinations = Object.create(null), orders = new Map();
    for (const tag of new Set(tags.filter(tag => tag.startsWith(PREFIX) && tag !== MARKER))) {
      const bytes = await this.store.getManifest(tag);
      const manifest = JSON.parse(bytes);
      check(manifest.schemaVersion === 2 && manifest.mediaType === MEDIA &&
        Array.isArray(manifest.manifests) && manifest.manifests.length === 0 &&
        typeof manifest.annotations?.[KEY] === 'string', 'invalid registry watermark manifest');
      const value = JSON.parse(manifest.annotations[KEY]);
      check(value.schemaVersion === 1 && value.repository === this.repository, 'invalid registry watermark repository or schema');
      const record = recordValue(this.repository, value);
      check(json(record) === json(value) && recordTag(record) === tag && index(record) === bytes,
        'registry watermark content or repository was substituted');
      records.push(record);
      for (const destination of record.destinations) {
        const previous = destinations[destination];
        // Conflicting same-order records fail even if a still-newer record exists.
        const orderKey = json([destination, record.identity.pipeline, record.identity.attempt]);
        const other = orders.get(orderKey);
        check(!other || record.fingerprint === other.fingerprint && json(record.identity) === json(other.identity),
          'conflicting same-order watermark records');
        orders.set(orderKey, record);
        if (!previous || compare(record.identity, previous.identity) > 0) destinations[destination] = record;
      }
    }
    return { records, destinations };
  }
  async recordReservation(reservation) {
    // Caller needs a REAL whole-publication exclusion/fencing guarantee. This
    // read/append/read sequence is neither CAS nor a lock and cannot supply it.
    const next = recordValue(this.repository, reservation);
    const validate = state => {
      for (const destination of next.destinations) {
        const previous = state.destinations[destination];
        if (!previous) continue;
        const order = compare(next.identity, previous.identity);
        check(order >= 0, `stale promotion for ${destination}`);
        check(order !== 0 || next.fingerprint === previous.fingerprint && json(next.identity) === json(previous.identity),
          `same-order fingerprint or workflow changed for ${destination}`);
      }
    };
    const state = await this.read();
    validate(state);
    const tag = recordTag(next), bytes = index(next);
    if (!state.records.some(record => json(record) === json(next))) await this.store.putManifest(tag, bytes);
    check(await this.store.getManifest(tag) === bytes, 'watermark reservation did not persist exactly');
    validate(await this.read());
    return { tag, digest: sha256(bytes), record: next };
  }
}

// Actual OCI Distribution HTTP operations, with an injected registry-scoped
// Authorization value. No Docker credential discovery, token negotiation, DELETE,
// registry login or automatic initialization. Constructing this class does no IO.
class DistributionWatermarkStore {
  constructor({ origin, repositoryPath, authorization, fetch: request = globalThis.fetch }) {
    const url = new URL(origin);
    check(url.protocol === 'https:' && url.origin === origin &&
      typeof repositoryPath === 'string' && /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/.test(repositoryPath),
    'explicit HTTPS registry origin and repository path required');
    this.base = `${origin}/v2/${repositoryPath}`;
    this.authorization = authorization;
    this.fetch = request;
  }
  async request(url, options = {}) {
    const headers = { Accept: MEDIA, ...options.headers };
    if (this.authorization) headers.Authorization = this.authorization;
    const result = await this.fetch(url, { ...options, headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
    check(result.status === (options.method === 'PUT' ? 201 : 200), `registry watermark request failed (HTTP ${result.status})`);
    return result;
  }
  async listTags() {
    const tags = [], seen = new Set();
    let url = `${this.base}/tags/list?n=100`;
    for (let page = 0; page < 10000; page++) {
      check(!seen.has(url), 'registry pagination cycle');
      seen.add(url);
      const response = await this.request(url);
      const body = await response.json();
      check(Array.isArray(body.tags), 'registry omitted tag inventory');
      tags.push(...body.tags);
      const link = response.headers.get('link');
      if (!link) return tags;
      const match = /^<([^>]+)>;\s*rel="next"$/.exec(link);
      check(match, 'unsupported registry pagination Link');
      const next = new URL(match[1], url);
      check(next.origin === new URL(this.base).origin && next.pathname === `${new URL(this.base).pathname}/tags/list` &&
        !next.username && !next.password && !next.hash, 'registry pagination escaped repository');
      url = next.href;
    }
    throw new Error('registry pagination limit exceeded');
  }
  async getManifest(tag) {
    check(typeof tag === 'string' && TAG.test(tag), 'invalid watermark tag');
    const response = await this.request(`${this.base}/manifests/${tag}`);
    const bytes = await response.text();
    check(bytes.length <= 1024 * 1024 && response.headers.get('docker-content-digest') === sha256(bytes), 'registry watermark manifest digest mismatch');
    return bytes;
  }
  async putManifest(tag, bytes) {
    check(typeof tag === 'string' && tag.startsWith(PREFIX) && tag !== MARKER && TAG.test(tag), 'only immutable reservation tags can be appended');
    const response = await this.request(`${this.base}/manifests/${tag}`, {
      method: 'PUT', headers: { 'Content-Type': MEDIA }, body: bytes,
    });
    check(response.headers.get('docker-content-digest') === sha256(bytes), 'registry did not acknowledge exact watermark digest');
  }
}

module.exports = { RegistryWatermark, DistributionWatermarkStore, markerManifest, MARKER, PREFIX, MEDIA };
