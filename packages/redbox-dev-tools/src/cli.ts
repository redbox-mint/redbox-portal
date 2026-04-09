import { spawnSync } from 'child_process';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { resolvePaths } from './utils/paths';
import { ControllerGenerator } from './generators/controller';
import { ServiceGenerator } from './generators/service';
import { AddMethodGenerator } from './generators/add-method';
import { AngularAppGenerator } from './generators/angular-app';
import { AngularServiceGenerator } from './generators/angular-service';
import { FormComponentGenerator } from './generators/form-component';
import { FormFieldGenerator } from './generators/form-field';
import { ModelGenerator } from './generators/model';
import {
  registerClientFormConfigCommand,
  registerMigrateDataClassificationCommand,
  registerMigrateFormConfigCommand, registerQuestionTreeDiagramCommand
} from './commands/form-config';
import { generateCompletionScript } from './completion';
import {
  parseAttributes,
  parseBelongsTo,
  parseHasMany,
  parseLanguageDefaults,
  parseNavMappings,
  parseRoutes,
} from './cli-parsers';

const program = new Command();
const forbiddenHookDeps = ['axios', 'rxjs', 'lodash', 'mocha', 'chai', 'ts-node', 'typescript'];

function readPackageJson(pkgPath: string): any {
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
}

