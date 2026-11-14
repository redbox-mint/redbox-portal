import assert from 'node:assert/strict';
import { mkdir, rm, writeFile, readFile, utimes } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { referenceProductionFixture, referenceOrigin } from './referenceProductionFixture';
import { retainedAssetExpress } from './retainedAssetExpress';
import { retainedDatastreamExpress } from './retainedDatastreamExpress';
import { retainedUploadExpress } from './retainedUploadExpress';
import { oidcFixture } from './oidcFixture';
import { availablePort } from './authenticationFixture';
import type { RequestHandler } from 'express';
import { progressSocketHttpOwners } from '../../../src/http/express/progressSockets';
import type { Wire, assetWire } from './AssetDifferentialMongo.test';
const audit = require('../../../../../support/specs/fastify-migration/evidence/reconcile-FM-031.cjs');
const inventory = require('../../../../../support/specs/fastify-migration/evidence/FM-002.inventory.json') as {
  routes: { name: string; method: string; path: string; ownerTask: string; controller: string; action: string }[];
};
const marker = 'PUBLIC-ROUTE-COLLISION-0123456789';
const parameters: Record<string, string> = {
  branding: 'default',
  portal: 'rdmp',
  oid: 'reference-record',
  recordType: 'dataRecord',
  dashboardView: 'referenceView',
  name: 'records',
  appConfigId: 'systemMessage',
  asset: 'apiClientConfig',
  workflowStage: 'draft',
  stepName: 'draft',
};
const rows = inventory.routes.map(row => ({
  ...row,
  target: row.path
    .replace(/[{}]/g, '')
    .replace(
      /:([\w]+)\*?|\*([\w]+)/g,
      (_match, parameter: string, wildcard: string) =>
        parameters[parameter ?? wildcard] ?? 'collision-' + (parameter ?? wildcard)
    ),
}));
const extensionRoutes = [
  ['get', '/fm031-owned-get'],
  ['post', '/fm031-owned-post'],
  ['head', '/fm031-owned-head'],
  ['options', '/fm031-owned-options'],
] as const;
rows.push(
  ...extensionRoutes.map(([method, target]) => ({
    name: 'fm031-' + method,
    method,
    path: target,
    target,
    ownerTask: 'FM-031',
    controller: 'BrandingController',
    action: 'renderPreviewCss',
  })),
  ...[
    ...progressSocketHttpOwners(referenceOrigin).map(owner =>
      owner.route.path.replace('/*transportPath', '/transport-probe')
    ),
    '/healthz',
    '/readyz',
  ].map(target => ({
    name: 'fm031-socket-' + target.split('/').pop(),
    method: 'all',
    path: target,
    target,
    ownerTask: 'FM-035',
    controller: 'Portal',
    action: 'protocol',
  })),
  {
    name: 'fm031-fallback',
    method: 'get',
    path: '/fm031-fallback/probe.js',
    target: '/fm031-fallback/probe.js',
    ownerTask: 'FM-031',
    controller: 'BrandingController',
    action: 'renderPreviewCss',
  }
);
const cases = rows.flatMap(row =>
  [undefined, 'pilot-api-token', 'reader-token'].flatMap(auth =>
    ['GET', 'HEAD'].flatMap(method =>
      [false, true].map(absolute => ({
        row,
        auth,
        method,
        absolute,
        name: `${row.name} ${row.method} ${row.path} ${method} ${auth ?? 'anonymous'} absolute=${absolute}`,
      }))
    )
  )
);
for (const row of rows.filter(row => row.path === '/csrfToken'))
  for (const method of ['GET', 'HEAD'])
    for (const absolute of [false, true])
      for (const origin of [referenceOrigin, 'https://hostile.invalid'])
        cases.push({
          row,
          method,
          absolute,
          auth: undefined,
          name: `${row.name} origin=${origin} ${method} absolute=${absolute}`,
        } as (typeof cases)[number]);

/** Generated from every FM-002 declaration, including methods without a GET
 * owner. One file at a time avoids file/directory conflicts between route paths. */
