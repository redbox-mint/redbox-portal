const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { run } = require('./docker-registry.cjs');
const { skipped, result } = require('./staging-quota-status.cjs');
const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const config = JSON.stringify({ rootfs: { diff_ids: [`sha256:${'a'.repeat(64)}`] } });
const configId = digest(config);
const manifest = JSON.stringify({ config: { digest: configId } });
const id = digest(manifest);

function registry({ quota = '20;w=21600', headStatus = 200, corruptManifest = false, corruptConfig = false } = {}) {
  const calls = [];
  return { calls, fetcher: async (url, options) => {
    calls.push({ url, method: options.method ?? 'GET' });
    if (url.startsWith('https://auth.docker.io/')) return Response.json({ token: 'private-token' });
    if (options.method === 'HEAD') return new Response(null, { status: headStatus, headers: {
      'docker-content-digest': id, 'ratelimit-remaining': quota, 'ratelimit-limit': '200;w=21600',
    } });
    if (url.includes('/manifests/')) return new Response(corruptManifest ? '{}' : manifest);
    return new Response(corruptConfig ? '{}' : config);
  } };
}

test('tag resolution uses HEAD only, with no pull-counting manifest GET', async () => {
  const mock = registry();
  assert.equal(await run('head', 'example/portal:ci-staging-tag', mock.fetcher, () => {}), id);
  assert.deepEqual(mock.calls.map(call => call.method), ['GET', 'HEAD']);
  assert.equal(mock.calls.filter(call => call.url.includes('/manifests/') && call.method === 'GET').length, 0);
});

test('runtime inspection GETs a pinned manifest once and verifies manifest and config content digests', async () => {
  const mock = registry();
  assert.deepEqual(JSON.parse(await run('config', `example/portal@${id}`, mock.fetcher, () => {})), { ...JSON.parse(config), Id: configId });
  assert.deepEqual(mock.calls.slice(1).map(call => call.url.split('/portal/')[1]), [`manifests/${id}`, `blobs/${configId}`]);
  for (const overrides of [{ corruptManifest: true }, { corruptConfig: true }]) {
    await assert.rejects(run('config', `example/portal@${id}`, registry(overrides).fetcher, () => {}), /pinned digest/);
  }
});

test('HEAD works at zero allowance; cache preflight and HTTP 429 distinguish quota from missing/auth/network errors', async () => {
  assert.equal(await run('head', 'example/portal:tag', registry({ quota: '0;w=21600' }).fetcher, () => {}), id);
  await assert.rejects(run('cache', 'example/portal:tag', registry({ quota: '0;w=21600' }).fetcher, () => {}), { code: 4 });
  for (const [headStatus, code] of [[404, 3], [429, 4], [401, 1], [500, 1]]) {
    await assert.rejects(run('head', 'example/portal:tag', registry({ headStatus }).fetcher, () => {}), { code });
  }
  await assert.rejects(run('head', 'example/portal:tag', async () => { throw new Error('offline'); }, () => {}), /offline/);
});

test('only exact successful-producer artifacts from this pipeline justify a missing dry-run source', async () => {
  const env = { CIRCLE_WORKFLOW_ID: '12345678-1234-1234-1234-123456789abc', CIRCLE_SHA1: 'a'.repeat(40), STAGING_RUN_ID: 'pipeline' };
  const marker = `${env.CIRCLE_SHA1}\n${env.STAGING_RUN_ID}\nquota-skipped\n`;
  const fetcher = text => async url => {
    if (url.includes('/workflow/')) return Response.json({ items: [{ name: 'build-1', status: 'success', job_number: 1 }] });
    if (url.includes('/artifacts')) return Response.json({ items: [{ path: 'ci-staging-status/runtime-amd64', url: 'https://example.com/marker' }] });
    return new Response(text);
  };
  assert.equal(await skipped('runtime', 'amd64', env, fetcher(marker)), true);
  const credentialMarker = marker.replace('quota-skipped', 'credential-skipped');
  assert.deepEqual(await result('runtime', 'amd64', env, fetcher(credentialMarker)), { state: 'credential-skipped' });
  for (const text of [credentialMarker.replace(env.CIRCLE_SHA1, 'b'.repeat(40)),
    credentialMarker.replace('pipeline', 'old-pipeline'), credentialMarker + 'extra',
    credentialMarker.trimEnd(), credentialMarker.replace('credential-skipped', 'unknown-skipped')]) {
    assert.equal(await result('runtime', 'amd64', env, fetcher(text)), null);
  }
  for (const text of [marker.replace(env.CIRCLE_SHA1, 'b'.repeat(40)), marker.replace('pipeline', 'old-pipeline'), marker.replace('quota-skipped', 'verified'), '']) {
    assert.equal(await skipped('runtime', 'amd64', env, fetcher(text)), false);
  }
  assert.equal(await skipped('pdfgen', 'arm64', env, fetcher(marker)), false);
});

test('verified producer artifacts carry only an exact digest for the matching commit and pipeline', async () => {
  const env = { CIRCLE_WORKFLOW_ID: '12345678-1234-1234-1234-123456789abc', CIRCLE_SHA1: 'a'.repeat(40), STAGING_RUN_ID: 'pipeline' };
  const marker = `${env.CIRCLE_SHA1}\n${env.STAGING_RUN_ID}\nverified\n${id}\n`;
  const fetcher = text => async url => {
    if (url.includes('/workflow/')) return Response.json({ items: [{ name: 'build-1', status: 'success', job_number: 2 }] });
    if (url.includes('/artifacts')) { assert.match(url, /\/2\/artifacts$/); return Response.json({ items: [{ path: 'ci-staging-status/runtime-amd64', url: 'https://example.com/marker' }] }); }
    return new Response(text);
  };
  assert.deepEqual(await result('runtime', 'amd64', env, fetcher(marker)), { state: 'verified', digest: id });
  for (const text of [marker.replace(env.CIRCLE_SHA1, 'b'.repeat(40)), marker.replace('pipeline', 'old'), marker.replace(id, 'bad'), marker + 'extra']) {
    assert.equal(await result('runtime', 'amd64', env, fetcher(text)), null);
  }
});

test('producer lookup follows pagination and uses the newest successful attempt in this workflow', async () => {
  const env = { CIRCLE_WORKFLOW_ID: '12345678-1234-1234-1234-123456789abc', CIRCLE_SHA1: 'a'.repeat(40), STAGING_RUN_ID: 'pipeline' };
  const calls = [];
  const fetcher = async url => {
    calls.push(url);
    if (url.includes('/workflow/')) {
      if (!url.includes('page-token=')) return Response.json({ items: [{ name: 'stage-pdfgen-arm64', status: 'success', job_number: 1 }], next_page_token: 'next page' });
      assert.match(url, /page-token=next%20page/);
      return Response.json({ items: [
        { name: 'stage-pdfgen-arm64', status: 'failed', job_number: 4 },
        { name: 'stage-pdfgen-arm64', status: 'success', job_number: 3 },
      ] });
    }
    if (url.includes('/artifacts')) {
      assert.match(url, /\/3\/artifacts/);
      if (!url.includes('page-token=')) return Response.json({ items: [], next_page_token: 'artifacts' });
      return Response.json({ items: [{ path: 'ci-staging-status/pdfgen-arm64', url: 'https://example.com/result' }] });
    }
    return new Response(`${env.CIRCLE_SHA1}\n${env.STAGING_RUN_ID}\nverified\n${id}\n`);
  };
  assert.deepEqual(await result('pdfgen', 'arm64', env, fetcher), { state: 'verified', digest: id });
  assert.equal(calls.length, 5);
});
