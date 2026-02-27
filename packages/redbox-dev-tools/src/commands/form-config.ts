import { Command } from 'commander';
import fs from "fs";
import * as path from 'path';
import {FormModesConfig, ILogger, ReusableFormDefinitions} from '@researchdatabox/sails-ng-common';
import {
  migrateFormConfigFile, migrateDataClassification,
  migrateFormConfigVerify, createClientFormConfig
} from '@researchdatabox/redbox-core';

const migrationLogger: ILogger = {
  silly: (...args: any[]) => console.debug(...args),
  verbose: (...args: any[]) => console.debug(...args),
  trace: (...args: any[]) => console.debug(...args),
  debug: (...args: any[]) => console.debug(...args),
  log: (...args: any[]) => console.log(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  error: (...args: any[]) => console.error(...args),
  crit: (...args: any[]) => console.error(...args),
  fatal: (...args: any[]) => console.error(...args),
  silent: () => undefined,
  blank: () => undefined,
};

type MigrationVisitorConstructor = new (logger: any) => {
  start: (params: { data: any }) => any;
};

function resolveMigrationVisitorConstructor(): MigrationVisitorConstructor {
  const candidates = [
    () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pkg = require('@researchdatabox/redbox-core');
      return pkg.MigrationV4ToV5FormConfigVisitor as MigrationVisitorConstructor | undefined;
    },
    () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pkg = require(
        path.resolve(__dirname, '..', '..', '..', 'redbox-core', 'dist', 'visitor', 'migrate-config-v4-v5.visitor.js')
      );
      return pkg.MigrationV4ToV5FormConfigVisitor as MigrationVisitorConstructor | undefined;
    },
    () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pkg = require('@researchdatabox/sails-ng-common');
      return pkg.MigrationV4ToV5FormConfigVisitor as MigrationVisitorConstructor | undefined;
    },
    () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pkg = require(
        path.resolve(
          __dirname,
          '..',
          '..',
          '..',
          'sails-ng-common',
          'dist',
          'src',
          'config',
          'visitor',
          'migrate-config-v4-v5.visitor.js'
        )
      );
      return pkg.MigrationV4ToV5FormConfigVisitor as MigrationVisitorConstructor | undefined;
    },
  ];

  for (const load of candidates) {
    try {
      const ctor = load();
      if (ctor) {
        return ctor;
      }
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    'Could not load MigrationV4ToV5FormConfigVisitor. Compile packages/redbox-core or install a version that includes the migration visitor.'
  );
}

export function registerMigrateFormConfigCommand(program: Command): void {
  program
    .command('migrate-form-config')
    .description('Migrate a legacy v4 JS form config file to the v5 TS form framework format')
    .requiredOption('-i, --input <path>', 'Path to the legacy v4 form config JS file')
    .requiredOption('-o, --output <path>', 'Path to write the migrated v5 TypeScript config file')
    .action(async (options) => {
      try {
        const globalOptions = program.opts();
        const inputPath = path.resolve(options.input);
        const outputPath = path.resolve(options.output);

        const MigrationVisitor = resolveMigrationVisitorConstructor();
        const migrateVisitor = new MigrationVisitor(migrationLogger);

        const migrated = await migrateFormConfigFile(migrateVisitor, inputPath, outputPath, globalOptions.dryRun);
        await migrateFormConfigVerify(migrated, migrationLogger);

        console.log('\n✅ Done!\n');
      } catch (error: any) {
        console.error(`\n❌ Error: ${error.message}\n`);
        process.exit(1);
      }
    });
}

export function registerMigrateDataClassificationCommand(program: Command): void {
  program
    .command('migrate-data-classification')
    .description('Migrate a legacy v4 JS data classification definition file to the v5 TS form framework format')
    .requiredOption('-i, --input <path>', 'Path to the legacy v4 JS file')
    .requiredOption('-o, --output <path>', 'Path to write the migrated v5 TypeScript config file')
    .action(async (options) => {
      try {
        const globalOptions = program.opts();
        const inputPath = path.resolve(options.input);
        const outputPath = path.resolve(options.output);

        const MigrationVisitor = resolveMigrationVisitorConstructor();
        const migrateVisitor = new MigrationVisitor(migrationLogger);

        const migrated = migrateDataClassification(migrateVisitor, inputPath, outputPath, globalOptions.dryRun);
        await migrateFormConfigVerify(migrated.formConfig, migrationLogger);

        console.log('\n✅ Done!\n');
      } catch (error: any) {
        console.error(`\n❌ Error: ${error.message}\n`);
        process.exit(1);
      }
    });
}

export function registerClientFormConfigCommand(program: Command) {
  program
    .command('client-form-config')
    .description('Process a form config to produce the client form config')
    .requiredOption('-i, --input <path>', 'Path to read the server-side form config TypeScript file')
    .requiredOption('-o, --output <path>', 'Path to write the client-side form config TypeSCript file')
    .option('---formMode <formMode>', 'The form mode, either edit or view')
    .option('--userRoles <userRoles...>', "The user roles, zero or more of 'Admin', 'Librarians', 'Researcher', 'Guest'")
    .option('-r, --record <path>', "Path to read the data record")
    .action(async (options) => {
      try {
        const globalOptions = program.opts();
        const inputPath = path.resolve(options.input);
        const outputPath = path.resolve(options.output);

        const formMode = options.formMode ?? null;
        const userRoles = options.userRoles ?? null;
        const record = options.record ? require(path.resolve(options.record)) : null;

        const serverFormConfig = require(inputPath);
        const clientFormConfig = await createClientFormConfig(
          serverFormConfig, migrationLogger, formMode, userRoles, undefined, record
        );

        const tsContent = `import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
const clientFormConfig: FormConfigFrame = ${JSON.stringify(clientFormConfig, null, 2)};
export default clientFormConfig;`;

        if (globalOptions.dryRun) {
          console.log('[dry-run] Client form config created; no file written.');
        } else {
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          fs.writeFileSync(outputPath, tsContent, 'utf8');
          console.log(`✅ Wrote client form config: ${outputPath}`);
        }

        await migrateFormConfigVerify(clientFormConfig, migrationLogger);

        console.log('\n✅ Done!\n');
      } catch (error: any) {
        console.error(`\n❌ Error: ${error.message}\n`);
        process.exit(1);
      }
    });
}


export function registerQuestionTreeDiagramCommand(program: Command) {

}


