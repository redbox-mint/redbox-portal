import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import {
  CATALOGUE_SCHEMA_VERSION,
  Catalogue,
  DocumentationDiagnostic,
  DocumentationHealth,
  SurfaceContract,
} from './catalogue';
import { extractCatalogue } from './extract';
import { catalogueMarkdown, healthMarkdown, renderSite } from './render';
import { createProgram, repositoryRoot, sourceCommit } from './source';

const auditOnly = process.argv.includes('--audit-only');
const siteDirectory = path.join(repositoryRoot, '.tmp/generated-docs-site');
const healthDirectory = path.join(repositoryRoot, '.tmp/documentation-health');
const intermediateDirectory = path.join(repositoryRoot, '.tmp/documentation-intermediate');
const schemaPath = path.join(siteDirectory, 'schemas/form-config.schema.json');

function run(command: string, args: string[], label: string): void {
  const result = spawnSync(command, args, { cwd: repositoryRoot, encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) {
    throw new Error(`${label} failed.\n${result.stdout}\n${result.stderr}`);
  }
}

function generateTypeDocReflection(): void {
  fs.mkdirSync(intermediateDirectory, { recursive: true });
  run(
    process.execPath,
    [
      path.join(repositoryRoot, 'node_modules/typedoc/bin/typedoc'),
      '--options',
      'typedoc.json',
      '--json',
      path.join(intermediateDirectory, 'typedoc.json'),
    ],
    'TypeDoc extraction'
  );
}

function generateSchema(): Record<string, unknown> {
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
  run(
    process.execPath,
    [
      path.join(repositoryRoot, 'node_modules/ts-json-schema-generator/bin/ts-json-schema-generator.js'),
      '--path',
      'packages/sails-ng-common/src/**/*.ts',
      '--type',
      'FormConfig',
      '--expose',
      'none',
      '--tsconfig',
      'packages/sails-ng-common/tsconfig.json',
      '--out',
      schemaPath,
    ],
    'FormConfig JSON Schema generation'
  );
  return JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as Record<string, unknown>;
}

function validationLogger(): Record<string, (...args: unknown[]) => void> {
  const noop = (): void => undefined;
  return {
    silly: noop,
    verbose: noop,
    trace: noop,
    debug: noop,
    log: noop,
    info: noop,
    warn: noop,
    error: noop,
    crit: noop,
    fatal: noop,
    silent: noop,
    blank: noop,
  };
}

async function validateExamples(
  schema: Record<string, unknown>,
  surfaces: SurfaceContract[]
): Promise<DocumentationDiagnostic[]> {
  const diagnostics: DocumentationDiagnostic[] = [];
  const ajv = new Ajv({ allErrors: true, strict: false, formats: { 'date-time': true } });
  const validate = ajv.compile(schema);
  const examplesDirectory = path.join(repositoryRoot, 'support/documentation/examples/forms');
  let ConstructFormConfigVisitor:
    | (new (logger: Record<string, (...args: unknown[]) => void>) => {
        start(options: { data: Record<string, unknown>; formMode: 'edit' }): Promise<unknown>;
      })
    | undefined;
  try {
    ({ ConstructFormConfigVisitor } = require(
      path.join(repositoryRoot, 'packages/redbox-core/src/visitor/construct.visitor.ts')
    ));
  } catch (error) {
    diagnostics.push({
      code: 'invalid-example',
      severity: 'advisory',
      message: `Could not load the construction visitor: ${String(error)}`,
    });
  }

  for (const filename of fs
    .readdirSync(examplesDirectory)
    .filter(name => name.endsWith('.json'))
    .sort()) {
    const absolute = path.join(examplesDirectory, filename);
    const raw = fs.readFileSync(absolute, 'utf8');
    const example = JSON.parse(raw) as { componentDefinitions?: Array<{ component?: { class?: string } }> };
    const componentName = example.componentDefinitions?.[0]?.component?.class;
    const surface = surfaces.find(candidate => candidate.id === `form-component:${componentName}`);
    if (surface) surface.example = raw.trim();
    if (filename === 'simple-input.json') {
      const formConfig = surfaces.find(candidate => candidate.id === 'form-config:FormConfig');
      if (formConfig) formConfig.example = raw.trim();
    }
    if (!validate(example)) {
      diagnostics.push({
        code: 'invalid-example',
        severity: 'advisory',
        surfaceId: surface?.id,
        message: `${filename} does not validate against FormConfig JSON Schema: ${ajv.errorsText(validate.errors)}`,
      });
      continue;
    }
    if (ConstructFormConfigVisitor) {
      try {
        const visitor = new ConstructFormConfigVisitor(validationLogger());
        await visitor.start({ data: example as Record<string, unknown>, formMode: 'edit' });
      } catch (error) {
        diagnostics.push({
          code: 'invalid-example',
          severity: 'advisory',
          surfaceId: surface?.id,
          message: `${filename} was rejected by ConstructFormConfigVisitor: ${String(error)}`,
        });
      }
    }
  }

  const serializedSchema = JSON.stringify(schema);
  for (const surface of surfaces.filter(candidate => candidate.kind === 'form-component')) {
    if (
      !serializedSchema.includes(`\"const\":\"${surface.name}\"`) &&
      !serializedSchema.includes(`\"${surface.name}\"`)
    ) {
      diagnostics.push({
        code: 'form-contract-mismatch',
        severity: 'advisory',
        surfaceId: surface.id,
        message: `${surface.name} is registered but absent from the generated FormConfig JSON Schema.`,
        source: surface.source,
      });
    }
  }

  run(
    process.execPath,
    [
      path.join(repositoryRoot, 'node_modules/.bin/tsc'),
      '--project',
      'support/documentation/examples/tsconfig.json',
    ],
    'Hook example type check'
  );
  const hookExample = fs
    .readFileSync(path.join(repositoryRoot, 'support/documentation/examples/hook-override.ts'), 'utf8')
    .trim();
  for (const surface of surfaces.filter(candidate =>
    [
      'hook-protocol:defineRedboxHook',
      'base-service:Service',
      'base-controller:Controller',
      'service:RecordsService',
      'ajax-controller:RecordController',
    ].includes(candidate.id)
  )) {
    surface.example = hookExample;
  }
  const classifiedExamples = surfaces.filter(
    surface =>
      surface.kind === 'form-component' && surface.lifecycle !== 'unclassified' && surface.lifecycle !== 'internal'
  );
  for (const surface of classifiedExamples) {
    if (!surface.example)
      diagnostics.push({
        code: 'missing-example',
        severity: 'advisory',
        surfaceId: surface.id,
        message: `${surface.name} has no validated example fixture.`,
        source: surface.source,
      });
  }
  return diagnostics;
}

function validateLinks(surfaces: SurfaceContract[]): DocumentationDiagnostic[] {
  return surfaces.flatMap(surface =>
    surface.documentation.see
      .filter(link => !/^https:\/\/github\.com\/redbox-mint\/redbox-portal\/wiki\//.test(link))
      .map(link => ({
        code: 'invalid-link' as const,
        severity: 'advisory' as const,
        surfaceId: surface.id,
        message: `Documentation link must use the canonical GitHub Wiki URL: ${link}`,
        source: surface.source,
      }))
  );
}

function composeRestReference(): void {
  const source = path.join(repositoryRoot, 'support/docs/generated/api');
  const target = path.join(siteDirectory, 'api');
  fs.mkdirSync(target, { recursive: true });
  if (fs.existsSync(source)) {
    fs.cpSync(source, target, { recursive: true });
    return;
  }
  fs.writeFileSync(
    path.join(target, 'index.html'),
    '<!doctype html><title>REST API reference</title><p>Run <code>npm run doc:api</code> before generation to include the REST API reference.</p>'
  );
}

async function main(): Promise<void> {
  fs.rmSync(healthDirectory, { recursive: true, force: true });
  fs.mkdirSync(healthDirectory, { recursive: true });
  if (!auditOnly) {
    fs.rmSync(siteDirectory, { recursive: true, force: true });
    fs.rmSync(intermediateDirectory, { recursive: true, force: true });
    fs.mkdirSync(siteDirectory, { recursive: true });
    generateTypeDocReflection();
  } else {
    fs.mkdirSync(siteDirectory, { recursive: true });
  }

  const program = createProgram();
  const extracted = extractCatalogue(program);
  const schema = generateSchema();
  const exampleDiagnostics = await validateExamples(schema, extracted.surfaces);
  const diagnostics = [...extracted.diagnostics, ...exampleDiagnostics, ...validateLinks(extracted.surfaces)].sort(
    (left, right) =>
      `${left.code}:${left.surfaceId ?? ''}:${left.message}`.localeCompare(
        `${right.code}:${right.surfaceId ?? ''}:${right.message}`
      )
  );
  const generatedAt = new Date().toISOString();
  const commit = sourceCommit();
  const publishedSurfaces = extracted.surfaces.filter(
    surface => surface.lifecycle !== 'unclassified' && surface.lifecycle !== 'internal'
  );
  const catalogue: Catalogue = {
    schemaVersion: CATALOGUE_SCHEMA_VERSION,
    generatedAt,
    sourceCommit: commit,
    surfaces: publishedSurfaces,
    diagnostics,
  };
  const health: DocumentationHealth = {
    schemaVersion: CATALOGUE_SCHEMA_VERSION,
    generatedAt,
    sourceCommit: commit,
    findingCount: diagnostics.length,
    findings: diagnostics,
  };

  fs.writeFileSync(path.join(healthDirectory, 'documentation-health.json'), `${JSON.stringify(health, null, 2)}\n`);
  fs.writeFileSync(path.join(healthDirectory, 'documentation-health.md'), healthMarkdown(health));
  if (!auditOnly) {
    renderSite(siteDirectory, catalogue);
    composeRestReference();
    fs.mkdirSync(path.join(siteDirectory, 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(siteDirectory, 'artifacts/catalogue.json'), `${JSON.stringify(catalogue, null, 2)}\n`);
    fs.writeFileSync(path.join(siteDirectory, 'artifacts/catalogue.md'), catalogueMarkdown(catalogue));
  }
  console.log(
    `Generated ${publishedSurfaces.length} published surfaces with ${diagnostics.length} advisory finding(s).`
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
