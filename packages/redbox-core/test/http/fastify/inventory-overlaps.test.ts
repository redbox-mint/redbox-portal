import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { composeRoutes, coreRoutePrecedence, translateRoutePath } from '../../../dist/http/fastify/routes';
import { inventory, inventoryRegistration, productionInventoryOrder } from './inventory-fixture';

const registrations = productionInventoryOrder().map(inventoryRegistration);
const policies = [
  ...new Set(
    registrations.flatMap(route => route.effectivePolicies ?? []).filter((name): name is string => name !== false)
  ),
];
const pairKey = (first: string, second: string) => JSON.stringify([first, second].sort());
const report = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../../../support/specs/fastify-migration/evidence/FM-010.overlaps.json'),
    'utf8'
  )
);

describe('FM-010 complete inventory grammar and universal overlap audit', function () {
  this.timeout(120_000);
  it('accepts every live inventory pattern and declares each legitimate overlap individually', () => {
    assert.equal(registrations.length, 335);
    for (const row of inventory.routes) assert(translateRoutePath(row.original.path).length);
    assert.equal(report.length, 210);
    assert.equal(coreRoutePrecedence.length, 210);
    assert.equal(report.filter((entry: { disposition: string }) => entry.disposition === 'FM-034').length, 2);
    const promoted = new Set(
      report
        .filter((entry: { disposition: string }) => entry.disposition === 'FM-034')
        .map(({ name }: { name: string }) => name)
    );
    assert.deepEqual(
      report
        .filter((entry: { disposition: string }) => entry.disposition === 'declared')
        .map(({ name, reason, winner, over }: { name: string; reason: string; winner: string; over: string }) => ({
          name,
          reason,
          winner,
          over,
        })),
      coreRoutePrecedence.filter(entry => !promoted.has(entry.name))
    );
    for (const entry of report.filter((row: { disposition: string }) => row.disposition === 'FM-034')) {
      const selected = coreRoutePrecedence.find(edge => edge.name === entry.name);
      assert(selected);
      assert.equal(selected.winner, entry.winner);
      assert.equal(selected.over, entry.over);
      assert.match(selected.reason, /GET.*TUS.*HEAD/);
    }
    assert.equal(new Set(coreRoutePrecedence.map(entry => entry.name)).size, 210);
  });
  for (const rootContext of ['', '/research/v6'])
    for (const legacyOrder of [false, true]) {
      it(`rejects every undeclared overlap in all 335 sources, legacy=${legacyOrder}, root=${rootContext || '/'}`, async () => {
        let failure = '';
        try {
          await composeRoutes(registrations, { policyNames: policies, rootContext, legacyOrder });
        } catch (error) {
          failure = String(error);
        }
        const actual = new Set(
          [...failure.matchAll(/route overlap at \S+: (\S+) \/ (\S+) requires/g)].map(([, a, b]) => pairKey(a, b))
        );
        assert.deepEqual(
          actual,
          new Set(report.map((entry: { winner: string; over: string }) => pairKey(entry.winner, entry.over)))
        );
      });
      it(`resolves both GET/TUS splits with download GET and TUS HEAD ownership, legacy=${legacyOrder}, root=${rootContext || '/'}`, async () => {
        const fallthrough = new Map(
          inventory.routes
            .filter(row => row.head.behavior.includes('falls through'))
            .map(row => [row.name, row.head.explicitTarget!])
        );
        const effective = registrations.map(route =>
          fallthrough.has(route.declaration.name)
            ? { ...route, declaration: { ...route.declaration, head: { kind: 'none' as const } } }
            : route
        );
        const run = composeRoutes(effective, {
          policyNames: policies,
          rootContext,
          legacyOrder,
          precedence: coreRoutePrecedence,
        });
        if (!legacyOrder) {
          await assert.rejects(run, /cannot retain winner/);
          return;
        }
        const composition = await run;
        assert.equal(fallthrough.size, 2);
        for (const [download, tus] of fallthrough) {
          assert(
            composition.bindings.some(
              binding => binding.method === 'GET' && binding.route.declaration.name === download
            )
          );
          assert(
            !composition.bindings.some(
              binding => binding.method === 'HEAD' && binding.route.declaration.name === download
            )
          );
          assert(
            !composition.bindings.some(binding => binding.method === 'GET' && binding.route.declaration.name === tus)
          );
          for (const method of ['HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'])
            assert(
              composition.bindings.some(binding => binding.method === method && binding.route.declaration.name === tus)
            );
        }
      });
      it(`audits the effective table with real metadata, legacy=${legacyOrder}, root=${rootContext || '/'}`, async () => {
        const fallthrough = new Set(
          inventory.routes.filter(row => row.head.behavior.includes('falls through')).map(row => row.name)
        );
        const effective = registrations.filter(route => !fallthrough.has(route.declaration.name));
        const names = new Set(effective.map(route => route.declaration.name));
        const precedence = coreRoutePrecedence.filter(entry => names.has(entry.winner) && names.has(entry.over));
        const run = composeRoutes(effective, { policyNames: policies, rootContext, legacyOrder, precedence });
        if (!legacyOrder) {
          await assert.rejects(run, /cannot retain winner/);
          return;
        }
        const composition = await run;
        const real = composition.overlaps.filter(
          overlap => ![overlap.first, overlap.second].includes('portal.automatic-options')
        );
        assert(real.every(overlap => overlap.precedence?.reason));
        assert.deepEqual(
          new Set(real.map(overlap => pairKey(overlap.first, overlap.second))),
          new Set(precedence.map(entry => pairKey(entry.winner, entry.over)))
        );
        process.stdout.write(
          `FM-010 universal inventory: ${real.length} declared source pairs, ${composition.overlaps.length - real.length} named synthetic fallback pairs; root=${rootContext || '/'}.\n`
        );
      });
    }
});
