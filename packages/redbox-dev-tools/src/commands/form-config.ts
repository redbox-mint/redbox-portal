import {Command} from 'commander';
import fs from "fs";
import * as path from 'path';
import {ILogger} from '@researchdatabox/sails-ng-common';
import {
  migrateFormConfigFile, migrateDataClassification,
  migrateFormConfigVerify, createClientFormConfig,
  MigrationV4ToV5FormConfigVisitor, createQuestionTreeDiagram
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

        console.log(`\n🛠️  Migrating form config: ${inputPath} -> ${outputPath}\n`);

        const migrateVisitor = new MigrationV4ToV5FormConfigVisitor(migrationLogger);

        const migrated = await migrateFormConfigFile(migrateVisitor, inputPath);

        if (globalOptions.dryRun) {
          console.log('[dry-run] Migration completed; no file written.');
        } else {
          fs.mkdirSync(path.dirname(outputPath), {recursive: true});
          fs.writeFileSync(outputPath, migrated.tsContent, 'utf8');
          console.log(`✅ Wrote migrated form config: ${outputPath}`);
        }

        await migrateFormConfigVerify(migrated.migrated, migrationLogger);

        console.log('\n✅ Done!\n');
      } catch (error: any) {
        console.error(`\n❌ Error: `, error);
        process.exit(1);
      }
    });
}

export function registerMigrateDataClassificationCommand(program: Command): void {
  program
    .command('migrate-data-classification')
    .description('Migrate a legacy v4 JS data classification definition file to the v5 TS form framework format')
    .requiredOption('-i, --input <path>', 'Path to the legacy v4 JS data classification definition file')
    .requiredOption('-o, --output <path>', 'Path to write the migrated v5 TypeScript question tree config file')
    .action(async (options) => {
      try {
        const globalOptions = program.opts();
        const inputPath = path.resolve(options.input);
        const outputPath = path.resolve(options.output);

        console.log(`\n🛠️  Migrating data classification to question tree: ${inputPath} -> ${outputPath}\n`);

        const migrateVisitor = new MigrationV4ToV5FormConfigVisitor(migrationLogger);
        const migrated = migrateDataClassification(migrateVisitor, inputPath);

        if (globalOptions.dryRun) {
          console.log('[dry-run] Migration completed; no file written.');
        } else {
          fs.mkdirSync(path.dirname(outputPath), {recursive: true});
          fs.writeFileSync(outputPath, migrated.tsContent, 'utf8');
          console.log(`✅ Wrote migrated question tree config: ${outputPath}`);
        }

        await migrateFormConfigVerify(migrated.formConfig, migrationLogger);

        console.log('\n✅ Done!\n');
      } catch (error: any) {
        console.error(`\n❌ Error: `, error);
        process.exit(1);
      }
    });
}

export function registerClientFormConfigCommand(program: Command) {
  program
    .command('client-form-config')
    .description('Process a form config to produce the client form config')
    .requiredOption('-i, --input <path>', 'Path to read the server-side form config TypeScript file')
    .requiredOption('-o, --output <path>', 'Path to write the client-side form config TypeScript file')
    .option('--formMode <name>', "The form mode, either 'edit' or 'view'")
    .option('--userRoles <name...>', "The user roles, zero or more of 'Admin', 'Librarians', 'Researcher', 'Guest'")
    .option('-r, --record <path>', "Path to read the data record file")
    .action(async (options) => {
      try {
        const globalOptions = program.opts();
        const inputPath = path.resolve(options.input);
        const outputPath = path.resolve(options.output);

        const formMode = options.formMode ?? null;
        const userRoles = options.userRoles ?? null;
        const record = options.record ? require(path.resolve(options.record)) : null;

        console.log(`\n🛠️  Building client form config from server form config: ${inputPath} -> ${outputPath}\n`);

        const serverFormConfig = require(inputPath);
        const clientFormConfig = await createClientFormConfig(
          serverFormConfig, migrationLogger, formMode, userRoles, undefined, record
        );

        const tsContent = `import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
const clientFormConfig: FormConfigFrame = ${JSON.stringify(clientFormConfig, null, 2)};
export default clientFormConfig;`;

        if (globalOptions.dryRun) {
          console.log('[dry-run] Client form config built from server form config; no file written.');
        } else {
          fs.mkdirSync(path.dirname(outputPath), {recursive: true});
          fs.writeFileSync(outputPath, tsContent, 'utf8');
          console.log(`✅ Wrote client form config: ${outputPath}`);
        }

        await migrateFormConfigVerify(clientFormConfig, migrationLogger);

        console.log('\n✅ Done!\n');
      } catch (error: any) {
        console.error(`\n❌ Error: `, error);
        process.exit(1);
      }
    });
}


export function registerQuestionTreeDiagramCommand(program: Command) {
  program
    .command('question-tree-diagram')
    .description('Convert a question tree config to a mermaid diagram text file')
    .requiredOption('-i, --input <path>', 'Path to read the question tree form config TypeScript file')
    .requiredOption('-o, --output <path>', 'Path to write the diagram text file')
    .action(async (options) => {
      try {
        const globalOptions = program.opts();
        const inputPath = path.resolve(options.input);
        const outputPath = path.resolve(options.output);

        console.log(`\n🛠️  Creating diagram from form config: ${inputPath} -> ${outputPath}\n`);

        const componentConfig = require(inputPath);
        const diagram = await createQuestionTreeDiagram(componentConfig, migrationLogger);

        if (globalOptions.dryRun) {
          console.log('[dry-run] Built diagram from form config; no file written.');
        } else {
          fs.mkdirSync(path.dirname(outputPath), {recursive: true});
          fs.writeFileSync(outputPath, diagram, 'utf8');
          console.log(`✅ Wrote diagram text file: ${outputPath}`);
        }

      } catch (error: any) {
        console.error(`\n❌ Error: `, error);
        process.exit(1);
      }
    });
}


