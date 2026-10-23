import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import _ from 'lodash';
import { metTriggerCondition } from '../utilities/metTriggerCondition';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Records } from '../records/Records';
import type { QueueService } from '../QueueService';
import type { AuditAdapter } from '../services/raid-v2/audit';
import { RBValidationError } from '../model/RBValidationError';
import type { RecordModel } from '../model/storage/RecordModel';
import type {
  RaidPublishingConfigData,
  RaidMappingField,
  RaidContributorMapping,
} from '../configmodels/RaidPublishing';
import { buildContributors, buildSubjects, makeMappingLayer } from '../services/raid-v2/mapping';
import { makeHttpLayer, type RaidTokenEntry } from './raid/http';
import { makeAuditLayer } from '../services/raid-v2/audit';
import { makeLoggerLayer } from '../services/raid-v2/logger';
import { mintRaidProgram, runRaidProgram } from '../services/raid-v2/runtime';
import { RaidConfigTag, RaidQueueTag, RaidRecordRepositoryTag, RaidRunContextTag } from '../services/raid-v2/tags';
import { RaidQueueError, RaidSourceRecordError } from '../services/raid-v2/errors';
import type {
  RaidInitiatingActor,
  RaidOptions as BaseRaidOptions,
  RaidRuntimeInput,
  SerializableRaidOptions,
} from '../services/raid-v2/types';

export interface RaidInput {
  readonly log: ILogger;
  brand(value: string): { id?: string; name: string } | undefined;
  configuration(brandName: string): RaidPublishingConfigData | undefined;
  defaultConfiguration(): RaidPublishingConfigData;
  readonly records: Pick<Records.Records, 'getMeta' | 'appendToRecord'>;
  readonly queue: Pick<QueueService, 'schedule'>;
  readonly audit: AuditAdapter;
}
export namespace Services {
  export type RecordLike = RecordModel | Record<string, unknown>;
  export interface RaidOptions extends BaseRaidOptions {}
  type MintRetryJob = {
    attrs: {
      data: {
        oid: string;
        options: SerializableRaidOptions;
        attemptCount?: number;
        traceId?: string;
        initiatingActor?: RaidInitiatingActor;
      };
    };
  };
  type AnyRecord = Record<string, unknown>;

  function getPath(value: unknown, path: string): unknown {
    return path
      .replace(/\[(\d+)\]/g, '.$1')
      .split('.')
      .filter(Boolean)
      .reduce<unknown>(
        (cur, key) => (cur != null && typeof cur === 'object' ? (cur as AnyRecord)[key] : undefined),
        value
      );
  }

  export class Raid {
    private readonly tokens = new Map<string, RaidTokenEntry>();
    public close(): void {
      this.tokens.clear();
    }
    public readonly logHeader = 'RaidService::';
    protected metTriggerCondition(...args: Parameters<typeof metTriggerCondition>): string {
      return metTriggerCondition(...args);
    }
    protected _exportedMethods = [
      'mintTrigger',
      'getContributors',
      'buildContribVal',
      'mintPostCreateRetryHandler',
      'mintRetryJob',
    ];

    constructor(protected readonly input: RaidInput) {}

    private initiatingActor(user: unknown): RaidInitiatingActor | undefined {
      if (!user || typeof user !== 'object' || Array.isArray(user)) return undefined;
      const userRecord = user as Record<string, unknown>;
      const username = typeof userRecord.username === 'string' ? userRecord.username.trim() : '';
      if (!username) return undefined;
      const rawRoles = Array.isArray(userRecord.roles) ? userRecord.roles : [];
      const roles = rawRoles.flatMap(role => {
        if (typeof role === 'string') {
          const name = role.trim();
          return name ? [{ name }] : [];
        }
        if (!role || typeof role !== 'object' || Array.isArray(role)) return [];
        const roleRecord = role as Record<string, unknown>;
        const id = typeof roleRecord.id === 'string' ? roleRecord.id.trim() : '';
        const name = typeof roleRecord.name === 'string' ? roleRecord.name.trim() : '';
        return id || name ? [{ ...(id ? { id } : {}), ...(name ? { name } : {}) }] : [];
      });
      return { username, roles };
    }

