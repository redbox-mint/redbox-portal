import { z } from 'zod';
import { agendaQueueDefaultOptions } from '../config/agendaQueueDefaults';
import { datastores } from '../config/datastores.config';
import { storage } from '../config/storage.config';
import { resolveDatastore, resolveSessionDatastore } from '../persistence/mongodb/configuration';
import {
  ConfigurationError,
  isConfigurationObject,
  type ConfigurationInput,
  type ConfigurationLayer,
} from './resolution';
import { loadStartupConfiguration } from './loading';

const positive = z.number().int().positive();
const jsonMap = z.record(z.string(), z.json());
const connection = jsonMap.superRefine((value, context) => {
  try {
    resolveDatastore(value);
  } catch {
    context.addIssue({ code: 'custom', message: 'Invalid MongoDB connection configuration' });
  }
});
const mongoIndex = z
  .object({
    key: z.record(z.string(), z.union([z.number(), z.enum(['2d', '2dsphere', 'text', 'geoHaystack', 'hashed'])])),
  })
  .catchall(z.json());
const visibility = z.enum(['public', 'private']).optional();
const disk = z.discriminatedUnion('driver', [
  z.object({ driver: z.literal('fs'), config: z.object({ root: z.string().min(1), visibility }).strict() }).strict(),
  z
    .object({
      driver: z.literal('gridfs'),
      config: z
        .object({
          datastore: z.string().optional(),
          url: z.string().optional(),
          databaseName: z.string().optional(),
          bucketName: z.string().optional(),
          visibility,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      driver: z.literal('s3'),
      config: z
        .object({
          key: z.string().optional(),
          secret: z.string().optional(),
          bucket: z.string().min(1),
          region: z.string().min(1).optional(),
          endpoint: z.string().optional(),
          forcePathStyle: z.boolean().optional(),
          bucketEndpoint: z.boolean().optional(),
          tls: z.boolean().optional(),
          useAccelerateEndpoint: z.boolean().optional(),
          supportsACL: z.boolean().optional(),
          visibility,
        })
        .catchall(z.json()),
    })
    .strict(),
]);
const session = z
  .object({
    name: z.string().min(1),
    secret: z.string().min(32),
    adapter: z.literal('mongo'),
    mongoUrl: z.string().min(1),
    mongoOptions: jsonMap.optional(),
    dbName: z.string().optional(),
    collection: z.string().optional(),
    ttl: positive.optional(),
    touchAfter: z.number().nonnegative().optional(),
    stringify: z.boolean().optional(),
    cookie: z
      .object({
        maxAge: positive.optional(),
        httpOnly: z.boolean().optional(),
        sameSite: z.union([z.boolean(), z.enum(['lax', 'strict', 'none'])]).optional(),
        secure: z.union([z.boolean(), z.literal('auto')]).optional(),
        path: z.string().optional(),
        domain: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    try {
      resolveSessionDatastore(value);
    } catch {
      context.addIssue({ code: 'custom', message: 'Invalid MongoDB session configuration' });
    }
  });

const backend = z.enum(['mongodb', 'sqs']);
const agendaQueue = z
  .object({
    options: z
      .object({
        backend: backend.optional(),
        db: z.string().optional(),
        collection: z.string().min(1).optional(),
        defaultLockLifetime: positive.optional(),
        processEvery: z.string().min(1).optional(),
        historyRetentionHours: z.number().nonnegative().optional(),
        drainTimeoutMs: positive.max(2_147_483_647).optional(),
        sqs: z
          .object({
            queueUrl: z.string().min(1),
            region: z.string().optional(),
            endpoint: z.string().optional(),
            queueType: z.enum(['standard', 'fifo']).optional(),
            waitTimeSeconds: z.number().int().min(0).max(20).optional(),
            visibilityTimeout: positive.optional(),
            fifoMessageGroupIdStrategy: z.enum(['jobName', 'fixed']).optional(),
            fifoMessageGroupId: z.string().optional(),
            maxMessagesPerPoll: positive.max(10).optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    jobs: z.record(
      z.string(),
      z
        .object({
          fnName: z.string().min(1),
          backend: backend.optional(),
          options: z
            .object({
              lockLifetime: positive.optional(),
              lockLimit: z.number().int().nonnegative().optional(),
              concurrency: positive.optional(),
              priority: z.union([z.number(), z.enum(['lowest', 'low', 'normal', 'high', 'highest'])]).optional(),
            })
            .strict()
            .optional(),
          schedule: z
            .object({
              method: z.enum(['every', 'schedule', 'now']),
              intervalOrSchedule: z.string().optional(),
              data: z.json().optional(),
              opts: z
                .object({
                  timezone: z.string().optional(),
                  skipImmediate: z.boolean().optional(),
                  forkMode: z.boolean().optional(),
                })
                .strict()
                .optional(),
            })
            .strict()
            .optional(),
        })
        .strict()
    ),
  })
  .strict();

/** Deployment-owned values. Domain compositions extend this with their concrete section schemas. */
export const deploymentSchema = z
  .object({
    agendaQueue,
    environment: z.string().regex(/^[A-Za-z0-9_-]+$/),
    server: z
      .object({
        port: z.number().int().min(0).max(65535),
        hostname: z.string().min(1),
        publicUrl: z.url().regex(/^https?:\/\//),
        rootContext: z.string().refine(value => value === '' || /^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(value)),
        trustProxy: z.union([z.boolean(), z.number().int().nonnegative(), z.array(z.string().min(1))]),
        stopDeadlineMs: positive.max(2_147_483_647),
      })
      .strict(),
    datastores: z.object({ mongodb: connection, redboxStorage: connection }).strict(),
    redboxSession: session.optional(),
    auth: z
      .object({ defaultBrand: z.string().min(1), defaultPortal: z.string().min(1) })
      .catchall(z.json())
      .optional(),
    brandingConfigurationDefaults: jsonMap.optional(),
    storage: z
      .object({
        serviceName: z.string().min(1),
        mongodb: z
          .object({
            indices: z.array(mongoIndex).optional(),
            deletedRecordIndices: z.array(mongoIndex).optional(),
            recordIdentityIndices: z.array(mongoIndex).optional(),
          })
          .strict()
          .optional(),
        defaultDisk: z.string().optional(),
        stagingDisk: z.string().optional(),
        primaryDisk: z.string().optional(),
        keyPrefix: z.string().optional(),
        disks: z.record(z.string(), disk).optional(),
      })
      .strict(),
  })
  .strict();
export type DeploymentConfiguration = z.infer<typeof deploymentSchema>;

export function deploymentDefaults(environment = 'development'): ConfigurationLayer {
  return {
    source: 'core',
    values: {
      environment,
      agendaQueue: { options: agendaQueueDefaultOptions, jobs: {} },
      server: {
        port: 1500,
        hostname: '0.0.0.0',
        publicUrl: 'http://localhost:1500',
        rootContext: '',
        trustProxy: false,
        stopDeadlineMs: 30_000,
      },
      datastores,
      storage,
    },
  };
}
const text = (path: string[]): ConfigurationInput => ({ path, parse: value => value });
const number = (path: string[]): ConfigurationInput => ({
  path,
  parse: value => {
    if (!/^\d+$/.test(value)) throw Error('integer');
    return Number(value);
  },
});
const json = (path: string[]): ConfigurationInput => ({ path, parse: value => JSON.parse(value) as unknown });

/** No arbitrary nested environment/rc parsing. Add inputs only when their owner supports them. */
export const deploymentEnvironmentInputs: Readonly<Record<string, ConfigurationInput>> = {
  REDBOX_AGENDA_BACKEND: text(['agendaQueue', 'options', 'backend']),
  REDBOX_AGENDA_MONGODB_URL: text(['agendaQueue', 'options', 'db']),
  REDBOX_AGENDA_COLLECTION: text(['agendaQueue', 'options', 'collection']),
  REDBOX_AGENDA_PROCESS_EVERY: text(['agendaQueue', 'options', 'processEvery']),
  REDBOX_AGENDA_HISTORY_RETENTION_HOURS: {
    path: ['agendaQueue', 'options', 'historyRetentionHours'],
    parse: value => {
      if (!value.trim()) throw Error('hours');
      return Number(value);
    },
  },
  REDBOX_PORT: number(['server', 'port']),
  REDBOX_HOSTNAME: text(['server', 'hostname']),
  REDBOX_PUBLIC_URL: text(['server', 'publicUrl']),
  REDBOX_ROOT_CONTEXT: text(['server', 'rootContext']),
  REDBOX_TRUST_PROXY: json(['server', 'trustProxy']),
  REDBOX_STOP_DEADLINE_MS: number(['server', 'stopDeadlineMs']),
  REDBOX_MONGODB_URL: text(['datastores', 'mongodb', 'url']),
  REDBOX_STORAGE_MONGODB_URL: text(['datastores', 'redboxStorage', 'url']),
  REDBOX_SESSION_SECRET: text(['redboxSession', 'secret']),
  REDBOX_SESSION_MONGODB_URL: text(['redboxSession', 'mongoUrl']),
};
export const deploymentCommandLineInputs: Readonly<Record<string, ConfigurationInput>> = {
  port: deploymentEnvironmentInputs.REDBOX_PORT,
  hostname: deploymentEnvironmentInputs.REDBOX_HOSTNAME,
  'public-url': deploymentEnvironmentInputs.REDBOX_PUBLIC_URL,
  'root-context': deploymentEnvironmentInputs.REDBOX_ROOT_CONTEXT,
  'stop-deadline-ms': deploymentEnvironmentInputs.REDBOX_STOP_DEADLINE_MS,
};

/** Deliberate conversion of data, not a loader for Sails hooks, files, globals or middleware. */
export function convertLegacyDeployment(
  values: Readonly<Record<string, unknown>>,
  source = 'legacy deployment'
): ConfigurationLayer {
  const result: Record<string, unknown> = {};
  const server: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (
      [
        'datastores',
        'redboxSession',
        'auth',
        'brandingConfigurationDefaults',
        'storage',
        'environment',
        'agendaQueue',
      ].includes(key)
    )
      result[key] = value;
    else if (key === 'port') server.port = value;
    else if (key === 'host') server.hostname = value;
    else if (key === 'appUrl') server.publicUrl = value;
    else if (key === 'session' && value === false) {
      /* Sails' own session hook was disabled; ReDBox sessions are separate. */
    } else if (key === 'http' && isConfigurationObject(value)) {
      for (const [setting, entry] of Object.entries(value)) {
        if (setting === 'rootContext' || setting === 'trustProxy') server[setting] = entry;
        else
          throw new ConfigurationError(
            source,
            'http.' + setting,
            'unsupported Sails middleware setting; declare an owned Express integration'
          );
      }
    } else
      throw new ConfigurationError(
        source,
        key,
        'unsupported legacy key; move domain data to its typed section or convert lifecycle code to extension declarations'
      );
  }
  if (Object.keys(server).length) result.server = server;
  return { source, values: result };
}

/** Convert only the documented aliases. Canonical REDBOX values win; duplicate legacy spellings fail. */
export function convertLegacyEnvironment(
  environment: Readonly<Record<string, string | undefined>>
): Record<string, string | undefined> {
  const aliases: Record<string, string> = {
    sails_port: 'REDBOX_PORT',
    sails_host: 'REDBOX_HOSTNAME',
    sails_appUrl: 'REDBOX_PUBLIC_URL',
    sails_http__rootContext: 'REDBOX_ROOT_CONTEXT',
    sails_http__trustProxy: 'REDBOX_TRUST_PROXY',
    sails_datastores__mongodb__url: 'REDBOX_MONGODB_URL',
    sails_datastores__redboxStorage__url: 'REDBOX_STORAGE_MONGODB_URL',
    sails__redboxSession_secret: 'REDBOX_SESSION_SECRET',
    sails_redboxSession__secret: 'REDBOX_SESSION_SECRET',
    sails__redboxSession_mongoUrl: 'REDBOX_SESSION_MONGODB_URL',
    sails_redboxSession__mongoUrl: 'REDBOX_SESSION_MONGODB_URL',
  };
  for (const [legacy, canonical] of Object.entries({
    backend: 'BACKEND',
    db: 'MONGODB_URL',
    collection: 'COLLECTION',
    processEvery: 'PROCESS_EVERY',
    historyRetentionHours: 'HISTORY_RETENTION_HOURS',
  })) {
    aliases['sails__agendaQueue_options_' + legacy] = 'REDBOX_AGENDA_' + canonical;
    aliases['sails_agendaQueue__options__' + legacy] = 'REDBOX_AGENDA_' + canonical;
  }
  const converted: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) continue;
    const target = aliases[key];
    if (/^sails_/i.test(key) && !target)
      throw new ConfigurationError(
        'legacy environment',
        key,
        'unsupported legacy input; convert to a documented typed value'
      );
    if (target) {
      if (Object.hasOwn(converted, target))
        throw new ConfigurationError('legacy environment', target, 'ambiguous legacy aliases');
      converted[target] = value;
    }
  }
  return {
    ...converted,
    ...Object.fromEntries(
      Object.entries(environment).filter(([key, value]) => value !== undefined && !/^sails_/i.test(key))
    ),
  };
}

export async function loadDeploymentConfiguration(
  options: {
    readonly environment?: string;
    readonly files?: { readonly application?: string; readonly environment?: string; readonly local?: string };
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly argv?: readonly string[];
  } = {}
): Promise<Readonly<DeploymentConfiguration>> {
  return loadStartupConfiguration({
    schema: deploymentSchema,
    core: deploymentDefaults(options.environment),
    files: options.files,
    env: options.env,
    argv: options.argv,
    environmentInputs: deploymentEnvironmentInputs,
    commandLineInputs: deploymentCommandLineInputs,
  });
}
