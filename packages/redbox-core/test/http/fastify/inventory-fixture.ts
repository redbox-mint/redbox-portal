import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { apiRouteRegistrations, type RouteRegistration } from '../../../dist/http/fastify/routes';
import type { ApiRouteDefinition } from '../../../dist/api-routes/types';

const root = path.resolve(__dirname, '../../../../..');
export interface InventoryRoute {
  name: string;
  method: RouteRegistration['declaration']['method'];
  path: string;
  original: { path: string; csrf?: boolean; access?: string };
  source: { file: string; export: string; index?: number };
  implementation: { file: string };
  controller: string | null;
  action: string | null;
  access: { effectivePolicies: (string | false)[]; declaredAccess: string | null };
  csrf: { effective: string };
  head: { behavior: string; explicitTarget?: string };
}
export const inventory: { routes: InventoryRoute[] } = JSON.parse(
  readFileSync(path.join(root, 'support/specs/fastify-migration/evidence/FM-002.inventory.json'), 'utf8')
);
const api = new Map(apiRouteRegistrations().map(route => [route.declaration.name, route]));

/** Actual executable validation objects; policies/CSRF are the retained FM-002
 * mount metadata, whose generator/source-hash drift check runs in routes.test.
 */
export function inventoryRegistration(row: InventoryRoute): RouteRegistration {
  const source = require(path.join(root, row.source.file.replace('/src/', '/dist/').replace(/\.ts$/, '.js')))[
    row.source.export
  ];
  const declaration = Array.isArray(source) ? source[row.source.index!] : source;
  assert.equal(declaration.path, row.original.path);
  assert.equal(declaration.method, row.method);
  const effectiveCsrf =
    row.csrf.effective === 'protect except GET/HEAD/OPTIONS' && ['get', 'head', 'options'].includes(row.method)
      ? 'none'
      : row.csrf.effective.replace(' on ALL methods, including HEAD/OPTIONS', '');
  const registered = api.get(row.name);
  if (registered) return { ...registered, effectiveCsrf };
  const effective = row.access.effectivePolicies;
  return {
    provider: '@researchdatabox/redbox-core',
    effectivePolicies: effective,
    effectiveCsrf,
    declaration: {
      name: row.name,
      method: row.method,
      path: declaration.path,
      controller: row.controller ?? 'Portal',
      action: row.action ?? row.source.export,
      csrf: declaration.csrf,
      validation: declaration.request as ApiRouteDefinition['request'],
      access:
        row.access.declaredAccess === 'public'
          ? { kind: 'public' }
          : effective.includes(false)
            ? { kind: 'deny' }
            : effective.length
              ? { kind: 'policies', names: effective as [string, ...string[]] }
              : { kind: 'public' },
      ...(row.method === 'get' && row.head.behavior === 'explicit-405'
        ? { head: { kind: 'deny', allow: 'GET' } as const }
        : {}),
    },
  };
}

/** Mount order comes from the production composition and each owning adapter,
 * rather than the inventory generator's import order. No controllers are run.
 */
export function productionInventoryOrder(): InventoryRoute[] {
  const application = readFileSync(path.join(root, 'packages/redbox-core/src/application/portal/http.ts'), 'utf8');
  const positions = new Map<string, number>();
  const owners = new Map<string, string>();
  for (const row of inventory.routes) {
    const key = row.source.file + '#' + row.source.export;
    if (owners.has(key)) continue;
    const source = ts.createSourceFile(
      row.source.file,
      readFileSync(path.join(root, row.source.file), 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    const isMount = (node: ts.Node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && !!node.name?.text.startsWith('mount');
    const mounts = source.statements.filter(isMount);
    if (!mounts.length) {
      const implementation = ts.createSourceFile(
        row.implementation.file,
        readFileSync(path.join(root, row.implementation.file), 'utf8'),
        ts.ScriptTarget.Latest,
        true
      );
      mounts.push(...implementation.statements.filter(isMount));
    }
    const referencing = mounts.filter(node => {
      let found = false;
      const visit = (child: ts.Node) => {
        if (ts.isIdentifier(child) && child.text === row.source.export) found = true;
        ts.forEachChild(child, visit);
      };
      if (node.body) visit(node.body);
      return found;
    });
    const candidates = referencing.length ? referencing : mounts;
    assert.equal(candidates.length, 1, 'Unambiguous production mount for ' + key);
    const owner = candidates[0].name!.text;
    const position = application.indexOf('http.' + owner + '(');
    assert(position >= 0, 'Production composition calls ' + owner);
    owners.set(key, owner);
    // Shared mounts may register several collections (e.g. forms before the
    // configuration loop, font delivery after branding). Keep their body order.
    const body = candidates[0].body;
    let reference = body?.end ?? 0;
    const locate = (node: ts.Node) => {
      if (ts.isIdentifier(node) && node.text === row.source.export) reference = Math.min(reference, node.pos);
      ts.forEachChild(node, locate);
    };
    if (body) locate(body);
    positions.set(key, position + (body ? (reference - body.pos) / (body.end - body.pos + 1) : 0));
  }
  return [...inventory.routes].sort((a, b) => {
    const order =
      positions.get(a.source.file + '#' + a.source.export)! - positions.get(b.source.file + '#' + b.source.export)!;
    // The actual OIDC mount installs HEAD before GET, unlike its metadata array.
    if (!order && a.path === b.path && a.method !== b.method)
      return Number(b.method === 'head') - Number(a.method === 'head');
    return order || (a.source.index ?? 0) - (b.source.index ?? 0);
  });
}