    private resolveBrand(record: RecordLike): { id: string; name: string } {
      const brandId = String(getPath(record, 'metaMetadata.brandId') ?? '');
      if (!brandId)
        throw new RBValidationError({
          message: 'Brand id not found for RAiD record',
          displayErrors: [{ code: 'raid-mint-transform-validation-error' }],
        });
      const brand = this.input.brand(brandId);
      if (!brand)
        throw new RBValidationError({
          message: `Unknown brand '${brandId}' for RAiD record`,
          displayErrors: [{ code: 'raid-mint-transform-validation-error' }],
        });
      return { id: String(brand.id), name: String(brand.name) };
    }

    private resolveConfig(record: RecordLike): {
      brand: { id: string; name: string };
      config: RaidPublishingConfigData;
    } {
      const brand = this.resolveBrand(record);
      const branded = this.input.configuration(brand.name);
      const config = branded ?? this.input.defaultConfiguration();
      if (!config?.connection?.baseUrl)
        throw new RBValidationError({
          message: `RAiD base URL is not configured for brand '${brand.name}'`,
          displayErrors: [{ code: 'raid-mint-transform-validation-error' }],
        });
      if (config.connection.retry.maxAttempts < 1 || config.connection.timeoutMs < 1)
        throw new RBValidationError({
          message: `Invalid RAiD retry/timeout configuration for brand '${brand.name}'`,
          displayErrors: [{ code: 'raid-mint-transform-validation-error' }],
        });
      for (const [profile, fields] of Object.entries(config.mapping))
        for (const [name, field] of Object.entries(fields)) {
          if ((field.expression ?? field.template ?? '').includes('<%'))
            throw new RBValidationError({
              message: `Legacy lodash syntax is not supported in RAiD mapping '${profile}.${name}'`,
              displayErrors: [{ code: 'raid-mint-transform-validation-error' }],
            });
        }
      return { brand, config };
    }

    private buildLayer(input: RaidRuntimeInput) {
      const base = Layer.merge(
        Layer.succeed(RaidConfigTag, input.config),
        Layer.succeed(RaidRunContextTag, input.context)
      );
      const records = Layer.succeed(RaidRecordRepositoryTag, {
        getMeta: (oid: string) =>
          Effect.tryPromise({
            try: () => this.input.records.getMeta(oid),
            catch: cause => new RaidSourceRecordError({ message: `Failed to load record '${oid}'`, cause }),
          }),
        appendToRecord: (oid: string, value: unknown, path: string) =>
          Effect.tryPromise({
            try: async () => {
              const result = await this.input.records.appendToRecord(
                oid,
                value,
                path,
                undefined,
                undefined,
                input.context.initiatingActor
              );
              if (!result?.isSuccessful?.()) throw new Error(String(result?.message ?? 'append failed'));
            },
            catch: cause => cause,
          }),
      });
      const queue = Layer.succeed(RaidQueueTag, {
        schedule: (data: {
          oid: string;
          options: SerializableRaidOptions;
          attemptCount: number;
          traceId?: string;
          initiatingActor?: RaidInitiatingActor;
        }) =>
          Effect.tryPromise({
            try: async () => {
              await this.input.queue.schedule(
                input.config.durableRetry.jobName,
                input.config.durableRetry.schedule,
                data
              );
            },
            catch: cause => new RaidQueueError({ message: 'Failed to schedule RAiD retry', cause }),
          }),
      });
      const servicesLayer = Layer.mergeAll(
        makeMappingLayer(),
        makeHttpLayer(this.tokens),
        makeAuditLayer(this.input.audit)
      ).pipe(Layer.provide(base));
      return Layer.mergeAll(base, records, queue, servicesLayer, makeLoggerLayer(this.input.log));
    }

