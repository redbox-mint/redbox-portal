import { Command } from 'commander';
import fs from "fs";
import * as path from 'path';
import { ILogger } from '@researchdatabox/sails-ng-common';
import {
  migrateFormConfigFile, migrateDataClassification,
  migrateFormConfigVerify, createClientFormConfig,
  MigrationV4ToV5FormConfigVisitor, createQuestionTreeDiagram
} from '@researchdatabox/redbox-core';
import { figshareAPI, figshareAPIEnv, figshareReDBoxFORMapping } from '@researchdatabox/redbox-core';

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
    .option('--format <name>', "The output format, either 'esm' or 'cjs'")
    .action(async (options) => {
      try {
        const globalOptions = program.opts();
        const inputPath = path.resolve(options.input);
        const outputPath = path.resolve(options.output);
        const outputFormat = options.format || "esm";

        console.log(`\n🛠️  Migrating form config to ${outputFormat} format: ${inputPath} -> ${outputPath}\n`);

        const migrateVisitor = new MigrationV4ToV5FormConfigVisitor(migrationLogger);

        const migrated = await migrateFormConfigFile(migrateVisitor, inputPath, outputFormat);

        if (globalOptions.dryRun) {
          console.log('[dry-run] Migration completed; no file written.');
        } else {
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
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
    .option('--format <name>', "The output format, either 'esm' or 'cjs'")
    .action(async (options) => {
      try {
        const globalOptions = program.opts();
        const inputPath = path.resolve(options.input);
        const outputPath = path.resolve(options.output);
        const outputFormat = options.format || 'esm';

        console.log(`\n🛠️  Migrating data classification to question tree to ${outputFormat} format: ${inputPath} -> ${outputPath}\n`);

        const migrateVisitor = new MigrationV4ToV5FormConfigVisitor(migrationLogger);
        const migrated = migrateDataClassification(migrateVisitor, inputPath, outputFormat);

        if (globalOptions.dryRun) {
          console.log('[dry-run] Migration completed; no file written.');
        } else {
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
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

        const serverFormConfig = require(inputPath).default;
        const clientFormConfig = await createClientFormConfig(
          serverFormConfig, migrationLogger, formMode, userRoles, undefined, record
        );

        const tsContent = `import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
const clientFormConfig: FormConfigFrame = ${JSON.stringify(clientFormConfig, null, 2)};
export default clientFormConfig;`;

        if (globalOptions.dryRun) {
          console.log('[dry-run] Client form config built from server form config; no file written.');
        } else {
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
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
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          fs.writeFileSync(outputPath, diagram, 'utf8');
          console.log(`✅ Wrote diagram text file: ${outputPath}`);
        }

      } catch (error: any) {
        console.error(`\n❌ Error: `, error);
        process.exit(1);
      }
    });
}

function collectLegacyTemplates(value: unknown, pathPrefix = ''): string[] {
  if (typeof value === 'string') {
    return value.includes('<%') ? [pathPrefix] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectLegacyTemplates(entry, `${pathPrefix}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
      collectLegacyTemplates(entry, pathPrefix ? `${pathPrefix}.${key}` : key)
    );
  }
  return [];
}

function createMigratedFigsharePublishingConfig(brand: string) {
  const overrideArtifacts = (figshareAPIEnv as any)?.overrideArtifacts ?? {};
  const mapping = {
    ...((figshareAPI as any)?.mapping ?? {}),
    ...((overrideArtifacts?.mapping ?? {}) as Record<string, unknown>)
  };

  return {
    enabled: Boolean((figshareAPI as any)?.APIToken && (figshareAPI as any)?.baseURL && (figshareAPI as any)?.frontEndURL),
    connection: {
      baseUrl: overrideArtifacts.baseURL ?? (figshareAPI as any)?.baseURL ?? '',
      frontEndUrl: overrideArtifacts.frontEndURL ?? (figshareAPI as any)?.frontEndURL ?? '',
      token: overrideArtifacts.APIToken ?? (figshareAPI as any)?.APIToken ?? '',
      timeoutMs: 30000,
      operationTimeouts: {
        metadataMs: 30000,
        uploadInitMs: 30000,
        uploadPartMs: 120000,
        publishMs: 60000
      },
      retry: {
        maxAttempts: Number((figshareAPI as any)?.retry?.maxAttempts ?? 3),
        baseDelayMs: Number((figshareAPI as any)?.retry?.baseDelayMs ?? 500),
        maxDelayMs: Number((figshareAPI as any)?.retry?.maxDelayMs ?? 4000),
        retryOnStatusCodes: (figshareAPI as any)?.retry?.retryOnStatusCodes ?? [408, 429, 500, 502, 503, 504]
      }
    },
    article: {
      itemType: mapping.figshareItemType ?? 'dataset',
      groupId: mapping.figshareItemGroupId,
      publishMode: mapping.figshareNeedsPublishAfterFileUpload ? 'afterUploadsComplete' : 'immediate',
      republishOnMetadataChange: true,
      republishOnAssetChange: true
    },
    record: {
      articleIdPath: mapping.recordFigArticleId ?? 'metadata.figshare_article_id',
      articleUrlPaths: Array.isArray(mapping.recordFigArticleURL) ? mapping.recordFigArticleURL : [mapping.recordFigArticleURL ?? 'metadata.figshare_article_location'],
      dataLocationsPath: mapping.recordDataLocations ?? 'metadata.dataLocations',
      statusPath: 'metadata.figshareStatus',
      errorPath: 'metadata.figshareError',
      syncStatePath: 'metadata.figshareSyncState'
    },
    selection: {
      attachmentMode: mapping.figshareOnlyPublishSelectedAttachmentFiles ? 'selectedOnly' : 'all',
      urlMode: mapping.figshareOnlyPublishSelectedLocationURLs ? 'selectedOnly' : 'all',
      selectedFlagPath: 'selected'
    },
    authors: {
      source: 'defaultRedboxContributors',
      uniqueBy: mapping.recordAuthorUniqueBy ?? 'email',
      externalNameField: mapping.recordAuthorExternalName ?? 'text_full_name',
      maxInlineAuthors: 50,
      lookup: []
    },
    metadata: {
      title: { kind: 'path', path: 'metadata.title' },
      description: { kind: 'path', path: 'metadata.description' },
      keywords: { kind: 'path', path: 'metadata.finalKeywords', defaultValue: [] },
      funding: { kind: 'path', path: 'metadata.funder' },
      license: { source: { kind: 'path', path: mapping.recordLicensePath ?? 'metadata.license' }, matchBy: 'urlContains', required: true },
      categories: { source: { kind: 'path', path: mapping.recordCategoryPath ?? 'metadata.forCodes', defaultValue: [] }, mappingStrategy: 'for2020Mapping' },
      customFields: []
    },
    categories: {
      strategy: 'for2020Mapping',
      mappingTable: ((figshareReDBoxFORMapping as any)?.FORMapping ?? []).map((entry: any) => ({
        sourceCode: entry.redboxCode ?? entry.sourceCode ?? '',
        figshareCategoryId: Number(entry.figshareCategoryId ?? entry.figCode ?? 0)
      })).filter((entry: any) => entry.sourceCode),
      allowUnmapped: false
    },
    assets: {
      enableHostedFiles: true,
      enableLinkFiles: true,
      dedupeStrategy: 'sourceId',
      staging: {
        tempDir: (figshareAPI as any)?.attachmentsFigshareTempDir ?? '',
        cleanupPolicy: 'deleteAfterSuccess',
        diskSpaceThresholdBytes: 1073741824
      }
    },
    embargo: {
      mode: 'recordDriven',
      forceSync: Boolean(mapping.figshareForceEmbargoUpdateAlways),
      accessRights: {
        accessRights: { kind: 'path', path: 'metadata.accessRights' },
        fullEmbargoUntil: { kind: 'path', path: 'metadata.embargoUntil' },
        fileEmbargoUntil: { kind: 'path', path: 'metadata.embargoUntil' },
        reason: { kind: 'path', path: 'metadata.embargoReason' }
      }
    },
    workflow: {
      transitionRules: []
    },
    testing: {
      mode: (figshareAPI as any)?.testMode ? 'fixture' : 'live'
    },
    writeBack: {
      articleId: 'metadata.figshare_article_id',
      articleUrls: ['metadata.figshare_article_location'],
      extraFields: []
    },
    migrationReport: {
      brand,
      unsupportedLegacyTemplates: collectLegacyTemplates(mapping)
    }
  };
}

export function registerMigrateFigshareConfigCommand(program: Command): void {
  program
    .command('migrate-figshare-config')
    .description('Migrate legacy Figshare config into figsharePublishing AppConfig JSON files')
    .requiredOption('-o, --output <path>', 'Directory to write migrated figsharePublishing JSON files')
    .option('-b, --brands <brands...>', 'Brands to generate config for', ['default'])
    .action(async (options) => {
      try {
        const globalOptions = program.opts();
        const outputDir = path.resolve(options.output);
        const brands: string[] = options.brands;

        if (!globalOptions.dryRun) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        const report = brands.map((brand) => {
          const migrated = createMigratedFigsharePublishingConfig(brand);
          const outputPath = path.join(outputDir, `${brand}.figsharePublishing.json`);
          if (!globalOptions.dryRun) {
            fs.writeFileSync(outputPath, JSON.stringify(migrated, null, 2) + '\n', 'utf8');
          }
          return {
            brand,
            outputPath,
            unsupportedLegacyTemplates: migrated.migrationReport.unsupportedLegacyTemplates
          };
        });

        if (globalOptions.dryRun) {
          console.log('[dry-run] Migration report generated; no files written.');
        }
        console.log(JSON.stringify(report, null, 2));
      } catch (error: any) {
        console.error(`\n❌ Error: `, error);
        process.exit(1);
      }
    });
}

