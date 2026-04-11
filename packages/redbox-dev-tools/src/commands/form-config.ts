import { Command } from 'commander';
import fs from "fs";
import * as path from 'path';
import { ILogger } from '@researchdatabox/sails-ng-common';
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

type LegacyConfigModule = Record<string, unknown>;

function loadLegacyModule(modulePath: string): LegacyConfigModule {
  const resolvedPath = path.resolve(modulePath);
  const loaded = require(resolvedPath) as LegacyConfigModule;
  if (loaded == null || typeof loaded !== 'object') {
    throw new Error(`Legacy config module '${resolvedPath}' did not export an object`);
  }
  return loaded;
}

function pickLegacyExport<T extends Record<string, unknown>>(moduleExports: LegacyConfigModule, exportName: string): T {
  const named = moduleExports[exportName];
  if (named != null && typeof named === 'object') {
    return named as T;
  }
  return moduleExports as T;
}

function toNumericStatusCodes(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [408, 429, 500, 502, 503, 504];
  }
  return value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));
}

function createMigratedFigsharePublishingConfig(
  brand: string,
  figshareApi: Record<string, unknown>,
  figshareApiEnv: Record<string, unknown> = {},
  figshareForMapping: Record<string, unknown> = {}
) {
  const overrideArtifacts = (figshareApiEnv.overrideArtifacts as Record<string, unknown> | undefined) ?? {};
  const mapping = {
    ...((figshareApi.mapping as Record<string, unknown> | undefined) ?? {}),
    ...((overrideArtifacts.mapping as Record<string, unknown> | undefined) ?? {})
  };

  return {
    enabled: Boolean(figshareApi.APIToken && figshareApi.baseURL && figshareApi.frontEndURL),
    connection: {
      baseUrl: overrideArtifacts.baseURL ?? figshareApi.baseURL ?? '',
      frontEndUrl: overrideArtifacts.frontEndURL ?? figshareApi.frontEndURL ?? '',
      token: overrideArtifacts.APIToken ?? figshareApi.APIToken ?? '',
      timeoutMs: 30000,
      operationTimeouts: {
        metadataMs: 30000,
        uploadInitMs: 30000,
        uploadPartMs: 120000,
        publishMs: 60000
      },
      retry: {
        maxAttempts: Number((figshareApi.retry as Record<string, unknown> | undefined)?.maxAttempts ?? 3),
        baseDelayMs: Number((figshareApi.retry as Record<string, unknown> | undefined)?.baseDelayMs ?? 500),
        maxDelayMs: Number((figshareApi.retry as Record<string, unknown> | undefined)?.maxDelayMs ?? 4000),
        retryOnStatusCodes: toNumericStatusCodes((figshareApi.retry as Record<string, unknown> | undefined)?.retryOnStatusCodes)
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
      syncStatePath: 'metadata.figshareSyncState',
      allFilesUploadedPath: typeof mapping.recordAllFilesUploaded === 'string' ? mapping.recordAllFilesUploaded : ''
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
      contributorPaths: ['metadata.contributor_ci', 'metadata.contributors'],
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
      mappingTable: (((figshareForMapping.FORMapping as Record<string, unknown>[] | undefined) ?? []).map((entry) => ({
        sourceCode: String(entry.redboxCode ?? entry.sourceCode ?? ''),
        figshareCategoryId: Number(entry.figshareCategoryId ?? entry.figCode ?? 0)
      }))).filter((entry) => entry.sourceCode !== ''),
      allowUnmapped: false
    },
    assets: {
      enableHostedFiles: true,
      enableLinkFiles: true,
      dedupeStrategy: 'sourceId',
      staging: {
        tempDir: String(figshareApi.attachmentsFigshareTempDir ?? ''),
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
    queue: {
      publishAfterUploadDelay: typeof mapping.schedulePublishAfterUploadJob === 'string' ? mapping.schedulePublishAfterUploadJob : 'in 2 minutes',
      uploadedFilesCleanupDelay: typeof mapping.scheduleUploadedFilesCleanupJob === 'string' ? mapping.scheduleUploadedFilesCleanupJob : 'in 5 minutes'
    },
    workflow: {
      transitionRules: [],
      transitionJob: {
        enabled: String((mapping.figshareScheduledTransitionRecordWorkflowFromArticlePropertiesJob as Record<string, unknown> | undefined)?.enabled ?? 'false') === 'true',
        namedQuery: String((mapping.figshareScheduledTransitionRecordWorkflowFromArticlePropertiesJob as Record<string, unknown> | undefined)?.namedQuery ?? ''),
        targetStep: String((mapping.figshareScheduledTransitionRecordWorkflowFromArticlePropertiesJob as Record<string, unknown> | undefined)?.targetStep ?? ''),
        paramMap: ((mapping.figshareScheduledTransitionRecordWorkflowFromArticlePropertiesJob as Record<string, unknown> | undefined)?.paramMap as Record<string, unknown> | undefined) ?? {},
        figshareTargetFieldKey: String((mapping.figshareScheduledTransitionRecordWorkflowFromArticlePropertiesJob as Record<string, unknown> | undefined)?.figshareTargetFieldKey ?? ''),
        figshareTargetFieldValue: String((mapping.figshareScheduledTransitionRecordWorkflowFromArticlePropertiesJob as Record<string, unknown> | undefined)?.figshareTargetFieldValue ?? ''),
        username: String((mapping.figshareScheduledTransitionRecordWorkflowFromArticlePropertiesJob as Record<string, unknown> | undefined)?.username ?? ''),
        userType: String((mapping.figshareScheduledTransitionRecordWorkflowFromArticlePropertiesJob as Record<string, unknown> | undefined)?.userType ?? '')
      }
    },
    testing: {
      mode: figshareApi.testMode ? 'fixture' : 'live'
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
    .requiredOption('--figshare-api <path>', 'Path to the legacy figshareAPI config module')
    .option('--figshare-api-env <path>', 'Path to the legacy figshareAPIEnv config module')
    .option('--figshare-for-mapping <path>', 'Path to the legacy figshareReDBoxFORMapping config module')
    .requiredOption('-o, --output <path>', 'Directory to write migrated figsharePublishing JSON files')
    .option('-b, --brands <brands...>', 'Brands to generate config for', ['default'])
    .action(async (options) => {
      try {
        const globalOptions = program.opts();
        const outputDir = path.resolve(options.output);
        const brands: string[] = options.brands;
        const figshareApi = pickLegacyExport<Record<string, unknown>>(loadLegacyModule(options.figshareApi), 'figshareAPI');
        const figshareApiEnv = options.figshareApiEnv
          ? pickLegacyExport<Record<string, unknown>>(loadLegacyModule(options.figshareApiEnv), 'figshareAPIEnv')
          : {};
        const figshareForMapping = options.figshareForMapping
          ? pickLegacyExport<Record<string, unknown>>(loadLegacyModule(options.figshareForMapping), 'figshareReDBoxFORMapping')
          : {};

        if (!globalOptions.dryRun) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        const report = brands.map((brand) => {
          const migrated = createMigratedFigsharePublishingConfig(brand, figshareApi, figshareApiEnv, figshareForMapping);
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