    private async mintRaid(
      oid: string,
      record: RecordLike,
      options: RaidOptions,
      attemptCount = 0,
      initiatingUser: unknown = {}
    ): Promise<RecordLike> {
      const { brand, config } = this.resolveConfig(record);
      if (!config.enabled) return record;
      const initiatingActor = this.initiatingActor(initiatingUser);
      const input: RaidRuntimeInput = {
        record,
        options,
        config,
        context: {
          oid,
          brandId: brand.id,
          brandName: brand.name,
          triggerSource: String(options.triggerSource ?? 'mintTrigger'),
          attemptCount,
          ...(initiatingActor ? { initiatingActor } : {}),
        },
      };
      const program = mintRaidProgram(input).pipe(Effect.provide(this.buildLayer(input)));
      try {
        return await runRaidProgram(program, options.signal);
      } catch (error) {
        const status =
          typeof error === 'object' && error !== null && 'statusCode' in error
            ? String((error as AnyRecord).statusCode ?? '')
            : '';
        throw new RBValidationError({
          message: error instanceof Error ? error.message : String(error),
          options: { cause: error },
          displayErrors: [
            {
              code:
                error != null && typeof error === 'object' && String((error as AnyRecord)._tag).includes('Mapping')
                  ? 'raid-mint-transform-validation-error'
                  : 'raid-mint-server-error',
              status,
            },
          ],
        });
      }
    }

    public async mintTrigger(
      oid: string,
      record: RecordLike,
      options: RaidOptions,
      user: unknown = {}
    ): Promise<RecordLike> {
      if (this.metTriggerCondition(oid, record as AnyRecord, options) === 'true') {
        await this.mintRaid(oid, record, options, 0, user);
      }
      return record;
    }

    public async mintRetryJob(job: MintRetryJob) {
      const data = job.attrs.data;
      const record = await this.input.records.getMeta(data.oid);
      await this.mintRaid(
        data.oid,
        record,
        { ...(data.options ?? {}), triggerSource: 'mintRetryJob' },
        data.attemptCount ?? 0,
        data.initiatingActor
      );
    }

    public async mintPostCreateRetryHandler(
      oid: string,
      record: RecordLike,
      _options: RaidOptions,
      user: unknown = {}
    ) {
      const attemptCount = Number(getPath(record, 'metaMetadata.raid.attemptCount') ?? 0);
      if (oid && attemptCount > 0) {
        const options = (getPath(record, 'metaMetadata.raid.options') ?? {}) as SerializableRaidOptions;
        const config = getPath(record, 'metaMetadata.brandId')
          ? this.resolveConfig(record).config
          : this.input.defaultConfiguration();
        const initiatingActor = this.initiatingActor(user);
        await this.input.queue.schedule(config.durableRetry.jobName, config.durableRetry.schedule, {
          oid,
          options,
          attemptCount,
          ...(initiatingActor ? { initiatingActor } : {}),
        });
      }
    }

    public getContributors(
      record: RecordLike,
      options: RaidOptions,
      fieldConfig?: Record<string, unknown>,
      mappedData?: Record<string, unknown>
    ) {
      const config = this.input.defaultConfiguration();
      return buildContributors(record, fieldConfig as unknown as RaidMappingField, mappedData ?? {}, config);
    }

    public buildContribVal(
      contributors: Record<string, Record<string, unknown>>,
      contribVal: Record<string, unknown>,
      contribConfig: RaidContributorMapping,
      startDate: string,
      endDate?: string
    ) {
      const fakeRecord = { metadata: { contributor: contribVal } };
      const config = this.input.defaultConfiguration();
      const built = buildContributors(
        fakeRecord,
        {
          dest: 'contributor',
          engine: 'jsonata',
          expression: '$contributors()',
          contributorMap: { contributor: contribConfig },
        },
        { date: { startDate, endDate } },
        config
      );
      for (const item of built) {
        const existing = contributors[item.id];
        if (!existing) {
          contributors[item.id] = item;
          continue;
        }
        for (const key of ['role', 'position'] as const) {
          const current = Array.isArray(existing[key]) ? (existing[key] as AnyRecord[]) : [];
          const additions = Array.isArray(item[key]) ? (item[key] as AnyRecord[]) : [];
          existing[key] = [
            ...current,
            ...additions.filter(addition => !current.some(value => value.id === addition.id)),
          ];
        }
        for (const [key, value] of Object.entries(item)) if (!(key in existing)) existing[key] = value;
      }
    }

    public getSubject(
      record: RecordLike,
      _options: RaidOptions,
      _fieldConfig: Record<string, unknown> = {},
      subjects: Array<Record<string, unknown>> = [],
      subjectType = '',
      subjectData?: Array<Record<string, unknown>>
    ) {
      const config = this.input.defaultConfiguration();
      subjects.push(...buildSubjects(subjectData, subjectType, config));
      return subjects;
    }
  }
}