export function declareAssetRouteCollisions(wire: typeof assetWire, normalize: (value: Wire) => Wire) {
  describe('FM-031 generated declaration/static collision differential', function () {
    this.timeout(1200000);
    const selected = [
      { name: 'portal', root: '/portal', policy: undefined },
      { name: 'root', root: '', policy: undefined },
      { name: 'reduced', root: '/portal', policy: { '*': ['noCache', 'brandingAndPortal'] } },
    ];
    for (const profile of selected.filter(
      p => !process.env.FM031_COLLISION_PROFILE || process.env.FM031_COLLISION_PROFILE === p.name
    )) {
      describe(profile.name, () => {
        const results: Wire[][] = [[], []];
        const baseline: Wire[][] = [[], []];
        const deviations: { name: string; express: Wire; native: Wire }[] = [];
        before(async () => {
          const retained = await retainedAssetExpress();
          const retainedDownloads = await retainedDatastreamExpress();
          const retainedUploads = await retainedUploadExpress();
          const provider = await oidcFixture();
          const port = await availablePort();
          const origin = 'http://127.0.0.1:' + port;
          const auth = provider.config(port);
          try {
            for (const native of [false, true]) {
              let assetRoot = '';
              const pages: { assetRoots?: string[] } = {};
              const f = await referenceProductionFixture(
                native,
                profile.policy,
                native
                  ? undefined
                  : () => {
                      const restoreAssets = retained.install(),
                        restoreDownloads = retainedDownloads.install(),
                        restoreUploads = retainedUploads.install();
                      return () => {
                        restoreUploads();
                        restoreDownloads();
                        restoreAssets();
                      };
                    },
                {
                  declarations: audit.declarations,
                  pages,
                  rootContext: profile.root,
                  bindings: {
                    handler: registration => () => (registration.declaration.create as () => RequestHandler)(),
                  },
                  configuration: {
                    server: {
                      hostname: '127.0.0.1',
                      port,
                      rootContext: profile.root,
                      trustProxy: true,
                      stopDeadlineMs: 30000,
                      publicUrl: referenceOrigin,
                    },
                    brandingConfigurationDefaults: { auth },
                  },
                  artifacts: async (directory, installation) => {
                    assetRoot = path.join(directory, 'collision-assets');
                    await mkdir(assetRoot);
                    pages.assetRoots = [assetRoot];
                    const entry = path.join(installation, 'index.cjs');
                    const trace =
                      "response.HEADER('X-FM031-Collision-Hook',response.getHeader('X-FM031-Collision-Hook')?'duplicate':'once');";
                    const hooks = native
                      ? `routes:${JSON.stringify(extensionRoutes.map(([method, path]) => ({ name: 'fm031-' + method, method, path, controller: 'BrandingController', action: 'renderPreviewCss', access: { kind: 'public' } })))},fallbacks:[{name:'fm031-fallback',prefix:'/fm031-fallback',controller:'BrandingController',action:'renderPreviewCss',access:{kind:'public'}}],hooks:[{name:'collision-observer',stage:'afterAuthentication',scope:{kind:'application'},run:async(request,response)=>{${trace.replaceAll('HEADER', 'header')}}},{name:'collision-action',stage:'beforeAction',scope:{kind:'application'},run:async(request,response)=>{response.header('X-FM031-Collision-Action',response.getHeader('X-FM031-Collision-Action')?'duplicate':'once');}}],`
                      : `routes:${JSON.stringify(extensionRoutes.map(([method, path]) => ({ name: 'fm031-' + method, method, path, handler: 'collision-handler', access: 'public' })))},handlers:[{name:'collision-handler',create:()=>((request,response)=>response.status(404).send('/* preview token missing */'))},{name:'collision-fallback',create:()=>((request,response,next)=>{if(request.method==='GET'&&request.path.startsWith('/fm031-fallback/'))response.status(404).send('/* preview token missing */');else next();})},{name:'collision-observer',create:()=>((request,response,next)=>{${trace.replaceAll('HEADER', 'set')}next();})}],middleware:[{name:'collision-observer',stage:'beforeRoutes',handler:'collision-observer'},{name:'collision-fallback',stage:'afterRoutes',handler:'collision-fallback'}],`;
                    await writeFile(
                      entry,
                      (await readFile(entry, 'utf8')).replace('apiVersion:', hooks + 'apiVersion:')
                    );
                  },
                }
              );
              try {
                if (native && process.env.FM031_RESULTS && 'installation' in f.portal)
                  await writeFile(
                    path.join(process.env.FM031_RESULTS, `ownership-${profile.name}.json`),
                    JSON.stringify(f.portal.installation.registry.ownership?.snapshot(), null, 2)
                  );
                for (const row of rows) {
                  await rm(assetRoot, { recursive: true });
                  await mkdir(assetRoot);
                  const file = path.join(assetRoot, row.target === '/' ? 'index.html' : row.target.slice(1));
                  for (const present of [false, true]) {
                    if (present) {
                      await mkdir(path.dirname(file), { recursive: true });
                      await writeFile(file, marker);
                      await utimes(file, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
                    }
                    for (const c of cases.filter(c => c.row === row)) {
                      const originMatch = /origin=(\S+)/.exec(c.name);
                      const headers = {
                        Accept: 'application/json',
                        ...(c.auth ? { Authorization: 'Bearer ' + c.auth } : {}),
                        ...(originMatch ? { Origin: originMatch[1]! } : {}),
                      };
                      // A real, invalid callback response avoids the already deferred
                      // callback-without-code provider lifecycle issue.
                      const query = row.action === 'openidConnectLogin' ? '?code=invalid&state=invalid' : '';
                      const target = profile.root + row.target + query;
                      if (process.env.FM031_RESULTS)
                        await writeFile(
                          path.join(process.env.FM031_RESULTS, 'collision-progress.json'),
                          JSON.stringify({ profile: profile.name, native, present, name: c.name })
                        );
                      const raw = await wire(
                        origin,
                        c.absolute ? 'http://hostile.invalid' + target : target,
                        c.method,
                        headers
                      );
                      assert.notEqual(raw.headers['x-fm031-collision-hook'], 'duplicate', c.name);
                      assert.notEqual(raw.headers['x-fm031-collision-action'], 'duplicate', c.name);
                      if (
                        raw.status === 200 &&
                        raw.headers['last-modified'] === 'Thu, 01 Jan 2026 00:00:00 GMT' &&
                        raw.headers['content-length'] === String(Buffer.byteLength(marker))
                      )
                        assert.equal(
                          raw.headers['x-fm031-collision-action'],
                          undefined,
                          'static delivery does not run beforeAction'
                        );
                      const value = normalize(raw);
                      // Safe errors can strip diagnostic headers after hooks ran.
                      delete value.headers['x-fm031-collision-hook'];
                      delete value.headers['x-fm031-collision-action'];
                      const clean = (text: string) =>
                        text
                          .replace(/(nonce|ngCspNonce)="[^"]+"/gi, '$1="<nonce>"')
                          .replace(/[a-f0-9]{64}/g, '<csrf>')
                          .replace(/[a-f0-9]{24}/g, '<id>')
                          .replace(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/g, '<uuid>')
                          .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, '<timestamp>');
                      if (value.body && !value.body.startsWith('sha256:'))
                        value.body = Buffer.from(clean(Buffer.from(value.body, 'base64').toString())).toString(
                          'base64'
                        );
                      if (
                        typeof value.headers.location === 'string' &&
                        value.headers.location.includes('code_challenge=')
                      ) {
                        const location = new URL(value.headers.location);
                        for (const key of ['state', 'code_challenge', 'nonce'])
                          if (location.searchParams.has(key)) location.searchParams.set(key, '<' + key + '>');
                        location.searchParams.sort();
                        value.headers.location = location.href;
                      }
                      (present ? results : baseline)[native ? 1 : 0][cases.indexOf(c)] = value;
                    }
                  }
                }
              } finally {
                await f.close();
              }
            }
          } finally {
            await provider.close();
            await retainedDownloads.close();
            await retainedUploads.close();
            await retained.close();
          }
          if (process.env.FM031_RESULTS)
            await writeFile(
              path.join(process.env.FM031_RESULTS, `collisions-${profile.name}.json`),
              JSON.stringify({ rows, cases, results, baseline }, null, 2)
            );
          for (let index = 0; index < cases.length; index++) {
            const express = results[0][index]!,
              native = results[1][index]!;
            if (!isDeepStrictEqual(express, native)) deviations.push({ name: cases[index]!.name, express, native });
          }
          if (process.env.FM031_RESULTS)
            await writeFile(
              path.join(process.env.FM031_RESULTS, `collision-domain-deviations-${profile.name}.json`),
              JSON.stringify(deviations, null, 2)
            );
        });
        it('audits every declaration without excluded rows and records domain deviations', () => {
          assert.equal(inventory.routes.length, 335);
          assert.equal(rows.length, 351);
          assert(results.every(values => values.length === cases.length));
          assert(baseline.every(values => values.length === cases.length));
        });
        cases.forEach((c, index) => {
          it(c.name, () => {
            const [express, native] = results.map(values => values[index]!);
            const [expressBase, nativeBase] = baseline.map(values => values[index]!);
            const staticFile = (value: Wire) =>
              value.status === 200 &&
              value.headers['last-modified'] === 'Thu, 01 Jan 2026 00:00:00 GMT' &&
              value.headers['content-length'] === String(Buffer.byteLength(marker));
            assert.equal(staticFile(native!), staticFile(express!), 'same static-vs-route selection');
            if (staticFile(express!)) assert.deepEqual(native, express, 'static fallthrough matches retained Express');
            else {
              assert.deepEqual(express, expressBase, 'file cannot shadow an Express route/guard');
              assert.deepEqual(native, nativeBase, 'file cannot shadow a native route/guard');
              // The collision gate asserts selection and guard preservation for
              // EVERY row. Unselected domain responses and existing absolute-form
              // differences are captured explicitly for the orchestrator, never
              // filtered by route, controller or later-task ownership.
              if ([401, 403].includes(express!.status))
                assert.equal(native!.status, express!.status, 'retained authentication/authorization denial');
            }
            if (c.row.ownerTask === 'FM-033' || c.row.ownerTask === 'FM-034')
              assert.deepEqual(native, express, 'Selected download/upload/TUS owners match retained Express');
            if (c.row.controller === 'webservice/RecordSchemaController') {
              assert.deepEqual(native, express, 'schema instances and framing match without normalization');
              if (c.method === 'GET' && String(native!.headers['content-type']).includes('problem+json')) {
                const instance = JSON.parse(Buffer.from(native!.body, 'base64').toString()).instance;
                assert.equal(
                  instance,
                  c.row.target.startsWith('/') && [401, 403].includes(native!.status) && profile.name !== 'reduced'
                    ? c.row.target
                    : profile.root + c.row.target
                );
              }
            }
            if (c.method === 'HEAD') assert.equal(native!.body, '');
            if (c.name.includes('origin=https://hostile.invalid')) assert.equal(native!.status, 403);
            if (c.name.includes('origin=') && !c.name.includes('hostile.invalid')) assert.equal(native!.status, 200);
          });
        });
      });
    }
  });
}
