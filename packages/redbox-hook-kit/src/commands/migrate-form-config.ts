import { Command } from 'commander';
import * as path from 'path';
import {ILogger} from '@researchdatabox/sails-ng-common';
import {
  migrateDataClassification,
  migrateFormConfigFile,
  migrateFormConfigVerify
} from "@researchdatabox/redbox-core-types/dist/visitor/migrate-config-helpers";


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
  blank: () => undefined
};

function resolveMigrationVisitorConstructor() {
  const candidates = [
    () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pkg = require('@researchdatabox/redbox-core-types');
      return pkg.MigrationV4ToV5FormConfigVisitor;
    },
    () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pkg = require(path.resolve(__dirname, '..', '..', '..', 'redbox-core-types', 'dist', 'visitor', 'migrate-config-v4-v5.visitor.js'));
      return pkg.MigrationV4ToV5FormConfigVisitor;
    },
    () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pkg = require('@researchdatabox/sails-ng-common');
      return pkg.MigrationV4ToV5FormConfigVisitor;
    },
    () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pkg = require(path.resolve(__dirname, '..', '..', '..', 'sails-ng-common', 'dist', 'src', 'config', 'visitor', 'migrate-config-v4-v5.visitor.js'));
      return pkg.MigrationV4ToV5FormConfigVisitor;
    }
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
    'Could not load MigrationV4ToV5FormConfigVisitor. Compile packages/redbox-core-types or install a version that includes the migration visitor.'
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



export function registerMigrateDataClassificationCommand(program: Command) {
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
