import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { ApiRouteSource } from '../../../src/http/fastify/routes';
import type { ResolvedPortalInstallation } from '../../../src/application/portal/installation';
import { generateOpenApiArtifacts } from '../../../scripts/generate-openapi';
import { referenceProductionFixture } from './referenceProductionFixture';

const audit = require(
  path.resolve(__dirname, '../../../../../support/specs/fastify-migration/evidence/reconcile-FM-028.cjs')
) as {
  migratedDeclarations: readonly ApiRouteSource[];
  reconcile(
    installation: ResolvedPortalInstallation,
    document?: unknown,
    blueprint?: string
  ): {
    counts: { api: number; migrated: number; intentionalOverrides: number; later: number };
    rows: {
      name: string;
      method: string;
      path: string;
      classification: string;
      runtime: null | { bindings: { method: string; path: string }[] };
    }[];
  };
};

describe('FM-028 G3 production API composition', function () {
  this.timeout(180000);
  it('installs the complete migrated inventory together and serves every API through the production security boundary', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'fm028-docs-'));
    const f = await referenceProductionFixture(true, undefined, undefined, {
      declarations: audit.migratedDeclarations,
    });
    try {
      assert('installation' in f.portal);
      const installation = f.portal.installation;
      await generateOpenApiArtifacts({ outDir: directory });
      if (process.env.FM028_DOCS_DIRECTORY) await cp(directory, process.env.FM028_DOCS_DIRECTORY, { recursive: true });
      const document = JSON.parse(await readFile(path.join(directory, 'openapi.json'), 'utf8'));
      const blueprint = await readFile(path.join(directory, 'apidocs.apib'), 'utf8');
      const report = audit.reconcile(installation, document, blueprint);
      assert.deepEqual(report.counts, { api: 152, migrated: 148, intentionalOverrides: 0, later: 4 });
      const registered = installation.registry.snapshot();
      const observations: { name: string; method: string; status: number; body: string }[] = [];
      for (const row of report.rows.filter(row => row.classification === 'migrated')) {
        for (const binding of row.runtime!.bindings)
          assert.equal(
            registered.filter(
              route => route.name === row.name && route.method === binding.method && route.path === binding.path
            ).length,
            1,
            'Actual registration: ' + row.name
          );
        const url =
          f.url +
          row.path
            .replace(':branding', 'default')
            .replace(':portal', 'rdmp')
            .replace(/\*[A-Za-z_]+/g, 'fixture/key')
            .replace(/:[A-Za-z_]+/g, 'fm028-object');
        const response = await fetch(url, {
          method: row.method.toUpperCase(),
          redirect: 'manual',
          headers: { Authorization: 'Bearer invalid-fm028-token' },
        });
        const body = await response.text();
        observations.push({ name: row.name, method: row.method, status: response.status, body });
        assert([401, 403].includes(response.status), row.name + ': ' + response.status + ' ' + body);
        assert(!/invalid-fm028-token|MongoServerError|TypeError/.test(body));
      }
      if (process.env.FM028_RUNTIME_REPORT)
        await writeFile(
          process.env.FM028_RUNTIME_REPORT,
          JSON.stringify({ report, registered, observations }, null, 2)
        );
    } finally {
      await f.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
