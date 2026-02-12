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
import { registerMigrateFormConfigCommand } from './commands/migrate-form-config';
import { generateCompletionScript } from './completion';
import {
  parseAttributes,
  parseBelongsTo,
  parseHasMany,
  parseLanguageDefaults,
  parseNavMappings,
  parseRoutes
} from './cli-parsers';

const program = new Command();

program
  .name('redbox-hook-kit')
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

program
  .command('init')
  .description('Initialize a new ReDBox hook project with TypeScript setup')
  .action(() => {
    console.log('🚀 Initializing ReDBox Hook project...\n');

    const cwd = process.cwd();
    
    // Create typescript directory structure if it doesn't exist
    const typescriptDir = path.join(cwd, 'typescript');
    const apiDir = path.join(typescriptDir, 'api');
    const controllersDir = path.join(apiDir, 'controllers');
    
    if (!fs.existsSync(typescriptDir)) {
      fs.mkdirSync(typescriptDir, { recursive: true });
    } else {
      console.log('ℹ️  typescript/ directory already exists');
    }

    if (!fs.existsSync(controllersDir)) {
      fs.mkdirSync(controllersDir, { recursive: true });
      console.log('✅ Created typescript/api/controllers/ directory structure');
    }

    // Create or update tsconfig.json
    const tsconfigPath = path.join(cwd, 'tsconfig.json');
    const tsconfig = {
      "extends": "@researchdatabox/redbox-hook-kit/config/tsconfig.base.json",
      "compilerOptions": {
        "outDir": "./",
        "rootDir": "./typescript",
        "typeRoots": [
          "node_modules/@types",
          "node_modules/@researchdatabox/redbox-hook-kit/node_modules/@types"
        ]
      },
      "include": [
        "typescript/**/*.ts"
      ]
    };

    if (!fs.existsSync(tsconfigPath)) {
      fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n');
      console.log('✅ Created tsconfig.json extending redbox-hook-kit');
    } else {
      console.log('⚠️  tsconfig.json already exists - skipping');
      console.log('   You may want to manually extend: @researchdatabox/redbox-hook-kit/config/tsconfig.base.json');
    }

    // Create a sample controller if none exists
    const sampleController = path.join(controllersDir, 'ExampleController.ts');
    if (!fs.existsSync(sampleController) && fs.readdirSync(controllersDir).length === 0) {
      const sampleCode = `// Example ReDBox Hook Controller

import { Controllers as controllers } from '@researchdatabox/redbox-core-types';

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
      console.log('✅ Created example controller: typescript/api/controllers/ExampleController.ts');
    }

    console.log('\n✨ Setup complete!\n');
    console.log('Next steps:');
    console.log('  1. Install dependencies: npm install');
    console.log('  2. Compile TypeScript: npx tsc');
    console.log('  3. Start developing your hook controllers in typescript/api/controllers/\n');
  });

const generate = program
  .command('generate')
  .alias('g')
  .description('Generate code components');

generate
  .command('controller <name>')
  .description('Generate a new ReDBox controller')
  .option('--actions <actions>', 'Comma-separated list of actions', (val) => val.split(','))
  .option('--webservice', 'Generate as a webservice controller', false)
  .option('--class-name <className>', 'Override controller class name (defaults to name without Controller suffix)')
  .option('--route <route>', 'Single route (deprecated, use --routes)')
  .option('--routes <routes>', 'Action-to-route mappings: action:verb:path[:role1:role2],... (e.g., list:get:/api/items:Admin:Researcher,delete:delete:/api/items/:id:Admin)', parseRoutes)
  .option('--nav <nav>', 'Navigation mappings: action:type[:containerId]:labelKey[:itemId],... (e.g., list:menu:plan:create-rdmp:plan-create)', parseNavMappings)
  .option('--lang <lang>', 'Language defaults: key=value[:lang],... (e.g., menu-custom=Custom menu:en)', parseLanguageDefaults)
  .option('--auth <roles>', 'Default roles for auth rules (can be overridden per-route)', (val) => val.split(','))
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
        paths
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
  .option('--methods <methods>', 'Comma-separated list of methods', (val) => val.split(','))
  .action(async (name, options) => {
    try {
      const globalOptions = program.opts();
      const paths = resolvePaths(globalOptions);
      
      const generator = new ServiceGenerator({
        name,
        methods: options.methods,
        dryRun: globalOptions.dryRun,
        root: paths.root,
        paths
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
  .option('--auth <roles>', 'Comma-separated list of roles', (val) => val.split(','))
  .option('--nav <nav>', 'Navigation mappings: type[:containerId]:labelKey[:itemId],... (e.g., menu:plan:create-rdmp:plan-create)', parseNavMappings)
  .option('--lang <lang>', 'Language defaults: key=value[:lang],... (e.g., menu-custom=Custom menu:en)', parseLanguageDefaults)
  .action(async (options) => {
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
        paths
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
  .option('--auth <roles>', 'Comma-separated list of roles', (val) => val.split(','))
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
        paths
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
  .option('--methods <methods>', 'Comma-separated list of methods', (val) => val.split(','))
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
        paths
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
        paths
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
        root: paths.root
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
    const cmdIndex = rawArgs.findIndex((arg) => arg === 'install-skills' || arg === 'skills');
    const forwardedArgs = cmdIndex === -1 ? [] : rawArgs.slice(cmdIndex + 1);
    const result = spawnSync(
      'npx',
      ['skills', 'add', skillsDir, ...forwardedArgs],
      { stdio: 'inherit', shell: process.platform === 'win32' }
    );

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
  .option('--attrs <attrs>', 'Comma-separated list of attributes in format name:type[:required][:unique]', parseAttributes)
  .option('--belongs-to <associations>', 'Comma-separated belongsTo associations in format name:model', parseBelongsTo)
  .option('--has-many <associations>', 'Comma-separated hasMany associations in format name:model:via[:dominant]', parseHasMany)
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
        paths
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