function writePackageJson(pkgPath: string, pkg: any): void {
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

function migrateHookDependencyContract(pkg: any): any {
  const nextPkg = { ...pkg };
  nextPkg.dependencies = { ...(pkg.dependencies ?? {}) };
  nextPkg.devDependencies = { ...(pkg.devDependencies ?? {}) };
  nextPkg.peerDependencies = { ...(pkg.peerDependencies ?? {}) };

  for (const depName of forbiddenHookDeps) {
    delete nextPkg.dependencies[depName];
    delete nextPkg.devDependencies[depName];
    delete nextPkg.peerDependencies[depName];
  }

  delete nextPkg.dependencies['@researchdatabox/redbox-core'];
  delete nextPkg.dependencies['@researchdatabox/redbox-dev-tools'];
  delete nextPkg.dependencies['@researchdatabox/sails-ng-common'];
  delete nextPkg.devDependencies['@researchdatabox/sails-ng-common'];
  delete nextPkg.peerDependencies['@researchdatabox/sails-ng-common'];

  nextPkg.peerDependencies['@researchdatabox/redbox-core'] = nextPkg.peerDependencies['@researchdatabox/redbox-core'] ?? '*';
  nextPkg.devDependencies['@researchdatabox/redbox-dev-tools'] = nextPkg.devDependencies['@researchdatabox/redbox-dev-tools'] ?? '*';

  return nextPkg;
}

function findForbiddenHookDeps(pkg: any): string[] {
  const sections = ['dependencies', 'devDependencies', 'peerDependencies'] as const;
  const findings: string[] = [];

  for (const section of sections) {
    const deps = pkg[section] ?? {};
    for (const depName of forbiddenHookDeps) {
      if (deps[depName] != null) {
        findings.push(`${section}.${depName}`);
      }
    }
  }

  return findings;
}

program
  .name('redbox-dev-tools')
  .description('CLI for ReDBox hook development and code generation')
  .version('1.0.0')
  .option('--root <path>', 'ReDBox repo root directory (required for generators)')
  .option('--core-types-root <path>', 'Override core-types package root')
  .option('--angular-root <path>', 'Override angular projects root')
  .option('--dry-run', 'Print intended changes without writing files', false);

function resolveSkillsDir(): string {
  return path.resolve(__dirname, '..', 'skills');
}

program
  .command('completion <shell>')
  .description('Output shell completion script for bash, zsh, fish, or powershell')
  .action((shell: string) => {
    const normalized = shell.toLowerCase();
    try {
      const script = generateCompletionScript(normalized);
      process.stdout.write(script);
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}\n`);
      process.exit(1);
    }
  });

registerMigrateFormConfigCommand(program);
registerMigrateDataClassificationCommand(program);
registerClientFormConfigCommand(program);
registerQuestionTreeDiagramCommand(program);

program
  .command('init')
  .description('Initialize a new ReDBox hook project with TypeScript setup')
  .action(() => {
    console.log('🚀 Initializing ReDBox Hook project...\n');

    const cwd = process.cwd();

    const srcDir = path.join(cwd, 'src');
    const apiDir = path.join(srcDir, 'api');
    const controllersDir = path.join(apiDir, 'controllers');

    if (!fs.existsSync(srcDir)) {
      fs.mkdirSync(srcDir, { recursive: true });
    } else {
      console.log('ℹ️  src/ directory already exists');
    }

    if (!fs.existsSync(controllersDir)) {
      fs.mkdirSync(controllersDir, { recursive: true });
      console.log('✅ Created typescript/api/controllers/ directory structure');
    }

    // Create or update tsconfig.json
    const tsconfigPath = path.join(cwd, 'tsconfig.json');
    const tsconfig = {
      extends: '@researchdatabox/redbox-dev-tools/config/tsconfig.base.json',
      compilerOptions: {
        outDir: './dist',
        typeRoots: ['node_modules/@types', 'node_modules/@researchdatabox/redbox-dev-tools/node_modules/@types'],
      },
      include: ['src/**/*.ts', 'src/**/*.d.ts'],
    };

    if (!fs.existsSync(tsconfigPath)) {
      fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n');
      console.log('✅ Created tsconfig.json extending redbox-dev-tools');
    } else {
      console.log('⚠️  tsconfig.json already exists - skipping');
      console.log('   You may want to manually extend: @researchdatabox/redbox-dev-tools/config/tsconfig.base.json');
    }

    // Create a sample controller if none exists
    const sampleController = path.join(controllersDir, 'ExampleController.ts');
    if (!fs.existsSync(sampleController) && fs.readdirSync(controllersDir).length === 0) {
      const sampleCode = `// Example ReDBox Hook Controller

import { Controllers as controllers } from '@researchdatabox/redbox-core';

declare var sails;
declare var _;

export module Controllers {
  export class ExampleController extends controllers.Core.Controller {
    protected _exportedMethods: any = [
      'example'
    ];

    public example(req: any, res: any) {
      return res.json({ message: 'Hello from ExampleController!' });
    }
  }
}

module.exports = new Controllers.ExampleController().exports();
`;
      fs.writeFileSync(sampleController, sampleCode);
      console.log('✅ Created example controller: src/api/controllers/ExampleController.ts');
    }

    const packageJsonPath = path.join(cwd, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = migrateHookDependencyContract(readPackageJson(packageJsonPath));
      pkg.scripts = {
        ...(pkg.scripts ?? {}),
        compile: pkg.scripts?.compile ?? 'node ./node_modules/@researchdatabox/redbox-dev-tools/bin/run-hook-tsc.js -p tsconfig.json',
        'test:unit': pkg.scripts?.['test:unit'] ?? 'TS_NODE_PROJECT=./test/tsconfig.json node ./node_modules/@researchdatabox/redbox-dev-tools/bin/run-hook-mocha.js --config ./test/unit/.mocharc.cjs "./test/unit/**/*.test.ts"',
      };
      writePackageJson(packageJsonPath, pkg);
      console.log('✅ Updated package.json with the minimal hook dependency contract');
    }

    console.log('\n✨ Setup complete!\n');
    console.log('Next steps:');
    console.log('  1. Install dependencies: npm install');
    console.log('  2. Compile TypeScript: npm run compile');
    console.log('  3. Start developing your hook controllers in src/api/controllers/\n');
  });

program
  .command('check')
  .description('Validate that a hook uses the shared Redbox dependency contract')
  .action(() => {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      console.error('❌ package.json not found in the current directory.');
      process.exit(1);
    }

    const pkg = readPackageJson(packageJsonPath);
    const findings = findForbiddenHookDeps(pkg);

    if (findings.length === 0) {
      console.log('✅ Hook dependency contract looks good.');
      return;
    }

    console.error('❌ Hook dependency contract violations found:');
    for (const finding of findings) {
      console.error(`  - ${finding}`);
    }
    console.error('Shared runtime dependencies should come from @researchdatabox/redbox-core, and shared toolchain dependencies should come from @researchdatabox/redbox-dev-tools.');
    process.exit(1);
  });

program
  .command('migrate-hook-dependencies')
  .description('Rewrite the current hook package.json to the minimal shared dependency contract')
  .action(() => {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      console.error('❌ package.json not found in the current directory.');
      process.exit(1);
    }

    const pkg = readPackageJson(packageJsonPath);
    const migratedPkg = migrateHookDependencyContract(pkg);
    writePackageJson(packageJsonPath, migratedPkg);
    console.log('✅ Updated package.json to use the minimal shared hook dependency contract.');
  });

const generate = program.command('generate').alias('g').description('Generate code components');

generate
  .command('controller <name>')
  .description('Generate a new ReDBox controller')
  .option('--actions <actions>', 'Comma-separated list of actions', val => val.split(','))
  .option('--webservice', 'Generate as a webservice controller', false)
  .option('--class-name <className>', 'Override controller class name (defaults to name without Controller suffix)')
  .option('--route <route>', 'Single route (deprecated, use --routes)')
  .option(
    '--routes <routes>',
    'Action-to-route mappings: action:verb:path[:role1:role2],... (e.g., list:get:/api/items:Admin:Researcher,delete:delete:/api/items/:id:Admin)',
    parseRoutes
  )
  .option(
    '--nav <nav>',
    'Navigation mappings: action:type[:containerId]:labelKey[:itemId],... (e.g., list:menu:plan:create-rdmp:plan-create)',
    parseNavMappings
  )
  .option(
    '--lang <lang>',
    'Language defaults: key=value[:lang],... (e.g., menu-custom=Custom menu:en)',
    parseLanguageDefaults
  )
  .option('--auth <roles>', 'Default roles for auth rules (can be overridden per-route)', val => val.split(','))
  .action(async (name, options) => {
    try {
      const globalOptions = program.opts();
      const paths = resolvePaths(globalOptions);

      const generator = new ControllerGenerator({
        name,
        actions: options.actions,
        webservice: options.webservice,
        route: options.route,
        routes: options.routes,
        auth: options.auth,
        navigation: options.nav,
        languageDefaults: options.lang,
        className: options.className,
        dryRun: globalOptions.dryRun,
        root: paths.root,
        paths,
      });

      console.log(`\n🛠️  Generating controller: ${name}...\n`);
      await generator.generate();
      console.log('\n✅ Done!\n');
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}\n`);
      process.exit(1);
    }
  });

