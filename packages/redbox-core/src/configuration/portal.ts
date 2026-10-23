import { z } from 'zod';
import Ajv from 'ajv';
import { DateTime } from 'luxon';
import domainSchema from './portal-domains.schema.json';
import type { PortalDomainConfiguration } from './PortalDomainConfiguration';
import { appmode } from '../config/appmode.config';
import { record } from '../config/record.config';
import { recordValidation } from '../config/recordValidation.config';
import { recordSchema } from '../config/recordSchema.config';
import { recordtype } from '../config/recordtype.config';
import { workflow } from '../config/workflow.config';
import { dashboardtype } from '../config/dashboardtype.config';
import { dashboardview } from '../config/dashboardview.config';
import { workspacetype } from '../config/workspacetype.config';
import { i18n } from '../config/i18n.config';
import { vocab } from '../config/vocab.config';
import { solr } from '../config/solr.config';
import { search } from '../config/search.config';
import { namedQuery } from '../config/namedQuery.config';
import { action } from '../config/action.config';
import { jsonld } from '../config/jsonld.config';
import { emailnotification } from '../config/emailnotification.config';
import { appConfigSecrets } from '../config/appConfigSecrets.config';
import { branding } from '../config/branding.config';
import { brandingConfigurationDefaults } from '../config/brandingConfigurationDefaults.config';
import { auth } from '../config/auth.config';
import { csp } from '../config/csp.config';
import { dompurify } from '../config/dompurify.config';
import { reusableFormDefinitions } from '../config/reusableFormDefinitions.config';
import { custom } from '../config/custom.config';
import { custom_cache } from '../config/custom_cache.config';
import { static_assets } from '../config/static_assets.config';
import { ng2 } from '../config/ng2.config';
import { harvestRuns } from '../config/harvestRuns.config';
import { resolveCompanionConfiguration } from '../config/companionDefaults';
import { orcid } from '../config/orcid.config';
import { mint } from '../config/mint.config';
import { peopleSearch } from '../config/peopleSearch.config';
import { agendaQueueDefaultJobs } from '../config/agendaQueueJobs';
import {
  deploymentDefaults,
  deploymentSchema,
  deploymentEnvironmentInputs,
  deploymentCommandLineInputs,
} from './deployment';
import { loadStartupConfiguration } from './loading';
import {
  ConfigurationError,
  resolveStartupConfiguration,
  type ConfigurationLayer,
  type ConfigurationInput,
} from './resolution';
import type { ResolvedExtensions } from '../extensions/resolution';

const positive = z.number().int().positive();
const nonnegative = z.number().int().nonnegative();
const strings = z.array(z.string());
const data = z.record(z.string(), z.json());
const definitions = z.record(z.string(), data);
const validationMode = z.enum(['shadow', 'enforce']);
const uriExpression = z
  .object({
    source: z.string().max(4096),
    flags: z
      .string()
      .regex(/^[dimsuv]*$/)
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    try {
      new RegExp(value.source, value.flags);
    } catch {
      context.addIssue({ code: 'custom', message: 'Invalid URI expression' });
    }
  });
const profile = z
  .object({ ALLOWED_URI_REGEXP: uriExpression.optional() })
  .catchall(z.union([z.boolean(), strings, z.record(z.string(), z.boolean())]));
const sanitizer = z
  .object({
    profiles: z.record(z.string(), profile),
    defaultProfile: z.string().min(1),
    hooks: z
      .object({
        afterSanitizeAttributes: z.custom<(node: unknown) => void>(value => typeof value === 'function').optional(),
        beforeSanitizeElements: z.custom<(node: unknown) => void>(value => typeof value === 'function').optional(),
        afterSanitizeElements: z.custom<(node: unknown) => void>(value => typeof value === 'function').optional(),
      })
      .strict(),
    globalSettings: z.record(z.string(), z.boolean()),
  })
  .strict();
