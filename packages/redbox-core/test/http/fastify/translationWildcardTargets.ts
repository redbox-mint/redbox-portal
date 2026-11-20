import { assertGolden, goldenControls } from './goldenContracts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BrandingModel } from '../../../src/model/storage/BrandingModel';
import { portalHttpPolicies } from '../../../src/application/portal/httpPolicies';
import { referenceProductionFixture, referenceOrigin } from './referenceProductionFixture';

import { session } from './mutationDifferentialSupport';
import { wildcardRequestTargets } from './wildcardRequestTargets';
import type { Wire } from './AssetDifferentialMongo.test';
const audit = require('../../../../../support/specs/fastify-migration/evidence/reconcile-FM-028.cjs');
type Exchange = (
  url: string,
  target: string,
  method?: string,
  headers?: Record<string, string>,
  body?: string
) => Promise<Wire>;
const owners = [
  { method: 'GET', path: '/api/i18n/entries/en/translation/', action: 'read' },
  { method: 'HEAD', path: '/api/i18n/entries/en/translation/', action: 'read' },
  { method: 'POST', path: '/api/i18n/entries/en/translation/', action: 'write' },
  { method: 'DELETE', path: '/api/i18n/entries/en/translation/', action: 'delete' },
  { method: 'POST', path: '/app/i18n/entries/en/translation/', action: 'write' },
] as const;
const keys = [...new Set(wildcardRequestTargets.map(test => test.key))];
const initial = (key: string) => 'Before:' + key;
/** Real translation operations, policy/CSRF chain and production bootstrap on
 * Fastify. Raw HTTP preserves
 * fragments and absolute authorities that URL()/fetch would discard. */
export function declareTranslationWildcardTargets(wire: Exchange, normalize: (value: Wire) => Wire): void {
  describe('FM-031 production translation wildcard request targets', function () {
    this.timeout(600000);
    for (const rootContext of ['/portal', ''])
      for (const reduced of [false, true]) {
        const profile = `${rootContext ? 'portal' : 'empty'}-${reduced ? 'reduced' : 'normal'}`;
        const cases = owners.flatMap(owner =>
          (reduced ? ['anonymous'] : ['authenticated', 'anonymous']).flatMap(actor =>
            (actor === 'authenticated' ? wildcardRequestTargets : wildcardRequestTargets.slice(2, 8)).flatMap(test =>
              ['origin', 'absolute'].map(form => ({ ...owner, ...test, actor, form }))
            )
          )
        );
        describe(profile, () => {
          const results: {
            wire: Wire;
            state: unknown[];
          }[][] = [[]];
          before(async () => {
            try {
              for (const [host, mode] of ['fastify'].entries()) {
                const policies = portalHttpPolicies();
                // Controller identities come from declarations, not aliases.
                if (reduced)
                  for (const route of audit.migratedDeclarations.filter((row: { path: string }) =>
                    row.path.includes('/i18n/entries/')
                  ))
                    policies[route.controller] = ['noCache', 'brandingAndPortal'];
                const f = await referenceProductionFixture(mode === 'fastify', policies, undefined, {
                  declarations: audit.migratedDeclarations,
                  rootContext,
                });
                try {
                  const login = await session(f);
                  const brand = Object.assign(new BrandingModel(), f.brand);
                  const entries = f.data.reference.entries.get();
                  for (const key of keys)
                    await entries.setEntry(brand, 'en', 'translation', key, initial(key), { noReload: true });
                  for (const c of cases) {
                    const target =
                      (c.form === 'absolute' ? 'http://evil.invalid' : '') +
                      rootContext +
                      '/default/rdmp' +
                      c.path +
                      c.suffix;
                    const headers: Record<string, string> = {
                      Origin: referenceOrigin,
                      'Content-Type': 'application/json',
                    };
                    if (c.actor === 'authenticated')
                      Object.assign(headers, login, { Authorization: 'Bearer pilot-api-token' });
                    const response = await wire(
                      f.url,
                      target,
                      c.method,
                      headers,
                      c.action === 'write' ? JSON.stringify({ value: 'After:' + c.key }) : ''
                    );
                    const label = `${profile} ${mode} ${c.actor} ${c.method} ${target}`;
                    if (c.actor === 'authenticated')
                      assert.equal(response.status, 200, label + ': ' + Buffer.from(response.body, 'base64'));
                    const state = await Promise.all(
                      keys.map(async key => {
                        const entry = await entries.getEntry(brand, 'en', 'translation', key);
                        const changed = key === c.key && response.status === 200;
                        const expected =
                          changed && c.action === 'delete'
                            ? null
                            : changed && c.action === 'write'
                              ? 'After:' + key
                              : initial(key);
                        assert.equal(entry?.value ?? null, expected, label + ' persisted key=' + key);
                        return { key, value: entry?.value ?? null };
                      })
                    );
                    if (response.status === 200 && c.method === 'GET') {
                      const body = JSON.parse(Buffer.from(response.body, 'base64').toString());
                      const entry = body.data ?? body;
                      assert.equal(entry.key, c.key, label);
                      assert.equal(entry.value, initial(c.key), label);
                    }
                    if (c.method === 'HEAD') assert.equal(response.body, '', label);
                    const stable = normalize(response);
                    // Persisted identities and timestamps vary by isolated DB.
                    const text = Buffer.from(stable.body, 'base64')
                      .toString()
                      .replace(/\b[0-9a-f]{24}\b/g, '<id>')
                      .replace(/"(createdAt|updatedAt)":"[^"]*"/g, '"$1":"<time>"');
                    results[host].push({ wire: { ...stable, body: Buffer.from(text).toString('base64') }, state });
                    if (response.status === 200 && c.action !== 'read')
                      await entries.setEntry(brand, 'en', 'translation', c.key, initial(c.key), { noReload: true });
                  }
                } finally {
                  await f.close();
                }
              }
              if (process.env.FM031_RESULTS)
                await writeFile(
                  path.join(process.env.FM031_RESULTS, 'wildcard-translations-' + profile + '.json'),
                  JSON.stringify({ cases, results }, null, 2)
                );
            } finally {
            }
          });
          cases.forEach((c, index) =>
            it(`${c.actor} ${c.method} ${c.path} ${c.form} ${c.suffix}`, () => {
              const actual = results[0][index];
              assertGolden('translation-targets', profile + ':' + index, actual);
              assert(actual, 'Every target was exercised');
              const expected = require('./fixtures/translation-responses.json')[profile][index];
              assert.deepEqual(c, expected.input, 'Frozen translation request identity');
              assert.deepEqual(actual, expected.output, 'Frozen translation wire and persisted-state contract');
              assert.equal(
                actual.wire.status,
                c.actor === 'authenticated' || (reduced && c.action === 'read') ? 200 : reduced ? 403 : 401
              );
              if (c.method === 'HEAD') assert.equal(actual.wire.body, '');
            })
          );
        });
      }
  });
}

goldenControls('translation-targets');