generate
  .command('service <name>')
  .description('Generate a new ReDBox service')
  .option('--methods <methods>', 'Comma-separated list of methods', val => val.split(','))
  .action(async (name, options) => {
    try {
      const globalOptions = program.opts();
      const paths = resolvePaths(globalOptions);

      const generator = new ServiceGenerator({
        name,
        methods: options.methods,
        dryRun: globalOptions.dryRun,
        root: paths.root,
        paths,
      });

      console.log(`\n🛠️  Generating service: ${name}...\n`);
      await generator.generate();
      console.log('\n✅ Done!\n');
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}\n`);
      process.exit(1);
    }
  });

generate
  .command('method')
  .description('Add a method to an existing controller or service')
  .requiredOption('--file <path>', 'Path to existing controller or service file')
  .requiredOption('--method <name>', 'Method name to add')
  .option('--route <route>', 'Route path (for controllers)')
  .option('--http <verb>', 'HTTP verb (GET, POST, etc.)')
  .option('--auth <roles>', 'Comma-separated list of roles', val => val.split(','))
  .option(
    '--nav <nav>',
    'Navigation mappings: type[:containerId]:labelKey[:itemId],... (e.g., menu:plan:create-rdmp:plan-create)',
    parseNavMappings
  )
  .option(
    '--lang <lang>',
    'Language defaults: key=value[:lang],... (e.g., menu-custom=Custom menu:en)',
    parseLanguageDefaults
  )
  .action(async options => {
    try {
      const globalOptions = program.opts();
      const paths = resolvePaths(globalOptions);

      const generator = new AddMethodGenerator({
        file: options.file,
        method: options.method,
        route: options.route,
        http: options.http,
        auth: options.auth,
        navigation: options.nav,
        languageDefaults: options.lang,
        dryRun: globalOptions.dryRun,
        root: paths.root,
        paths,
      });

      console.log(`\n🛠️  Adding method ${options.method} to ${options.file}...\n`);
      await generator.generate();
      console.log('\n✅ Done!\n');
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}\n`);
      process.exit(1);
    }
  });