const pipeline = z
  .object({
    auditing: z.object({ enabled: z.boolean(), recordAuditJobName: z.string().min(1) }).strict(),
    baseUrl: z.object({ redbox: z.string(), mint: z.string() }).strict(),
    maxUploadSize: positive,
    mongodbDisk: z.string(),
    diskSpaceThreshold: nonnegative,
    checkTotalSizeOfFilesInRecordLogLevel: z.string().optional(),
    processRecordCountersLogLevel: z.string().optional(),
    api: z.record(
      z.string(),
      z
        .object({
          method: z.enum(['get', 'post', 'put', 'patch', 'delete']),
          url: z.string(),
          readTimeout: positive.optional(),
        })
        .strict()
    ),
    contextVariables: z.record(
      z.string(),
      z
        .object({
          source: z.enum(['request', 'metadata', 'record']),
          type: z.enum(['session', 'param', 'user', 'header']).optional(),
          field: z.string().optional(),
          parseUrl: z.boolean().optional(),
          searchParams: z.string().optional(),
        })
        .strict()
    ),
    export: z.object({ maxRecords: positive }).strict(),
    transfer: z.object({ maxRecordsPerPage: positive }).strict(),
    search: z.object({ returnFields: strings, maxRecordsPerPage: positive }).strict(),
    attachments: z
      .object({
        path: z.string(),
        store: z.enum(['file', 's3']).optional(),
        file: z.object({ directory: z.string() }).strict().optional(),
        s3: z
          .object({
            bucket: z.string(),
            region: z.string(),
            accessKeyId: z.string().optional(),
            secretAccessKey: z.string().optional(),
            endpoint: z.string().optional(),
            partSize: positive.optional(),
          })
          .strict()
          .optional(),
        stageDir: z.string().optional(),
        stagingExpiryMs: positive.optional(),
      })
      .strict(),
    datastreamService: z.string().optional(),
    helpEmail: z.string(),
    form: z
      .object({ htmlSanitizationMode: z.enum(['sanitize', 'reject']), returnMetadataOnSave: z.boolean() })
      .strict()
      .optional(),
  })
  .strict();
const authBootstrap = z
  .object({
    roles: z.array(z.object({ name: z.string().min(1) }).catchall(z.json())),
    rules: z.array(
      z
        .object({
          path: z.string().min(1),
          role: z.string().min(1),
          can_read: z.boolean().optional(),
          can_update: z.boolean().optional(),
        })
        .strict()
    ),
    defaultBrand: z.string().min(1),
    defaultPortal: z.string().min(1),
    loginPath: z.string(),
    hiddenRoles: strings,
    hiddenUsers: strings,
    postLogoutRedir: z.string(),
  })
  .strict();
