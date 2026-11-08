import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { createHash } from 'node:crypto';

/** Reject consumer-side type erasure independently of tsc, including suppression comments. */
export function checkConsumerSource(source: string) {
  assert(!/@ts-(?:ignore|nocheck|expect-error)/.test(source), 'Consumer cannot suppress type checking');
  const file = ts.createSourceFile('consumer.ts', source, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node) => {
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      assert(
        node.type.kind !== ts.SyntaxKind.AnyKeyword && node.type.kind !== ts.SyntaxKind.UnknownKeyword,
        'Consumer cannot erase factory types'
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
}
export async function installedPilot() {
  const directory = await mkdtemp(path.join(tmpdir(), 'fm019-consumer-'));
  const root = path.resolve(__dirname, '../../../../..');
  const run = (cmd: string, args: string[], cwd = directory) =>
    execFileSync('timeout', ['300', cmd, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const archives = path.join(directory, 'archives');
    await mkdir(archives);
    const packages = [
      'sails-ng-common',
      'agenda-sqs-backend',
      'raido',
      'rva-registry',
      'redbox-core',
      'sails-hook-redbox-storage-mongo',
    ];
    const dependencies: Record<string, string> = {};
    for (const folder of packages) {
      const cwd = path.join(root, 'packages', folder);
      const manifest = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8'));
      const packed = JSON.parse(
        run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', archives], cwd)
      )[0];
      dependencies[manifest.name] = 'file:' + path.join(archives, packed.filename);
    }
    await writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({
        name: 'fm019-consumer',
        private: true,
        version: '1.0.0',
        dependencies,
        overrides: Object.fromEntries(Object.entries(dependencies)),
      })
    );
    run('npm', ['install', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund', '--package-lock=false']);
    const source = await readFile(path.join(__dirname, 'fixtures/api2-pilot/index.ts'), 'utf8');
    checkConsumerSource(source);
    const author = path.join(directory, 'author');
    await mkdir(author);
    await writeFile(path.join(author, 'index.ts'), source);
    await writeFile(
      path.join(author, 'package.json'),
      await readFile(path.join(__dirname, 'fixtures/api2-pilot/package.json'))
    );
    const compiler = path.join(root, 'packages/redbox-core/node_modules/.bin/tsc');
    run(
      compiler,
      [
        '--strict',
        '--skipLibCheck',
        '--target',
        'ES2024',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        '--declaration',
        '--types',
        'node',
        'index.ts',
      ],
      author
    );
    const packed = JSON.parse(
      run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', archives], author)
    )[0];
    run('npm', [
      'install',
      '--ignore-scripts',
      '--prefer-offline',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      path.join(archives, packed.filename),
    ]);
    for (const [name, registration] of [
      ['z-base', 'registerBase'],
      ['a-replacement', 'registerReplacement'],
    ]) {
      const author = path.join(directory, name);
      await mkdir(author);
      await writeFile(
        path.join(author, 'package.json'),
        JSON.stringify({
          name,
          version: '1.0.0',
          main: 'index.cjs',
          files: ['index.cjs'],
          redbox: { extension: '.' },
          peerDependencies: { 'fm019-api2-pilot': '1.0.0' },
        })
      );
      await writeFile(
        path.join(author, 'index.cjs'),
        "exports.registerRedboxExtension = require('fm019-api2-pilot')." + registration + ';\n'
      );
      const archive = JSON.parse(
        run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', archives], author)
      )[0];
      run('npm', [
        'install',
        '--ignore-scripts',
        '--prefer-offline',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
        path.join(archives, archive.filename),
      ]);
      assert(!(await lstat(path.join(directory, 'node_modules', name))).isSymbolicLink());
      await rm(author, { recursive: true });
    }
    const installed = path.join(directory, 'node_modules/fm019-api2-pilot');
    const core = path.join(directory, 'node_modules/@researchdatabox/redbox-core');
    assert(!(await lstat(installed)).isSymbolicLink());
    assert(!(await lstat(core)).isSymbolicLink());
    await assert.rejects(lstat(path.join(core, 'dist/application/portal/fastifyPilot.js')), { code: 'ENOENT' });
    // Type-check a separate installed consumer, after removing the author source.
    await rm(author, { recursive: true });
    const consumer = `import { bindPilot, replacement, catalogue } from 'fm019-api2-pilot';\nimport type { ReplacementInput, NewInput } from 'fm019-api2-pilot';\nimport { bindControllerFactory } from '@researchdatabox/redbox-core/http';\ndeclare const record: ReplacementInput;\ndeclare const input: NewInput;\nbindPilot(record, input);\nbindControllerFactory(replacement, record);\nbindControllerFactory(catalogue, input);\nimport { createPortalFastifyApplication, createPortalFastifyHost } from '@researchdatabox/redbox-core/portal';\ndeclare const portal: Awaited<ReturnType<typeof createPortalFastifyApplication>>;\ndeclare const options: Parameters<typeof createPortalFastifyHost>[1];\ncreatePortalFastifyHost(portal, options);\ndeclare const bootstrap: Parameters<typeof createPortalFastifyApplication>[0];\ncreatePortalFastifyApplication(bootstrap).then(portal => createPortalFastifyHost(portal, options));\n`;
    checkConsumerSource(consumer);
    await writeFile(path.join(directory, 'consumer.ts'), consumer);
    run(compiler, [
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--target',
      'ES2024',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--types',
      'node',
      'consumer.ts',
    ]);
    // These are the exact stricter types used at the production call sites.
    // Missing security/order/namespace selections must be compiler errors for an
    // installed consumer, independently of runtime regression assertions.
    const productionTypes = `import type { ProductionExtensionResolutionOptions, ProductionControllerHostOptions } from '@researchdatabox/redbox-core/portal';
declare const resolution: ProductionExtensionResolutionOptions;
declare const host: ProductionControllerHostOptions;
`;
    const omissions = [
      ['resolution', 'apiConfiguration', 'ProductionExtensionResolutionOptions'],
      ['resolution', 'hookLoadPriority', 'ProductionExtensionResolutionOptions'],
      ['host', 'moduleNames', 'ProductionControllerHostOptions'],
      ['host', 'trustProxy', 'ProductionControllerHostOptions'],
    ];
    const invalidProduction =
      productionTypes +
      omissions
        .map(
          ([source, key, type]) =>
            `const { ${key}, ...without_${key} } = ${source};\nconst missing_${key}: ${type} = without_${key};\n`
        )
        .join('');
    checkConsumerSource(invalidProduction);
    await writeFile(path.join(directory, 'invalid-production.ts'), invalidProduction);
    let diagnostics = '';
    try {
      run(compiler, [
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        '--target',
        'ES2024',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        '--types',
        'node',
        'invalid-production.ts',
      ]);
      assert.fail('Omitted production selections must fail tsc');
    } catch (error) {
      assert(error && typeof error === 'object' && 'stdout' in error, 'tsc must produce omission diagnostics');
      diagnostics = String(error.stdout);
    }
    for (const [, key] of omissions) assert(diagnostics.includes(`Property '${key}' is missing`), diagnostics);
    await writeFile(
      path.join(directory, 'invalid.ts'),
      "import { replacement } from 'fm019-api2-pilot';\nimport { bindControllerFactory } from '@researchdatabox/redbox-core/http';\nbindControllerFactory(replacement, { institution: { name: () => 'missing domain inputs' } });\n"
    );
    assert.throws(
      () =>
        run(compiler, [
          '--noEmit',
          '--strict',
          '--skipLibCheck',
          '--target',
          'ES2024',
          '--module',
          'NodeNext',
          '--moduleResolution',
          'NodeNext',
          '--types',
          'node',
          'invalid.ts',
        ]),
      /Command failed/,
      'Missing concrete dependency inputs must fail tsc'
    );
    // Compile the retained domain fixtures against the SAME installed core as
    // the host/extension. Trusted save contexts intentionally use package-local
    // identity; source and installed domains must never be mixed to fake parity.
    const harness = path.join(directory, 'harness');
    await mkdir(harness);
    for (const filename of [
      'mongoFixture',
      'pilotFixture',
      'prepareRecordReads',
      'recordWriteFixture',
      'fastify/productionPilotFixture',
    ]) {
      const input = await readFile(path.join(root, 'packages/redbox-core/test/http', filename + '.ts'), 'utf8');
      const relocated = input.replace(
        /(['"])((?:\.\.\/){2,3}src\/[^'"]+)\1/g,
        (_match, quote, specifier) =>
          quote +
          path.join(directory, 'node_modules/@researchdatabox/redbox-core/dist', specifier.split('/src/')[1]) +
          quote
      );
      const output = ts.transpileModule(relocated, {
        compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
      }).outputText;
      await mkdir(path.dirname(path.join(harness, filename + '.js')), { recursive: true });
      await writeFile(path.join(harness, filename + '.js'), output);
    }
    const application = path.join(directory, 'application');
    await mkdir(application);
    await writeFile(
      path.join(application, 'package.json'),
      JSON.stringify({
        name: 'fm019-application',
        private: true,
        dependencies: { 'fm019-api2-pilot': '1.0.0', 'z-base': '1.0.0', 'a-replacement': '1.0.0' },
        hookLoadPriority: ['a-replacement'],
      })
    );
    const hashes: Record<string, string> = {};
    for (const [name, filename] of Object.entries({
      core: dependencies['@researchdatabox/redbox-core'].slice(5),
      extension: path.join(archives, packed.filename),
    }))
      hashes[name] = createHash('sha256')
        .update(await readFile(filename))
        .digest('hex');
    return {
      directory,
      application,
      installed,
      hashes,
      nativeProductionFixture: require(path.join(harness, 'fastify/productionPilotFixture.js'))
        .productionPilotFixture as typeof import('./productionPilotFixture').productionPilotFixture,
      module: require(installed) as import('./productionPilotFixture').PilotExtension,
      close: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
