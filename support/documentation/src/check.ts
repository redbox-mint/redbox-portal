import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { isDeepStrictEqual } from 'node:util';
import type { Catalogue } from './catalogue';
import { extractCatalogue, publicProtocolDeclarations } from './extract';
import { createProgram, repositoryRoot, sourceFile } from './source';

export function checkCatalogue(program: ts.Program, catalogue: Catalogue): void {
  const checker = program.getTypeChecker();
  const publicDeclarations = new Set<ts.Declaration>();
  for (const entry of ['index.ts', 'extensions/index.ts', 'http/index.ts', 'application/index.ts']) {
    const file = sourceFile(program, `packages/redbox-core/src/${entry}`);
    const symbol = checker.getSymbolAtLocation(file);
    assert.ok(symbol, `missing public module ${entry}`);
    for (const exported of checker.getExportsOfModule(symbol)) {
      const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      for (const declaration of target.declarations ?? []) publicDeclarations.add(declaration);
    }
  }
  for (const surface of catalogue.surfaces.filter(surface => surface.kind === 'hook-protocol')) {
    assert.ok(
      [...publicDeclarations].some(
        declaration =>
          path.relative(repositoryRoot, declaration.getSourceFile().fileName).replaceAll(path.sep, '/') ===
            surface.source.file &&
          'name' in declaration &&
          (declaration.name as ts.Identifier | undefined)?.text === surface.name
      ),
      `catalogue publishes a non-public protocol: ${surface.name}`
    );
    assert.doesNotMatch(
      JSON.stringify(surface),
      /RequestHandler|express-serve-static-core|http\/express/,
      `legacy HTTP contract in ${surface.name}`
    );
  }
  for (const { name } of publicProtocolDeclarations(program)) {
    assert.ok(
      catalogue.surfaces.some(surface => surface.id === `hook-protocol:${name}`),
      `missing public API2 protocol: ${name}`
    );
  }
  assert.ok(catalogue.surfaces.some(surface => surface.name === 'RedboxExtensionV2'));
  const expected = extractCatalogue(program).surfaces.filter(
    surface => surface.lifecycle !== 'unclassified' && surface.lifecycle !== 'internal'
  );
  const contract = (value: Catalogue['surfaces']) =>
    JSON.parse(JSON.stringify(value.map(({ example: _example, ...surface }) => surface)));
  assert.ok(
    isDeepStrictEqual(contract(catalogue.surfaces), contract(expected)),
    'generated catalogue differs from current declarations'
  );
}

export async function checkRestReference(directory: string): Promise<number> {
  const api = require(path.join(repositoryRoot, 'packages/redbox-core/src/api-routes'));
  const { apiRouteRegistrations } = require(path.join(repositoryRoot, 'packages/redbox-core/src/http/fastify/routes'));
  const routes = api.getMergedApiRoutes();
  const registrations = apiRouteRegistrations({ declarations: routes });
  assert.equal(registrations.length, routes.length, 'every declared API must have a normalized runtime binding');
  for (const route of routes) {
    assert.ok(
      registrations.some(
        (registration: { declaration: { api?: unknown; controller: string; action: string } }) =>
          registration.declaration.api === route &&
          registration.declaration.controller === route.controller &&
          registration.declaration.action === route.action
      ),
      `missing runtime binding for ${route.method} ${route.path}`
    );
  }
  const coreRequire = createRequire(path.join(repositoryRoot, 'packages/redbox-core/package.json'));
  const parser = coreRequire('@apidevtools/swagger-parser');
  const expected = await parser.validate(
    api.buildMergedApiOpenApiDocument({
      branding: process.env.DOCS_API_BRANDING,
      portal: process.env.DOCS_API_PORTAL,
    })
  );
  const actual = JSON.parse(fs.readFileSync(path.join(directory, 'openapi.json'), 'utf8'));
  assert.ok(
    isDeepStrictEqual(actual, JSON.parse(JSON.stringify(expected))),
    'generated OpenAPI differs from declared API routes'
  );
  // This also rejects missing/extra methods, stale operation IDs, policies, schemas and response metadata.
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
  const count = Object.values(actual.paths).reduce<number>(
    (sum, value) => sum + Object.keys(value as object).filter(method => methods.has(method)).length,
    0
  );
  assert.equal(count, routes.length, 'generated operations do not cover every declaration exactly once');
  return count;
}

export function checkSiteLinks(directory: string): number {
  let count = 0;
  const visit = (folder: string): void => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.name.endsWith('.html')) {
        for (const [, link] of fs.readFileSync(file, 'utf8').matchAll(/(?:href|src)="([^"]+)"/g)) {
          if (/^(?:[a-z]+:|\/\/|#)/i.test(link)) continue;
          const target = path.resolve(folder, decodeURIComponent(link.split(/[?#]/)[0]));
          assert.ok(target.startsWith(directory + path.sep), `site link escapes output: ${link}`);
          assert.ok(fs.existsSync(target), `broken generated link: ${file} → ${link}`);
          count++;
        }
      }
    }
  };
  visit(directory);
  return count;
}

async function main(): Promise<void> {
  const directory = path.join(repositoryRoot, '.tmp/generated-docs-site');
  const catalogue: Catalogue = JSON.parse(fs.readFileSync(path.join(directory, 'artifacts/catalogue.json'), 'utf8'));
  checkCatalogue(createProgram(), catalogue);
  const operations = await checkRestReference(path.join(directory, 'api'));
  const links = checkSiteLinks(directory);
  console.log(
    `Reference contracts agree: ${catalogue.surfaces.length} surfaces, ${operations} API operations, ${links} local links.`
  );
}
if (require.main === module)
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