const sessionSchema = deploymentSchema.shape.redboxSession.unwrap();
/** Per-layer structural checks. Stored DSLs also pass their domain's awaited readiness validation. */
export const portalSchema = deploymentSchema
  .extend({
    redboxSession: z.object(sessionSchema.shape).partial().strict(),
    auth: authBootstrap,
    logging: z.object({ level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']) }).strict(),
    page: z.object({ landingPath: z.string().regex(/^\/(?!\/)/), noCache: strings }).strict(),
    bootstrap: z.object({ bootstrapDataPath: z.string().min(1) }).strict(),
    appmode: z
      .object({
        bootstrapAlways: z.boolean(),
        hidePlaceholderPages: z.boolean(),
        features: data.optional(),
        flags: data.optional(),
      })
      .strict(),
    record: pipeline,
    recordValidation: z
      .object({
        mode: validationMode,
        timeoutMs: positive,
        operations: z.record(z.string(), z.object({ mode: validationMode.optional() }).strict()).optional(),
        allowedRequestParameters: strings.optional(),
      })
      .strict(),
    recordSchema: z
      .object({
        enabled: z.boolean(),
        unknownProperties: z.enum(['allow', 'declared']),
        cacheMaxEntries: positive,
        limits: z
          .object({
            maxDepth: positive,
            maxProperties: positive,
            maxDocumentBytes: positive,
            maxDiagnostics: positive,
            contributorTimeoutMs: positive,
          })
          .strict(),
        retention: z.object({ minimumAgeDays: nonnegative }).strict(),
        integrationPins: z
          .array(
            z
              .object({
                digest: z.string().min(1),
                brand: z.string().min(1),
                portal: z.string().min(1),
                schemaKind: z.enum(['create', 'update']),
                recordType: z.string().min(1),
                operation: z.string().min(1),
                owner: z.string().min(1),
                purpose: z.string().min(1),
                expiresAt: z.string().optional(),
              })
              .strict()
          )
          .optional(),
      })
      .strict(),
    recordtype: definitions,
    workflow: definitions,
    dashboardtype: definitions,
    dashboardview: definitions,
    workspacetype: definitions,
    i18n: data,
    vocab: data,
    solr: data,
    search: data,
    namedQuery: data,
    action: definitions,
    jsonld: z
      .object({ addJsonLdContext: z.boolean(), contexts: z.record(z.string(), z.record(z.string(), z.string())) })
      .strict(),
    emailnotification: data,
    appConfigSecrets: z
      .object({
        provider: z.enum(['database', 'aws-secrets-manager']),
        layout: z.enum(['per-field', 'brand-json']).optional(),
        region: z.string().optional(),
        namePrefix: z.string().min(1),
        kmsKeyId: z.string().optional(),
      })
      .strict(),
    branding: data,
    brandingConfigurationDefaults: data,
    csp: data,
    dompurify: sanitizer,
    reusableFormDefinitions: data,
    custom: data,
    custom_cache: data,
    static_assets: data,
    ng2: data,
    harvestRuns: data,
    companion: data,
    orcid: data,
    mint: data,
    peopleSearch: data,
    pdfgen: z
      .object({
        token: z.string(),
        appUrlOverride: z.string(),
        sourceUrlBase: z.string().url().optional(),
        pdfPrefix: z.string().min(1),
        readinessStrategy: z.enum(['networkIdle', 'selector', 'jsFlag', 'networkIdle+selector']),
        readinessTimeout: positive,
        networkIdleTime: nonnegative,
        waitForSelector: z.string(),
        waitForFunction: z.string(),
        enableChromeLogging: z.boolean(),
        maxRetries: nonnegative,
        retryDelayMs: nonnegative,
        retryBackoffMultiplier: z.number().min(1),
        PDFOptions: z
          .object({
            scale: z.number().min(0.1).max(2).optional(),
            displayHeaderFooter: z.boolean().optional(),
            headerTemplate: z.string().optional(),
            footerTemplate: z.string().optional(),
            printBackground: z.boolean().optional(),
            landscape: z.boolean().optional(),
            pageRanges: z.string().optional(),
            format: z
              .enum(['Letter', 'Legal', 'Tabloid', 'Ledger', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6'])
              .optional(),
            width: z.string().optional(),
            height: z.string().optional(),
            preferCSSPageSize: z.boolean().optional(),
            margin: z
              .object({
                top: z.string().optional(),
                bottom: z.string().optional(),
                left: z.string().optional(),
                right: z.string().optional(),
              })
              .strict()
              .optional(),
            omitBackground: z.boolean().optional(),
            tagged: z.boolean().optional(),
            outline: z.boolean().optional(),
            timeout: nonnegative.optional(),
            waitForFonts: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    redbox: z.object({ apiKey: z.string().optional() }).strict(),
  })
  .strict();
const completePortalSchema = portalSchema.extend({ redboxSession: sessionSchema });
export type PortalConfiguration = z.infer<typeof completePortalSchema> & PortalDomainConfiguration;
const validateDomains = new Ajv({
  strict: false,
  allErrors: false,
  formats: {
    'date-time': (value: string) =>
      /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/.test(value) &&
      DateTime.fromISO(value, { setZone: true }).isValid,
  },
}).compile<PortalDomainConfiguration>(domainSchema);

/** Only known executable sanitizer hooks survive startup resolution. Validators are owned code, not configuration. */
const executablePaths = [
  'dompurify.hooks.afterSanitizeAttributes',
  'dompurify.hooks.beforeSanitizeElements',
  'dompurify.hooks.afterSanitizeElements',
] as const;

/** Complete core data without importing the legacy config barrel, Pino logger or environment readers. */
export function portalDefaults(environment = 'development'): ConfigurationLayer {
  const deployment = deploymentDefaults(environment);
  const profiles = Object.fromEntries(
    Object.entries(dompurify.profiles)
      .filter((entry): entry is [string, NonNullable<(typeof entry)[1]>] => entry[1] !== undefined)
      .map(([name, value]) => {
        const expression = value.ALLOWED_URI_REGEXP;
        return [
          name,
          {
            ...value,
            ...(expression instanceof RegExp
              ? { ALLOWED_URI_REGEXP: { source: expression.source, flags: expression.flags } }
              : {}),
          },
        ];
      })
  );
  return {
    source: 'core',
    values: {
      ...deployment.values,
      agendaQueue: {
        options: deployment.values.agendaQueue && Reflect.get(deployment.values.agendaQueue, 'options'),
        jobs: agendaQueueDefaultJobs,
      },
      redboxSession: { name: 'redbox.sid', adapter: 'mongo', mongoUrl: 'mongodb://mongodb:27017/sessions' },
      logging: { level: 'info' },
      page: { landingPath: '/default/rdmp/home', noCache: [] },
      bootstrap: { bootstrapDataPath: 'bootstrap-data' },
      redbox: {},
      appmode: { ...appmode, bootstrapAlways: false },
      record,
      recordValidation,
      recordSchema,
      recordtype,
      workflow,
      dashboardtype,
      dashboardview,
      workspacetype,
      i18n,
      vocab,
      solr,
      search,
      namedQuery,
      action,
      jsonld,
      emailnotification,
      appConfigSecrets,
      branding,
      brandingConfigurationDefaults: {
        ...brandingConfigurationDefaults,
        oniPublishing: { ...brandingConfigurationDefaults.oniPublishing },
      },
      auth,
      csp,
      dompurify: { ...dompurify, profiles },
      reusableFormDefinitions,
      custom,
      custom_cache,
      static_assets,
      ng2,
      harvestRuns,
      companion: resolveCompanionConfiguration(),
      orcid,
      mint,
      peopleSearch,
    },
  };
}
const text = (path: string[]): ConfigurationInput => ({ path, parse: value => value });
export const portalEnvironmentInputs: Readonly<Record<string, ConfigurationInput>> = {
  ...deploymentEnvironmentInputs,
  REDBOX_ADMIN_USER: text(['brandingConfigurationDefaults', 'auth', 'local', 'default', 'adminUser']),
  REDBOX_ADMIN_PASSWORD: text(['brandingConfigurationDefaults', 'auth', 'local', 'default', 'adminPw']),
  REDBOX_ADMIN_EMAIL: text(['brandingConfigurationDefaults', 'auth', 'local', 'default', 'email']),
  REDBOX_ADMIN_TOKEN: text(['brandingConfigurationDefaults', 'auth', 'local', 'default', 'token']),
  REDBOX_LOG_LEVEL: text(['logging', 'level']),
  REDBOX_BOOTSTRAP_DATA_PATH: text(['bootstrap', 'bootstrapDataPath']),
  REDBOX_SOLR_HOST: text(['solr', 'cores', 'default', 'options', 'host']),
  REDBOX_SOLR_CORE: text(['solr', 'cores', 'default', 'options', 'core']),
};

/** Explicit files and selected declarations; no generated shims, global rc parser or business bootstrap. */
export async function loadPortalConfiguration(
  options: {
    environment?: string;
    extensions?: Pick<ResolvedExtensions, 'providers'>;
    files?: { application?: string; environment?: string; local?: string };
    env?: Readonly<Record<string, string | undefined>>;
    argv?: readonly string[];
  } = {}
): Promise<Readonly<PortalConfiguration>> {
  const snapshot = await loadStartupConfiguration({
    schema: portalSchema,
    core: portalDefaults(options.environment),
    extensions: options.extensions,
    files: options.files,
    env: options.env,
    argv: options.argv,
    environmentInputs: portalEnvironmentInputs,
    commandLineInputs: deploymentCommandLineInputs,
    executablePaths,
  });
  // Inputs can fill a session section across layers. Complete validation is still
  // offline, before any client, logger worker, listener or domain construction.
  const configuration = resolveStartupConfiguration({
    schema: completePortalSchema,
    core: { source: 'final portal configuration', values: snapshot },
    executablePaths,
  });
  if (!validateDomains(configuration)) {
    const error = validateDomains.errors?.[0];
    throw new ConfigurationError(
      'final portal domain configuration',
      error?.instancePath || '/',
      'invalid domain data'
    );
  }
  return configuration;
}
