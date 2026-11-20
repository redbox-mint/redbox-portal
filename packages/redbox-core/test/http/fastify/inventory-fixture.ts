import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { portalHttpOwnerDeclarations } from '../../../src/http/ownedRoutes';
import { brandingUploadRoutes } from '../../../src/http/uploadRoutes';
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
  const declaration = portalHttpOwnerDeclarations({
    server: { rootContext: '' },
    companion: { enabled: false, route: '/companion' },
  })
    .map(owner => owner.route)
    .concat(brandingUploadRoutes)
    .find(route => route.method === row.method && route.path === row.original.path);
  assert(declaration, 'Current native declaration for ' + row.name);
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
      csrf: row.original.csrf,
      validation: ('request' in declaration ? declaration.request : undefined) as ApiRouteDefinition['request'],
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
  const { names } = JSON.parse(
    readFileSync(path.join(root, 'support/specs/fastify-migration/evidence/FM-043-retired-route-order.json'), 'utf8')
  ) as { names: string[] };
  assert.deepEqual(new Set(names), new Set(inventory.routes.map(row => row.name)));
  return names.map(name => inventory.routes.find(row => row.name === name)!);
}
