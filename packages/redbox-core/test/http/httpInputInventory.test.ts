import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ownedHttpDeclarations } from '../../src/http/express/apiManifest';
import { portalOwnedHttpRoutes } from '../../src/http/express/ownedRoutes';
import { canonicalHttpRoutePath } from '../../src/extensions/resolution';
import { getObjectSchemaShape } from '../../src/api-routes/helpers';
import { buildRequestSourceInput } from '../../src/api-routes/request-extraction';
import type { ApiRouteDefinition, ApiRequestSource } from '../../src/api-routes/types';
import type { ZodType } from 'zod';

// Generation uses the pinned Git baseline; running this permanent gate requires no .git.
const inventory = JSON.parse(
  fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../../test/fixtures/sails-retirement/http-acceptance.json'
    ),
    'utf8'
  )
);
const normalize = (value: string) => value.replace(':key*', '*key').replace('datastream*', 'datastream{*tail}');
const key = (route: { method: string; path: string }) => route.method + ' ' + normalize(route.path);
const routes = new Map(ownedHttpDeclarations.map(route => [key(route), route]));
const samples: Record<string, unknown> = {
  absent: undefined,
  null: null,
  empty: '',
  text: 'sample',
  'numeric-string': '12',
  integer: 12,
  'zero-string': '0',
  'true-string': 'true',
  'false-string': 'false',
  boolean: true,
  array: ['sample'],
  object: { nested: 'sample' },
};

describe('Complete HTTP input inventory', () => {
  it('accounts for every native matcher, implicit HEAD, all-method route, and conditional Companion/health route', () => {
    const expanded = new Set<string>();
    for (const route of [
      ...inventory.rows,
      { method: 'all', path: '/companion' },
      { method: 'all', path: '/companion/{*companionPath}' },
      { method: 'get', path: '/healthz' },
      { method: 'get', path: '/readyz' },
    ]) {
      const methods =
        route.method === 'all'
          ? ['get', 'head', 'post', 'put', 'patch', 'delete', 'options']
          : route.method === 'get'
            ? ['get', 'head']
            : [route.method];
      methods.forEach(method => expanded.add(method + ' ' + canonicalHttpRoutePath(route.path)));
    }
    const actual = portalOwnedHttpRoutes({
      server: { rootContext: '' },
      companion: { enabled: true, route: '/companion' },
    });
    assert.deepEqual(
      [...expanded].sort(),
      actual.map(route => route.method + ' ' + canonicalHttpRoutePath(route.path)).sort()
    );
    assert.equal(inventory.rows.length, 335);
    assert.equal(inventory.rows.filter((route: { path: string }) => route.path.includes('/api/')).length, 152);
    assert.equal(inventory.supplemental.length, 10);
    assert.equal(inventory.bundled.length, 3);
    assert.equal(inventory.baselineCoverage.length, 331);
    assert.equal(inventory.counts.unresolvedBaselinePatterns, 0);
    assert.equal(inventory.counts.differences, 0);
    assert.equal(
      inventory.counts.cases,
      inventory.counts.differentialCases + inventory.counts.currentAliasSnapshotCases
    );
    assert.equal(
      inventory.nativeCaseGroups.reduce(
        (count: number, group: { acceptedCases?: number; controlCases?: number }) =>
          count + (group.acceptedCases ?? 0) + (group.controlCases ?? 0),
        0
      ),
      59
    );
    for (const group of inventory.nativeCaseGroups)
      for (const id of group.routes) assert(inventory.rows.some((row: { id: string }) => row.id === id));
  });

  for (const row of inventory.rows) {
    it(`${row.id} ${row.method.toUpperCase()} ${row.path}: documented input disposition and acceptance cells`, () => {
      assert(row.current.file && row.current.export && row.disposition && row.verification.length);
      assert(
        row.baseline.resolved || ['HTTP-259', 'HTTP-264', 'HTTP-266'].includes(row.id),
        'Every controller action must trace to its actual baseline method, including inherited methods'
      );
      if (!row.contractCases.length) return;
      const route = routes.get(key(row)) as ApiRouteDefinition | undefined;
      assert(route?.request, 'Schema-bearing route disappeared from the native declarations');
      for (const cell of row.contractCases) {
        const source = cell.source as ApiRequestSource;
        const schema: ZodType | undefined =
          source === 'body' ? Object.values(route.request.body?.content ?? {})[0]?.schema : route.request[source];
        const field: ZodType | undefined = schema && getObjectSchemaShape(schema)?.[cell.name];
        assert(field, `Missing ${source}.${cell.name}`);
        const request: Record<string, Record<string, unknown>> = { params: {}, query: {}, headers: {}, body: {} };
        if (cell.case === 'primary-precedence') {
          for (const [i, location] of ['params', 'query', 'headers', 'body'].entries())
            request[location][cell.name] = String(31 + i);
        } else if (cell.case.startsWith('fallback-')) {
          request[cell.case.slice('fallback-'.length)][cell.name] = '12';
        } else {
          assert(Object.hasOwn(samples, cell.case), 'Unknown case ' + cell.case);
          if (samples[cell.case] !== undefined) request[source][cell.name] = samples[cell.case];
        }
        const value: unknown = (
          buildRequestSourceInput(request, route.request, source, schema) as Record<string, unknown> | undefined
        )?.[cell.name];
        const label = `${source}.${cell.name} ${cell.case}`;
        if (cell.mode === 'extraction') assert.deepEqual(value, cell.before, label);
        else {
          // Browser aliases gained a schema during retirement; those have a separately
          // labelled current snapshot, rather than a fictitious baseline validation result.
          assert.equal(field.safeParse(value).success, cell.before === null ? cell.after : cell.before, label);
          if (cell.before !== null) {
            assert.equal(value !== undefined, cell.baselineExtracted.defined, label);
            assert.deepEqual(value, cell.baselineExtracted.value, label);
          }
        }
      }
    });
  }
});
