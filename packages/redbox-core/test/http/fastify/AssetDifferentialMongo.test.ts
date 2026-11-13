import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { RequestHandler } from 'express';
import { mkdir, writeFile, readFile, utimes, symlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { referenceProductionFixture } from './referenceProductionFixture';
import { retainedAssetExpress } from './retainedAssetExpress';
import { brandingDeliveryRoutes, dynamicAssetRoutes, fontDeliveryRoute } from '../../../src/http/assetRoutes';
import { getBrandingRepository } from '../../../src/persistence/branding/runtime';
import { declareAssetRouteCollisions } from './assetRouteCollisions';
import { declareTranslationWildcardTargets } from './translationWildcardTargets';
const audit = require('../../../../../support/specs/fastify-migration/evidence/reconcile-FM-028.cjs');
export type Wire = { status: number; headers: Record<string, unknown>; body: string };
const retainedBodies = new Set<string>();
export async function assetWire(
  url: string,
  target: string,
  method = 'GET',
  headers: Record<string, string> = {},
  body = ''
): Promise<Wire> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method,
        path: target,
        headers: { ...headers, ...(body ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}) },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', value => chunks.push(value));
        res.on('error', reject);
        res.on('end', () => {
          try {
            const bytes = Buffer.concat(chunks);
            assert(!bytes.includes(Buffer.from('PRIVATE')), 'private bytes are never served');
            assert(!bytes.includes(Buffer.from('/tmp/fm023-production-')), 'server paths are never public');
            let body = bytes.toString('base64');
            if (bytes.length > 65536) {
              const hash = createHash('sha256').update(bytes).digest('hex');
              body = `sha256:${bytes.length}:${hash}`;
              if (process.env.FM031_RESULTS && !retainedBodies.has(hash)) {
                const directory = path.join(process.env.FM031_RESULTS, 'bodies');
                mkdirSync(directory, { recursive: true });
                writeFileSync(path.join(directory, hash), bytes);
                retainedBodies.add(hash);
              }
            }
            resolve({ status: res.statusCode!, headers: res.headers, body });
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.setTimeout(15000, () => req.destroy(new Error('HTTP timeout')));
    req.on('error', reject);
    req.end(body);
  });
}
function normalized(value: Wire) {
  const headers = { ...value.headers };
  for (const key of ['date', 'connection', 'keep-alive', 'x-request-id']) delete headers[key];
  if (headers.expires && headers.expires !== '0') headers.expires = '<time>';
  if (headers['set-cookie'])
    headers['set-cookie'] = (headers['set-cookie'] as string[]).map(value =>
      value.replace(/^([^=]+)=[^;]+/, '$1=<session>').replace(/Expires=[^;]+/i, 'Expires=<time>')
    );
  for (const key of ['content-security-policy', 'content-security-policy-report-only'])
    if (typeof headers[key] === 'string') headers[key] = headers[key].replace(/nonce-[^' ;]+/g, 'nonce-<nonce>');
  return { ...value, headers };
}
type Case = {
  name: string;
  target: string;
  method?: string;
  auth?: string;
  headers?: Record<string, string>;
  conditional?: 'date' | 'etag' | 'list' | 'stale' | 'rangeDate';
  absolute?: boolean;
  status?: number;
  text?: string;
};
const cases: Case[] = [];
const staticPaths = [
  '/custom/probe.js',
  '/js/large.js',
  '/js/hook.js',
  '/default/other/js/fallback.js',
  '/other/rdmp/js/fallback.js',
  '/js/public.js.map',
  '/js/plain.js',
  '/js/main-ABCDEF12.js',
  '/styles/site.css',
  '/images/test.svg',
  '/angular/fixture/browser/main-ABCDEF12.js',
  '/default/rdmp/js/specific.js',
  '/other/rdmp/js/specific.js',
  '/js/empty.js',
  '/images/test.png',
  '/fonts/test.woff2',
  '/site.webmanifest',
];
for (const target of staticPaths) {
  cases.push(...['GET', 'HEAD'].map(method => ({ name: method + ' ' + target, target, method, status: 200 })));
  for (const conditional of ['date', 'etag', 'list', 'stale'] as const)
    cases.push({ name: conditional + ' ' + target, target, conditional });
  for (const conditional of ['date', 'etag'] as const)
    cases.push({ name: 'conditional HEAD ' + conditional + target, target, method: 'HEAD', conditional });
  cases.push(
    {
      name: 'exact Last-Modified If-Range ' + target,
      target,
      headers: { Range: 'bytes=2-4' },
      conditional: 'rangeDate',
    },
    {
      name: 'upstream ETag If-Range ' + target,
      target,
      headers: { Range: 'bytes=2-4', 'If-Range': '"fm031-upstream"', 'X-FM031-ETag': 'yes' },
    },
    {
      name: 'stale upstream ETag If-Range ' + target,
      target,
      headers: { Range: 'bytes=2-4', 'If-Range': '"stale"', 'X-FM031-ETag': 'yes' },
    },
    {
      name: 'upstream ETag freshness ' + target,
      target,
      headers: { 'If-None-Match': '"fm031-upstream"', 'X-FM031-ETag': 'yes' },
    }
  );
  for (const range of [
    'bytes=2-4',
    'bytes=-3',
    'bytes=7-',
    'bytes=0-1,7-8',
    'bytes=0-2,2-5',
    'bad',
    'bytes=99999-',
    'bytes=nope',
  ])
    cases.push({ name: range + ' ' + target, target, headers: { Range: range } });
  cases.push(
    { name: 'range HEAD ' + target, target, method: 'HEAD', headers: { Range: 'bytes=2-4' } },
    {
      name: 'stale range ' + target,
      target,
      headers: { Range: 'bytes=2-4', 'If-Range': 'Thu, 01 Jan 1970 00:00:00 GMT' },
    },
    {
      name: 'fresh range ' + target,
      target,
      headers: { Range: 'bytes=2-4', 'If-Range': 'Wed, 01 Jan 2100 00:00:00 GMT' },
    },
    { name: 'absolute ' + target, target, absolute: true },
    { name: 'absolute HEAD ' + target, target, method: 'HEAD', absolute: true },
    { name: 'gzip ' + target, target, headers: { 'Accept-Encoding': 'gzip, br' } },
    { name: 'forbidden identity ' + target, target, headers: { 'Accept-Encoding': 'identity;q=0' } }
  );
}
const oldDate = 'Thu, 01 Jan 1970 00:00:00 GMT';
const futureDate = 'Wed, 01 Jan 2100 00:00:00 GMT';
const matchTag = '"fm031-upstream"';
const preconditions: { name: string; headers: Record<string, string>; status: number | readonly [number, number] }[] = [
  { name: 'If-Match wildcard', headers: { 'If-Match': '*' }, status: [500, 200] },
  { name: 'If-Match exact', headers: { 'If-Match': matchTag }, status: [500, 200] },
  { name: 'If-Match weak', headers: { 'If-Match': 'W/' + matchTag }, status: [500, 200] },
  { name: 'If-Match list', headers: { 'If-Match': ' , "obsolete", ' + matchTag + ' , ' }, status: [500, 200] },
  { name: 'If-Match tab token', headers: { 'If-Match': '"obsolete",\t' + matchTag }, status: 500 },
  { name: 'If-Match stale', headers: { 'If-Match': '"obsolete"' }, status: 500 },
  { name: 'If-Match empty', headers: { 'If-Match': '' }, status: 200 },
  { name: 'If-Unmodified-Since stale', headers: { 'If-Unmodified-Since': oldDate }, status: 500 },
  { name: 'If-Unmodified-Since future', headers: { 'If-Unmodified-Since': futureDate }, status: 200 },
  {
    name: 'If-Unmodified-Since exact second',
    headers: { 'If-Unmodified-Since': 'Thu, 01 Jan 2026 00:00:00 GMT' },
    status: 200,
  },
  { name: 'If-Unmodified-Since invalid', headers: { 'If-Unmodified-Since': 'invalid' }, status: 200 },
  { name: 'If-Unmodified-Since empty', headers: { 'If-Unmodified-Since': '' }, status: 200 },
  {
    name: 'matching tag precedes stale date',
    headers: { 'If-Match': matchTag, 'If-Unmodified-Since': oldDate },
    status: [500, 200],
  },
  {
    name: 'stale tag precedes future date',
    headers: { 'If-Match': '"obsolete"', 'If-Unmodified-Since': futureDate },
    status: 500,
  },
  {
    name: 'empty tag permits stale date check',
    headers: { 'If-Match': '', 'If-Unmodified-Since': oldDate },
    status: 500,
  },
  { name: 'stale tag precedes freshness', headers: { 'If-Match': '"obsolete"', 'If-None-Match': '*' }, status: 500 },
  { name: 'matching tag then freshness', headers: { 'If-Match': matchTag, 'If-None-Match': '*' }, status: [500, 304] },
  {
    name: 'stale date precedes freshness',
    headers: { 'If-Unmodified-Since': oldDate, 'If-None-Match': '*' },
    status: 500,
  },
  {
    name: 'future date then freshness',
    headers: { 'If-Unmodified-Since': futureDate, 'If-None-Match': '*' },
    status: 304,
  },
  {
    name: 'invalid date then freshness',
    headers: { 'If-Unmodified-Since': 'invalid', 'If-None-Match': '*' },
    status: 304,
  },
  {
    name: 'stale date precedes modified date',
    headers: { 'If-Unmodified-Since': oldDate, 'If-Modified-Since': futureDate },
    status: 500,
  },
  {
    name: 'future date then modified date',
    headers: { 'If-Unmodified-Since': futureDate, 'If-Modified-Since': futureDate },
    status: 304,
  },
  {
    name: 'tag mismatch prevents date freshness',
    headers: { 'If-Unmodified-Since': futureDate, 'If-None-Match': '"obsolete"', 'If-Modified-Since': futureDate },
    status: 200,
  },
  { name: 'matching tag then range', headers: { 'If-Match': matchTag, Range: 'bytes=2-4' }, status: [500, 206] },
  {
    name: 'stale tag precedes range',
    headers: { 'If-Match': '"obsolete"', Range: 'bytes=2-4', 'If-Range': futureDate },
    status: 500,
  },
  {
    name: 'stale date precedes range',
    headers: { 'If-Unmodified-Since': oldDate, Range: 'bytes=2-4', 'If-Range': futureDate },
    status: 500,
  },
  {
    name: 'future date then fresh date range',
    headers: { 'If-Unmodified-Since': futureDate, Range: 'bytes=2-4', 'If-Range': futureDate },
    status: 206,
  },
  {
    name: 'future date then stale date range',
    headers: { 'If-Unmodified-Since': futureDate, Range: 'bytes=2-4', 'If-Range': oldDate },
    status: 200,
  },
  {
    name: 'future date then matching tag range',
    headers: { 'If-Unmodified-Since': futureDate, Range: 'bytes=2-4', 'If-Range': matchTag },
    status: [200, 206],
  },
  {
    name: 'matching tag then stale tag range',
    headers: { 'If-Match': matchTag, Range: 'bytes=2-4', 'If-Range': '"obsolete"' },
    status: [500, 200],
  },
  {
    name: 'freshness precedes range',
    headers: { 'If-Unmodified-Since': futureDate, 'If-None-Match': '*', Range: 'bytes=2-4', 'If-Range': oldDate },
    status: 304,
  },
  {
    name: 'all stale tag conditions precede freshness and range',
    headers: {
      'If-Match': '"obsolete"',
      'If-Unmodified-Since': futureDate,
      'If-None-Match': '*',
      'If-Modified-Since': futureDate,
      Range: 'bytes=2-4',
      'If-Range': futureDate,
    },
    status: 500,
  },
  {
    name: 'all matching tag conditions precede stale date',
    headers: {
      'If-Match': matchTag,
      'If-Unmodified-Since': oldDate,
      'If-None-Match': '*',
      'If-Modified-Since': futureDate,
      Range: 'bytes=2-4',
      'If-Range': futureDate,
    },
    status: [500, 304],
  },
  {
    name: 'precondition precedes unsatisfiable range',
    headers: { 'If-Unmodified-Since': oldDate, Range: 'bytes=99999-', 'If-Range': futureDate },
    status: 500,
  },
];
for (const target of ['/custom/probe.js', '/images/test.png'])
  for (const method of ['GET', 'HEAD'])
    for (const upstream of [200, 202, 301, 400, 404, 500])
      for (const conditional of [false, true])
        cases.push({
          name: `upstream status ${upstream} ${method} conditional=${conditional} ${target}`,
          target,
          method,
          headers: { 'X-FM031-Status': String(upstream), ...(conditional ? { 'If-Modified-Since': futureDate } : {}) },
          status: conditional && upstream >= 200 && upstream < 300 ? 304 : upstream,
        });
for (const target of ['/custom/probe.js', '/images/test.png'])
  for (const method of ['GET', 'HEAD'])
    for (const headers of [
      { 'If-Unmodified-Since': oldDate },
      { 'If-Match': '"stale"', 'If-None-Match': '*' },
      { 'If-Unmodified-Since': oldDate, Range: 'bytes=2-4' },
      { Range: 'bytes=99999-' },
      { Range: 'bytes=2-4' },
    ] as Record<string, string>[])
      cases.push({
        name: `entity file conditions ${method} ${target} ${JSON.stringify(headers)}`,
        target,
        method,
        headers: { ...headers, 'X-FM031-Headers': 'entities' },
        status: headers.Range === 'bytes=2-4' && !headers['If-Unmodified-Since'] ? 206 : 500,
      });
// Correct upstream file framing must be replaced with the error entity's length.
for (const method of ['GET', 'HEAD'])
  for (const headers of [
    {},
    { 'If-Unmodified-Since': oldDate },
    { 'If-Match': '"stale"' },
    { Range: 'bytes=99999-' },
  ] as Record<string, string>[])
    cases.push({
      name: `upstream file length ${method} ${JSON.stringify(headers)}`,
      target: '/js/framing.js',
      method,
      headers: { ...headers, 'X-FM031-Headers': 'length' },
      status: Object.keys(headers).length ? 500 : 200,
    });
for (const target of ['/custom/probe.js', '/images/test.png'])
  for (const etag of [false, true])
    for (const method of ['GET', 'HEAD'])
      for (const c of preconditions)
        cases.push({
          ...c,
          name: `precondition ${method} ETag=${etag} ${c.name} ${target}`,
          target,
          method,
          headers: { ...c.headers, 'X-FM031-ETag': etag ? 'yes' : 'no' },
          status: typeof c.status === 'number' ? c.status : c.status[etag ? 1 : 0],
        });
cases.push({ name: 'fallback handles missing file', target: '/custom/missing.js', status: 404 });
for (const target of ['/custom/probe.js', '/images/test.png'])
  for (const method of ['GET', 'HEAD'])
    for (const entry of [
      { name: 'upstream date', mode: 'modified', headers: {}, status: 200 },
      {
        name: 'upstream date freshness',
        mode: 'modified',
        headers: { 'If-Modified-Since': 'Fri, 01 Jan 2021 00:00:00 GMT' },
        status: 304,
      },
      {
        name: 'upstream date precondition',
        mode: 'modified',
        headers: { 'If-Unmodified-Since': 'Fri, 01 Jan 2021 00:00:00 GMT' },
        status: 200,
      },
      {
        name: 'upstream date range',
        mode: 'modified',
        headers: { Range: 'bytes=2-4', 'If-Range': 'Fri, 01 Jan 2021 00:00:00 GMT' },
        status: 206,
      },
      {
        name: 'upstream stale date precondition',
        mode: 'modified',
        headers: { 'If-Unmodified-Since': oldDate, 'If-None-Match': '*' },
        status: 500,
      },
      { name: 'upstream validators', mode: 'validators', headers: {}, status: 200 },
      {
        name: 'upstream tag freshness',
        mode: 'validators',
        headers: { 'If-None-Match': '"hook-validator"' },
        status: 304,
      },
      {
        name: 'upstream tag precondition',
        mode: 'validators',
        headers: { 'If-Match': '"hook-validator"' },
        status: 200,
      },
      {
        name: 'upstream tag range',
        mode: 'validators',
        headers: { Range: 'bytes=2-4', 'If-Range': '"hook-validator"' },
        status: 206,
      },
      {
        name: 'upstream stale tag range',
        mode: 'validators',
        headers: { Range: 'bytes=2-4', 'If-Range': '"stale"' },
        status: 200,
      },
      { name: 'empty upstream defaults', mode: 'empty', headers: {}, status: 200 },
      {
        name: 'empty upstream date defaults',
        mode: 'empty',
        headers: { 'If-Unmodified-Since': 'Fri, 01 Jan 2021 00:00:00 GMT' },
        status: 500,
      },
      { name: 'upstream entities', mode: 'entities', headers: {}, status: 200 },
      {
        name: 'upstream entities date freshness',
        mode: 'entities',
        headers: { 'If-Modified-Since': futureDate },
        status: 304,
      },
      { name: 'upstream entities tag freshness', mode: 'entities', headers: { 'If-None-Match': '*' }, status: 304 },
    ] as { name: string; mode: string; headers: Record<string, string>; status: number }[])
      cases.push({
        name: `${entry.name} ${method} ${target}`,
        target,
        method,
        headers: { ...entry.headers, 'X-FM031-Headers': entry.mode },
        status: entry.status,
      });
for (const method of ['GET', 'HEAD'])
  cases.push({
    name: `dynamic entities freshness ${method}`,
    target: '/default/rdmp/dynamic/apiClientConfig',
    method,
    auth: 'pilot-api-token',
    headers: { 'X-FM031-Headers': 'entities', 'If-None-Match': '*' },
    status: 304,
  });
for (const target of [
  '/js/../private.txt',
  '/js/%2e%2e/private.txt',
  '/js/%2e%2e%2fprivate.txt',
  '/js/%2f..%2fprivate.txt',
  '/js/..\\private.txt',
  '/js/%5c..%5cprivate.txt',
  '/.env',
  '/js/.secret',
  '/js/.private/file.js',
  '/js/private-link.js',
  '/js',
  '/js/',
  '/js/missing.js',
  '/js/missing.js.map',
  '/src/server.ts',
  '/package.json',
  '/angular/missing/browser/main-MISSING1.js',
  '/.git/config',
  '/default/rdmp/js/missing.js',
  '/default/rdmp/js/.secret',
  '/default/rdmp/js/%2e%2e/private.txt',
  '/default/rdmp/js',
  '/default/rdmp/js/',
  '/js/%ZZ',
])
  for (const method of ['GET', 'HEAD']) cases.push({ name: 'negative ' + method + target, target, method });
for (const target of [
  '/default/rdmp/js/missing.js',
  '/default/rdmp/js/.secret',
  '/default/rdmp/js/%2e%2e/private.txt',
  '/default/rdmp/js',
  '/default/rdmp/js/',
])
  for (const method of ['GET', 'HEAD'])
    cases.push({
      name: 'negative authenticated ' + method + target,
      target,
      method,
      auth: 'pilot-api-token',
      status: 404,
    });
const params: Record<string, string> = {
  branding: 'default',
  portal: 'rdmp',
  asset: 'apiClientConfig',
  token: 'missing',
  recordType: 'dataRecord',
  reportName: 'absent',
  workflowStage: 'draft',
  dashboardView: 'referenceView',
  stepName: 'draft',
  sha256: createHash('sha256').update('font-fixture').digest('hex'),
};
for (const route of [...brandingDeliveryRoutes, fontDeliveryRoute, ...dynamicAssetRoutes]) {
  const target = route.path.replace('{/:oid}', '').replace(/:([a-zA-Z0-9_]+)/g, (_, key: string) => params[key]);
  for (const auth of [undefined, 'pilot-api-token', 'reader-token', 'foreign-token', 'invalid-token'])
    cases.push({ name: route.action + ' actor ' + String(auth) + target, target, auth });
  cases.push(
    { name: route.action + ' HEAD ' + target, target, method: 'HEAD', auth: 'pilot-api-token' },
    { name: route.action + ' absolute ' + target, target, absolute: true, auth: 'pilot-api-token' },
    { name: route.action + ' absolute HEAD ' + target, target, absolute: true, method: 'HEAD', auth: 'pilot-api-token' }
  );
  for (const conditional of ['date', 'etag', 'list', 'stale'] as const)
    cases.push({ name: route.action + conditional + target, target, conditional, auth: 'pilot-api-token' });
  if (target.includes('/default/rdmp/'))
    for (const replacement of ['/missing/rdmp/', '/default/missing/', '/other/rdmp/'])
      cases.push({
        name: 'tenant ' + replacement + target,
        target: target.replace('/default/rdmp/', replacement),
        auth: 'pilot-api-token',
      });
}
for (const target of [
  '/default/rdmp/dynamic/apiClientConfig.json',
  '/default/rdmp/dynamic/toString',
  '/default/rdmp/dynamicAsset/formCompiledItems/dataRecord/reference-record?edit=true',
  '/default/rdmp/dynamicAsset/formCompiledItems/dataRecord/foreign-record',
  '/default/rdmp/dynamicAsset/formCompiledItems/dataRecord/absent',
  '/default/rdmp/dynamicAsset/formCompiledItems/absent',
  '/default/rdmp/dynamicAsset/formCompiledItems/dataRecord?edit[]=true',
  '/default/rdmp/dynamicAsset/formCompiledItems/dataRecord?edit=true',
  '/default/rdmp/styles/theme.css?v=publication-hash',
])
  for (const method of ['GET', 'HEAD'])
    cases.push({ name: 'form/config ' + method + target, target, method, auth: 'pilot-api-token' });
for (const target of ['/js/main-ABCDEF12.js', '/js/plain.js'])
  for (const method of ['GET', 'HEAD'])
    cases.push({ name: 'persist cookie ' + method + target, target, method, headers: { 'X-FM031-Cookie': 'yes' } });
cases.push({
  name: 'live form inputs',
  target: '/default/rdmp/dynamicAsset/formCompiledItems/dataRecord/absent?edit=false',
  auth: 'pilot-api-token',
  headers: { 'X-FM031-Live': 'yes' },
});
const profiles = [
  { name: 'default', rootContext: '/portal', configuration: {} },
  { name: 'reduced', rootContext: '/portal', configuration: {}, policy: { '*': ['noCache', 'brandingAndPortal'] } },
  { name: 'root', rootContext: '', configuration: {} },
  { name: 'overrides', rootContext: '/portal', configuration: {}, overrides: true },
  { name: 'explicit', rootContext: '/portal', configuration: {}, overrides: true, explicit: true },
  {
    name: 'report-only-http',
    rootContext: '/nested/portal',
    configuration: {
      server: {
        hostname: '127.0.0.1',
        port: 0,
        rootContext: '/nested/portal',
        trustProxy: true,
        stopDeadlineMs: 30000,
        publicUrl: 'http://portal.example.invalid',
      },
      csp: { reportOnly: true },
    },
  },
];
export async function assetArtifacts(directory: string, providerDirectory: string, overrides = false) {
  const roots = [
    path.join(directory, '.tmp/public'),
    path.join(directory, 'assets'),
    path.join(providerDirectory, 'assets'),
  ];
  const files: Record<string, string> = {
    'custom/probe.js': 'PUBLIC-ASSET',
    'js/framing.js': 'PUBLIC-FRAMING-012345678',
    'js/hook.js': 'core-hook',
    'default/default/js/fallback.js': 'core-fallback',
    'js/public.js.map': '{"version":3}',
    'js/large.js': 'const meaningfulCompressionProbe = 1;\n'.repeat(2048),
    'js/plain.js': '0123456789',
    'js/main-ABCDEF12.js': 'hashed-content',
    'styles/site.css': 'body {color:red}',
    'images/test.svg': '<svg></svg>',
    'images/test.png': 'png-fixture',
    'fonts/test.woff2': 'font-fixture',
    'site.webmanifest': '{}',
    'angular/fixture/browser/main-ABCDEF12.js': 'fixture-module',
    'js/empty.js': '',
    'default/rdmp/js/specific.js': 'core-brand-specific',
    'js/.secret': 'PRIVATE',
    'js/.private/file.js': 'PRIVATE',
    'images/logo.png': 'default-logo',
    'favicon-32x32.png': 'default-favicon',
  };
  for (const [name, value] of Object.entries(files)) {
    const file = path.join(roots[1], name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, value);
    await utimes(file, new Date('2026-01-01T00:00:00.123Z'), new Date('2026-01-01T00:00:00.123Z'));
  }
  await writeFile(path.join(directory, 'private.txt'), 'PRIVATE');
  await symlink(path.join(directory, 'private.txt'), path.join(roots[1], 'js/private-link.js'));
  // Real installed API1/API2 hooks test ordinary dispatch and retained session writes.
  const providerFile = path.join(providerDirectory, 'index.cjs');
  let provider = await readFile(providerFile, 'utf8');
  const native = provider.includes('apiVersion:2');
  const mutate = `if(request.headers['x-fm031-etag']==='yes'){response.HEADER('ETag',response.getHeader('ETag')?'"duplicate-hook"':'"fm031-upstream"');}if(request.headers['x-fm031-cookie']==='yes'){request.session.fm031Cookie='persisted';response.HEADER('Set-Cookie','upstream=private');}
if(request.headers['x-fm031-status'])response.STATUS(Number(request.headers['x-fm031-status']));
const mode=request.headers['x-fm031-headers'];
if(mode==='modified'||mode==='validators'){response.HEADER('Last-Modified','Wed, 01 Jan 2020 00:00:00 GMT');response.HEADER('Accept-Ranges','none');response.HEADER('Cache-Control','private, max-age=123');}
if(mode==='validators'){response.HEADER('ETag','"hook-validator"');response.HEADER('Content-Type','text/x-fm031; charset=iso-8859-1');}
if(mode==='empty')for(const name of ['Last-Modified','Accept-Ranges','Cache-Control','Content-Type','ETag'])response.HEADER(name,'');
if(mode==='length')response.HEADER('Content-Length','24');
if(mode==='entities'||mode==='length')for(const [name,value] of Object.entries({'Content-Language':'en','Content-Encoding':'identity','Content-Range':'bytes 0-2/12','Content-Location':'/public-location','Content-Disposition':'inline','Content-MD5':'fixture-digest'}))response.HEADER(name,value);`;
  const live = native
    ? `,hooks:[{name:'fm031-cookie',stage:'afterAuthentication',scope:{kind:'application'},run:async(request,response)=>{${mutate.replaceAll('HEADER', 'header').replaceAll('STATUS', 'code')}}},{name:'fm031-live',stage:'beforeAction',scope:{kind:'application'},run:async request=>{if(request.headers['x-fm031-live']==='yes'){request.params={...request.params,oid:'reference-record'};request.query={edit:'true'};request.body={};}}}]`
    : `,handlers:[{name:'fm031-live',create:()=>((request,response,next)=>{${mutate.replaceAll('HEADER', 'set').replaceAll('STATUS', 'status')}if(request.headers['x-fm031-live']==='yes'){request.url=request.url.replace('/absent','/reference-record');Object.defineProperty(request,'query',{configurable:true,value:{edit:'true'}});request.body={};}next();})}],middleware:[{name:'fm031-live',stage:'beforeRoutes',handler:'fm031-live'}]`;
  provider = provider.replace('apiVersion:', live.slice(1) + ',apiVersion:');
  // The installed API1 after-routes handler and API2 fallback deliberately
  // collide with a real public artifact. A miss must still reach the fallback.
  if (native) {
    provider = provider.replace(
      'apiVersion:',
      "fallbacks:[{name:'fm031-fallback',prefix:'/custom',controller:'BrandingController',action:'renderPreviewCss',access:{kind:'public'}}],apiVersion:"
    );
    provider = provider.replace(
      'hooks:[',
      "hooks:[{name:'fm031-fallback-observer',stage:'afterAuthentication',scope:{kind:'routes',names:['fm031-fallback']},run:async(request,response)=>{response.header('Link','</fm031-fallback>; rel=\"fallback\"');}},"
    );
  } else {
    provider = provider.replace(
      'handlers:[',
      "handlers:[{name:'fm031-fallback',create:()=>((request,response,next)=>{if(request.method!=='GET'||!(request.path==='/custom'||request.path.startsWith('/custom/'))){next();return;}response.set('Link','</fm031-fallback>; rel=\"fallback\"').status(404).send('/* preview token missing */');})},"
    );
    provider = provider.replace(
      "stage:'beforeRoutes',handler:'fm031-live'}]",
      "stage:'beforeRoutes',handler:'fm031-live'},{name:'fm031-fallback',stage:'afterRoutes',handler:'fm031-fallback'}]"
    );
  }
  await writeFile(providerFile, provider);
  if (overrides) {
    await mkdir(path.join(roots[0], 'js'), { recursive: true });
    await mkdir(path.join(roots[2], 'js'), { recursive: true });
    await writeFile(path.join(roots[0], 'js/plain.js'), 'deployment');
    await utimes(
      path.join(roots[0], 'js/plain.js'),
      new Date('2026-01-01T00:00:00.123Z'),
      new Date('2026-01-01T00:00:00.123Z')
    );
    await writeFile(path.join(roots[2], 'js/plain.js'), 'hook');
    await mkdir(path.join(roots[2], 'default/default/js'), { recursive: true });
    await writeFile(path.join(roots[2], 'js/hook.js'), 'storage-hook');
    await writeFile(path.join(roots[2], 'default/default/js/fallback.js'), 'storage-fallback');
    await writeFile(path.join(roots[2], 'default/default/js/specific.js'), 'hook-generic-specific');
    for (const file of ['js/plain.js', 'js/hook.js', 'default/default/js/fallback.js'])
      await utimes(
        path.join(roots[2], file),
        new Date('2026-01-01T00:00:00.123Z'),
        new Date('2026-01-01T00:00:00.123Z')
      );
    const file = path.join(providerDirectory, 'index.cjs');
    await writeFile(file, (await readFile(file, 'utf8')).replace('apiVersion:', "assets:['assets'],apiVersion:"));
    const pkg = path.join(directory, 'package.json');
    const manifest = JSON.parse(await readFile(pkg, 'utf8'));
    manifest.hookLoadPriority = ['fm031-high', 'fm031-low', 'fm023-storage'];
    for (const name of ['fm031-high', 'fm031-low']) {
      manifest.dependencies[name] = '1.0.0';
      const hook = path.join(directory, 'node_modules', name);
      await mkdir(path.join(hook, 'assets/js'), { recursive: true });
      await writeFile(
        path.join(hook, 'package.json'),
        JSON.stringify({ name, version: '1.0.0', main: 'index.cjs', redbox: { extension: './index.cjs' } })
      );
      await writeFile(
        path.join(hook, 'index.cjs'),
        `exports.registerRedboxExtension=()=>({apiVersion:${native ? 2 : 1},assets:['assets']});`
      );
      await writeFile(path.join(hook, 'assets/js/hook.js'), name);
      await utimes(
        path.join(hook, 'assets/js/hook.js'),
        new Date('2026-01-01T00:00:00.123Z'),
        new Date('2026-01-01T00:00:00.123Z')
      );
    }
    await writeFile(pkg, JSON.stringify(manifest));
  }
}
describe('FM-031 retained Express / shared Express / production Fastify assets', function () {
  this.timeout(600000);
  for (const profile of profiles.filter(
    value => !process.env.FM031_PROFILE || process.env.FM031_PROFILE === value.name
  )) {
    describe(profile.name, function () {
      let retained: Awaited<ReturnType<typeof retainedAssetExpress>>;
      const results: Wire[][] = [[], [], []];
      before(async () => {
        retained = await retainedAssetExpress();
        for (let host = 0; host < 3; host++) {
          const pageOptions: { assetRoots?: string[] } = {};
          const f = await referenceProductionFixture(
            host === 2,
            profile.policy,
            host === 0 ? () => retained.install() : undefined,
            {
              declarations: audit.migratedDeclarations,
              pages: pageOptions,
              rootContext: profile.rootContext,
              configuration: profile.configuration,
              bindings: { handler: registration => () => (registration.declaration.create as () => RequestHandler)() },
              artifacts: async (directory, provider) => {
                await assetArtifacts(directory, provider, profile.overrides);
                if (profile.explicit) {
                  const root = path.join(directory, 'deployment-assets');
                  pageOptions.assetRoots = [root];
                  await mkdir(path.join(root, 'js'), { recursive: true });
                  await writeFile(path.join(root, 'js/plain.js'), 'explicit-deployment');
                  await utimes(
                    path.join(root, 'js/plain.js'),
                    new Date('2026-01-01T00:00:00.123Z'),
                    new Date('2026-01-01T00:00:00.123Z')
                  );
                }
              },
            }
          );
          try {
            const repository = getBrandingRepository(f.owner);
            await f.data.disks
              .get()
              .primaryDisk()
              .put(f.data.reference.typeface.get().storageKey(f.brand.id, params.sha256), Buffer.from('font-fixture'));
            await repository.reviseBrand(f.brand.id, { css: 'body { color: red; }', hash: 'publication-hash' });
            for (const c of cases) {
              if (process.env.FM031_RESULTS)
                await writeFile(
                  path.join(process.env.FM031_RESULTS, 'progress.json'),
                  JSON.stringify({ profile: profile.name, host, name: c.name })
                );
              const headers: Record<string, string> = {
                Accept: 'application/json',
                ...(c.auth ? { Authorization: 'Bearer ' + c.auth } : {}),
                ...c.headers,
              };
              const target = profile.rootContext + c.target;
              if (c.conditional) {
                const prior = await assetWire(f.url, target, 'GET', headers);
                if (c.conditional === 'rangeDate') headers['If-Range'] = String(prior.headers['last-modified']);
                if (c.conditional === 'date')
                  headers['If-Modified-Since'] = String(
                    prior.headers['last-modified'] ?? 'Wed, 01 Jan 2100 00:00:00 GMT'
                  );
                if (c.conditional === 'etag') headers['If-None-Match'] = String(prior.headers.etag ?? '*');
                if (c.conditional === 'list')
                  headers['If-None-Match'] = '"other", ' + String(prior.headers.etag ?? '"missing"');
                if (c.conditional === 'stale') headers['If-Modified-Since'] = 'Thu, 01 Jan 1970 00:00:00 GMT';
              }
              const value = await assetWire(
                f.url,
                c.absolute ? 'http://hostile.invalid' + target : target,
                c.method,
                headers
              );
              if (c.target.startsWith('/custom/')) {
                assert.equal(
                  value.headers.link,
                  c.target.endsWith('/missing.js') ? '</fm031-fallback>; rel="fallback"' : undefined
                );
              }
              if (c.headers?.['X-FM031-Headers'] === 'length') {
                const bytes =
                  c.status === 500 ? '{"message":"Internal server error","details":""}' : 'PUBLIC-FRAMING-012345678';
                assert.equal(value.headers['content-length'], String(Buffer.byteLength(bytes)));
                assert.equal(value.body, c.method === 'HEAD' ? '' : Buffer.from(bytes).toString('base64'));
              }
              if (c.name.includes('precondition precedes unsatisfiable range'))
                assert.equal(value.headers['content-range'], undefined, 'preconditions run before range handling');
              if (c.headers?.['X-FM031-Headers'] === 'modified' || c.headers?.['X-FM031-Headers'] === 'validators') {
                assert.equal(value.headers['last-modified'], 'Wed, 01 Jan 2020 00:00:00 GMT');
                assert.equal(value.headers['accept-ranges'], 'none');
                if (c.status !== 500)
                  assert.match(
                    String(value.headers['cache-control']),
                    /^max-age=\d+, private$/,
                    'page headers precede sendFile defaults'
                  );
                if (c.headers['X-FM031-Headers'] === 'validators') {
                  assert.equal(value.headers.etag, '"hook-validator"');
                  assert.equal(
                    value.headers['content-type'],
                    c.status === 304 ? undefined : 'text/x-fm031; charset=iso-8859-1'
                  );
                }
              }
              if (c.headers?.['X-FM031-Headers'] === 'entities' || c.headers?.['X-FM031-Headers'] === 'length') {
                assert.equal(value.headers['content-location'], '/public-location');
                assert.equal(value.headers['content-disposition'], 'inline');
                assert.equal(value.headers['content-md5'], 'fixture-digest');
                for (const name of ['content-language', 'content-encoding', 'content-range'])
                  if (name === 'content-range' && c.headers.Range && !c.headers['If-Unmodified-Since']) {
                    assert.match(String(value.headers[name]), c.status === 206 ? /^bytes 2-4\// : /^bytes \*\//);
                  } else
                    assert.equal(
                      value.headers[name],
                      c.status === 304 && !c.name.startsWith('dynamic')
                        ? undefined
                        : { 'content-language': 'en', 'content-encoding': 'identity', 'content-range': 'bytes 0-2/12' }[
                            name
                          ]
                    );
              }
              if (c.name.startsWith('persist cookie')) {
                // Wire EOF can precede the retained session store callback.
                // Observe the durable write rather than racing that callback.
                let persisted = false;
                let attempt = 0;
                for (; attempt < 100; attempt++) {
                  const docs = await f.client.db().collection('referenceSessions').find({}).toArray();
                  if (docs.some(doc => JSON.parse(doc.session).fm031Cookie === 'persisted')) {
                    persisted = true;
                    break;
                  }
                  await new Promise(resolve => setTimeout(resolve, 20));
                }
                if (process.env.FM031_RESULTS)
                  await writeFile(
                    path.join(
                      process.env.FM031_RESULTS,
                      `session-${profile.name}-${host}-${c.method}-${c.target.includes('ABCDEF12') ? 'immutable' : 'ordinary'}.json`
                    ),
                    JSON.stringify({ profile: profile.name, host, case: c.name, attempt, persisted })
                  );
                assert(persisted, `static session changes are persisted (${profile.name}/${host}/${c.name})`);
                if (c.target.includes('ABCDEF12'))
                  assert.equal(
                    value.headers['set-cookie'],
                    undefined,
                    'immutable artifacts suppress upstream and deferred cookies'
                  );
              }
              if (c.target === '/js/hook.js' && c.name === 'GET /js/hook.js')
                assert.equal(
                  Buffer.from(value.body, 'base64').toString(),
                  profile.overrides ? 'fm031-high' : 'core-hook'
                );
              if (c.target === '/js/plain.js' && c.name === 'GET /js/plain.js')
                assert.equal(
                  Buffer.from(value.body, 'base64').toString(),
                  profile.explicit ? 'explicit-deployment' : profile.overrides ? 'deployment' : '0123456789'
                );
              if (c.name === 'GET /default/rdmp/js/specific.js' || c.name === 'GET /other/rdmp/js/specific.js')
                assert.equal(Buffer.from(value.body, 'base64').toString(), 'core-brand-specific');
              results[host].push(normalized(value));
            }
          } finally {
            await f.close();
          }
        }
        if (process.env.FM031_RESULTS)
          await writeFile(
            path.join(process.env.FM031_RESULTS, profile.name + '-wire.json'),
            JSON.stringify({ cases, results, hashes: retained.hashes }, null, 2)
          );
      });
      after(async () => retained?.close());
      cases.forEach((c, index) =>
        it(c.name, () => {
          const [retained, shared, native] = results.map(values => values[index]);
          assert.deepEqual(shared, retained, 'shared Express vs retained');
          assert.deepEqual(native, retained, 'production Fastify vs retained');
          if (c.status) assert.equal(native.status, c.status);
          assert(
            !Buffer.from(native.body, 'base64').includes(Buffer.from('PRIVATE')),
            'private bytes are never served'
          );
          assert(
            !Buffer.from(native.body, 'base64').includes(Buffer.from('/tmp/fm023-production-')),
            'server paths are never public'
          );
          if (c.name.startsWith('negative')) assert(native.status < 500, 'static misses are never server errors');
          if (c.method === 'HEAD') assert.equal(native.body, '');
        })
      );
    });
  }
});

declareAssetRouteCollisions(assetWire, normalized);
declareTranslationWildcardTargets(assetWire, normalized);
