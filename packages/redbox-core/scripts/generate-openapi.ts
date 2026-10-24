import type { ApiRouteConfiguration } from '../src/api-routes';
import SwaggerParser from '@apidevtools/swagger-parser';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';

export interface GenerateOpenApiOptions {
  outDir: string;
  branding?: string;
  portal?: string;
}

type BuildMergedApiOpenApiDocumentImpl = (
  options: { branding?: string; portal?: string },
  configuration?: ApiRouteConfiguration
) => unknown;
type BuildMergedApiBlueprintImpl = (
  options: { branding?: string; portal?: string },
  configuration?: ApiRouteConfiguration
) => string;

interface OpenApiFileSystem {
  ensureDir(path: string): Promise<unknown>;
  writeFile(path: string, data: string, encoding?: BufferEncoding): Promise<unknown>;
}

interface SwaggerParserLike {
  validate(document: unknown): Promise<unknown>;
}

export interface GenerateOpenApiDependencies {
  configuration?: ApiRouteConfiguration;
  fsImpl?: OpenApiFileSystem;
  swaggerParser?: SwaggerParserLike;
  buildMergedApiOpenApiDocumentImpl?: BuildMergedApiOpenApiDocumentImpl;
  buildMergedApiBlueprintImpl?: BuildMergedApiBlueprintImpl;
  yamlStringifyImpl?: typeof yaml.stringify;
}

function readCliOption(name: string): string | undefined {
  const prefix = `--${name}=`;
  const indexWithEquals = process.argv.findIndex(arg => arg.startsWith(prefix));
  if (indexWithEquals >= 0) {
    const value = process.argv[indexWithEquals].slice(prefix.length).trim();
    return value.length ? value : undefined;
  }

  const indexWithSeparateValue = process.argv.findIndex(
    (arg, index) => arg === `--${name}` && index + 1 < process.argv.length
  );
  if (indexWithSeparateValue >= 0) {
    const value = process.argv[indexWithSeparateValue + 1]?.trim();
    return value ? value : undefined;
  }

  return undefined;
}

function resolveOutputDirectory(): string {
  const configuredOutDir = readCliOption('out-dir');
  if (configuredOutDir) {
    return path.resolve(process.cwd(), configuredOutDir);
  }

  return path.resolve(__dirname, '..', '..', '..', 'support', 'docs', 'generated', 'api');
}

async function loadApiDocBuilders(): Promise<{
  buildMergedApiOpenApiDocumentImpl: BuildMergedApiOpenApiDocumentImpl;
  buildMergedApiBlueprintImpl: BuildMergedApiBlueprintImpl;
}> {
  const apiRoutesModule = require('../src/api-routes') as typeof import('../src/api-routes');
  return {
    buildMergedApiOpenApiDocumentImpl: apiRoutesModule.buildMergedApiOpenApiDocument,
    buildMergedApiBlueprintImpl: apiRoutesModule.buildMergedApiBlueprint,
  };
}

export async function generateOpenApiArtifacts(
  options: GenerateOpenApiOptions,
  dependencies: GenerateOpenApiDependencies = {}
) {
  const fsImpl = dependencies.fsImpl ?? fs;
  const swaggerParser = dependencies.swaggerParser ?? (SwaggerParser as unknown as SwaggerParserLike);
  const yamlStringifyImpl = dependencies.yamlStringifyImpl ?? yaml.stringify;
  const apiDocBuilders =
    dependencies.buildMergedApiOpenApiDocumentImpl && dependencies.buildMergedApiBlueprintImpl
      ? undefined
      : await loadApiDocBuilders();
  const buildMergedApiOpenApiDocumentImpl =
    dependencies.buildMergedApiOpenApiDocumentImpl ?? apiDocBuilders!.buildMergedApiOpenApiDocumentImpl;
  const buildMergedApiBlueprintImpl =
    dependencies.buildMergedApiBlueprintImpl ?? apiDocBuilders!.buildMergedApiBlueprintImpl;

  const documentOptions = { branding: options.branding, portal: options.portal };
  const doc = dependencies.configuration
    ? buildMergedApiOpenApiDocumentImpl(documentOptions, dependencies.configuration)
    : buildMergedApiOpenApiDocumentImpl(documentOptions);
  const validatedDoc = await swaggerParser.validate(doc);
  const blueprint = dependencies.configuration
    ? buildMergedApiBlueprintImpl(documentOptions, dependencies.configuration)
    : buildMergedApiBlueprintImpl(documentOptions);

  await fsImpl.ensureDir(options.outDir);

  const jsonPath = path.join(options.outDir, 'openapi.json');
  await fsImpl.writeFile(jsonPath, JSON.stringify(validatedDoc, null, 2), 'utf8');

  const yamlPath = path.join(options.outDir, 'openapi.yaml');
  await fsImpl.writeFile(yamlPath, `---\n${yamlStringifyImpl(validatedDoc)}`, 'utf8');

  const blueprintPath = path.join(options.outDir, 'apidocs.apib');
  await fsImpl.writeFile(blueprintPath, blueprint, 'utf8');

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>ReDBox Portal API Docs</title>
    <style>body{margin:0;padding:0}</style>
  </head>
  <body>
    <div id="redoc"></div>
    <script src="https://cdn.redoc.ly/redoc/v2.5.2/bundles/redoc.standalone.js"></script>
    <script>
      // Load the generated OpenAPI JSON from the same folder
      Redoc.init('openapi.json', {}, document.getElementById('redoc'));
    </script>
  </body>
</html>`;

  const indexPath = path.join(options.outDir, 'index.html');
  await fsImpl.writeFile(indexPath, html, 'utf8');

  const renderedContext =
    options.branding || options.portal ? ` for ${[options.branding, options.portal].filter(Boolean).join('/')}` : '';
  console.log(`Wrote ${jsonPath}, ${yamlPath}, ${blueprintPath} and ${indexPath}${renderedContext}`);
}

async function main() {
  const outDir = resolveOutputDirectory();

  await generateOpenApiArtifacts({
    outDir,
    branding: readCliOption('branding'),
    portal: readCliOption('portal'),
  });
}

if (require.main === module) {
  main().catch(err => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