generate
  .command('angular-app <name>')
  .description('Scaffold a new Angular app for embedded EJS usage')
  .requiredOption('--ejs-view <view>', 'EJS view name')
  .option('--auth <roles>', 'Comma-separated list of roles', val => val.split(','))
  .action(async (name, options) => {
    try {
      const globalOptions = program.opts();
      const paths = resolvePaths(globalOptions);

      const generator = new AngularAppGenerator({
        name,
        ejsView: options.ejsView,
        auth: options.auth,
        dryRun: globalOptions.dryRun,
        root: paths.root,
        paths,
      });

      console.log(`\n🛠️  Generating Angular app: ${name}...\n`);
      await generator.generate();
      console.log('\n✅ Done!\n');
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}\n`);
      process.exit(1);
    }
  });

generate
  .command('angular-service <name>')
  .description('Generate a new Angular service extending HttpClientService')
  .requiredOption('--app <app>', 'Target Angular app name')
  .option('--methods <methods>', 'Comma-separated list of methods', val => val.split(','))
  .action(async (name, options) => {
    try {
      const globalOptions = program.opts();
      const paths = resolvePaths(globalOptions);

      const generator = new AngularServiceGenerator({
        name,
        app: options.app,
        methods: options.methods,
        dryRun: globalOptions.dryRun,
        root: paths.root,
        paths,
      });

      console.log(`\n🛠️  Generating Angular service: ${name} for app ${options.app}...\n`);
      await generator.generate();
      console.log('\n✅ Done!\n');
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}\n`);
      process.exit(1);
    }
  });

generate
  .command('form-component <name>')
  .description('Generate scaffold for a new form component across Angular and sails-ng-common')
  .option('--app <app>', 'Target Angular app name', 'form')
  .option('--with-service', 'Also generate a companion Angular HttpClient service', false)
  .action(async (name, options) => {
    try {
      const globalOptions = program.opts();
      const paths = resolvePaths(globalOptions);

      const generator = new FormComponentGenerator({
        name,
        app: options.app,
        withService: options.withService,
        dryRun: globalOptions.dryRun,
        root: paths.root,
        paths,
      });

      console.log(`\n🛠️  Generating form component scaffold: ${name}...\n`);
      await generator.generate();
      console.log('\n✅ Done!\n');
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}\n`);
      process.exit(1);
    }
  });

generate
  .command('form-field <name>')
  .description('Generate a new form field DSL configuration')
  .requiredOption('--type <type>', 'Record type')
  .action(async (name, options) => {
    try {
      const globalOptions = program.opts();
      const paths = resolvePaths(globalOptions);

      const generator = new FormFieldGenerator({
        name,
        type: options.type,
        dryRun: globalOptions.dryRun,
        root: paths.root,
      });

      console.log(`\n🛠️  Generating form field config: ${name}...\n`);
      await generator.generate();
      console.log('\n✅ Done!\n');
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}\n`);
      process.exit(1);
    }
  });

program
  .command('install-skills')
  .alias('skills')
  .description('Install bundled agent skills using the vercel-labs skills CLI')
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .action(() => {
    const skillsDir = resolveSkillsDir();
    if (!fs.existsSync(skillsDir)) {
      console.error(`Skills directory not found: ${skillsDir}`);
      process.exit(1);
    }

    const rawArgs = process.argv.slice(2);
    const cmdIndex = rawArgs.findIndex(arg => arg === 'install-skills' || arg === 'skills');
    const forwardedArgs = cmdIndex === -1 ? [] : rawArgs.slice(cmdIndex + 1);
    const result = spawnSync('npx', ['skills', 'add', skillsDir, ...forwardedArgs], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    if (result.error) {
      console.error('Failed to run npx skills:', result.error.message);
      process.exit(1);
    }

    process.exit(result.status === null ? 1 : result.status);
  });

generate
  .command('model <name>')
  .description('Generate a new Waterline model with decorator-based definition')
  .option('--identity <identity>', 'Waterline identity (table name), defaults to lowercase name')
  .option(
    '--attrs <attrs>',
    'Comma-separated list of attributes in format name:type[:required][:unique]',
    parseAttributes
  )
  .option('--belongs-to <associations>', 'Comma-separated belongsTo associations in format name:model', parseBelongsTo)
  .option(
    '--has-many <associations>',
    'Comma-separated hasMany associations in format name:model:via[:dominant]',
    parseHasMany
  )
  .action(async (name, options) => {
    try {
      const globalOptions = program.opts();
      const paths = resolvePaths(globalOptions);

      const generator = new ModelGenerator({
        name,
        identity: options.identity,
        attributes: options.attrs,
        associations: [...(options.belongsTo || []), ...(options.hasMany || [])],
        dryRun: globalOptions.dryRun,
        root: paths.root,
        paths,
      });

      console.log(`\n🛠️  Generating Waterline model: ${name}...\n`);
      await generator.generate();
      console.log('\n✅ Done!\n');
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}\n`);
      process.exit(1);
    }
  });

program.parse();
