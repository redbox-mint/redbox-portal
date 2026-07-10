/* oxlint-disable typescript/no-explicit-any */
import { Effect, Layer } from 'effect';
import { Services as services } from '../CoreService';
import { RBValidationError } from '../model/RBValidationError';
import type { RecordModel } from '../model/storage/RecordModel';
import type { RaidPublishingConfigData, RaidMappingField } from '../configmodels/RaidPublishing';
import { buildContributors, buildSubjects, makeMappingLayer } from './raid-v2/mapping';
import { makeHttpLayer } from './raid-v2/http';
import { makeAuditLayer } from './raid-v2/audit';
import { makeLoggerLayer } from './raid-v2/logger';
import { mintRaidProgram, runRaidProgram } from './raid-v2/runtime';
import { RaidConfigTag, RaidQueueTag, RaidRecordRepositoryTag, RaidRunContextTag } from './raid-v2/tags';
import { RaidQueueError, RaidSourceRecordError } from './raid-v2/errors';
import type { RaidOptions as BaseRaidOptions, RaidRuntimeInput, SerializableRaidOptions } from './raid-v2/types';

export namespace Services {
  export type RecordLike = RecordModel | Record<string, unknown>;
  export interface RaidOptions extends BaseRaidOptions {}
  type MintRetryJob = { attrs: { data: { oid: string; options: SerializableRaidOptions; attemptCount?: number; traceId?: string } } };
  type AnyRecord = Record<string, any>;

  function getPath(value: unknown, path: string): unknown {
    return path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean).reduce<unknown>((cur, key) => cur != null && typeof cur === 'object' ? (cur as AnyRecord)[key] : undefined, value);
  }

  function legacyConfigToPublishing(raw: AnyRecord): RaidPublishingConfigData {
    return {
      enabled: raw.enabled !== false,
      connection: {
        baseUrl: String(raw.basePath ?? ''), token: String(raw.token ?? ''), timeoutMs: Number(raw.timeoutMs ?? 30000),
        oauth: { url: String(raw.oauth?.url ?? ''), clientId: String(raw.oauth?.client_id ?? raw.oauth?.clientId ?? ''), username: String(raw.oauth?.username ?? ''), password: String(raw.oauth?.password ?? ''), timeoutMs: Number(raw.oauth?.timeoutMs ?? 10000), expirySkewMs: Number(raw.oauth?.expirySkewMs ?? 30000) },
        retry: { maxAttempts: Number(raw.retry?.maxAttempts ?? 3), baseDelayMs: Number(raw.retry?.baseDelayMs ?? 500), maxDelayMs: Number(raw.retry?.maxDelayMs ?? 10000), jitter: raw.retry?.jitter !== false, retryOnStatusCodes: raw.retry?.retryOnStatusCodes ?? [408, 425, 429, 500, 502, 503, 504] }
      },
      durableRetry: { jobName: String(raw.retryJobName ?? 'RaidMintRetryJob'), schedule: String(raw.retryJobSchedule ?? 'in 5 minutes'), maxAttempts: Number(raw.retryJobMaxAttempts ?? 5) },
      saveBodyInMeta: raw.saveBodyInMeta !== false, raidFieldName: String(raw.raidFieldName ?? 'raidUrl'), orcidBaseUrl: String(raw.orcidBaseUrl ?? 'https://orcid.org/'),
      types: raw.types ?? {}, mapping: raw.mapping ?? {}
    };
  }

  export class Raid extends services.Core.Service {
    protected override _exportedMethods = ['mintTrigger', 'getContributors', 'buildContribVal', 'mintPostCreateRetryHandler', 'mintRetryJob'];

    constructor() { super(); this.logHeader = 'RaidService::'; }

    private resolveBrand(record: RecordLike): { id: string; name: string } {
      const brandId = String(getPath(record, 'metaMetadata.brandId') ?? '');
      if (!brandId) throw new RBValidationError({ message: 'Brand id not found for RAiD record', displayErrors: [{ code: 'raid-mint-transform-validation-error' }] });
      const brand = BrandingService.getBrandById(brandId) ?? BrandingService.getBrand(brandId);
      if (!brand) throw new RBValidationError({ message: `Unknown brand '${brandId}' for RAiD record`, displayErrors: [{ code: 'raid-mint-transform-validation-error' }] });
      return { id: String(brand.id), name: String(brand.name) };
    }

    private resolveConfig(record: RecordLike): { brand: { id: string; name: string }; config: RaidPublishingConfigData } {
      const brand = this.resolveBrand(record);
      const branded = AppConfigService?.getAppConfigurationForBrand?.(brand.name)?.raidPublishing as RaidPublishingConfigData | undefined;
      const defaultBrand = BrandingService.getDefault?.();
      const fallback = defaultBrand ? AppConfigService?.getAppConfigurationForBrand?.(defaultBrand.name)?.raidPublishing as RaidPublishingConfigData | undefined : undefined;
      const config = branded ?? fallback ?? legacyConfigToPublishing(sails.config.raid as AnyRecord);
      if (!config?.connection?.baseUrl) throw new RBValidationError({ message: `RAiD base URL is not configured for brand '${brand.name}'`, displayErrors: [{ code: 'raid-mint-transform-validation-error' }] });
      if (config.connection.retry.maxAttempts < 1 || config.connection.timeoutMs < 1) throw new RBValidationError({ message: `Invalid RAiD retry/timeout configuration for brand '${brand.name}'`, displayErrors: [{ code: 'raid-mint-transform-validation-error' }] });
      for (const [profile, fields] of Object.entries(config.mapping)) for (const [name, field] of Object.entries(fields)) {
        if ((field.expression ?? field.template ?? '').includes('<%')) throw new RBValidationError({ message: `Legacy lodash syntax is not supported in RAiD mapping '${profile}.${name}'`, displayErrors: [{ code: 'raid-mint-transform-validation-error' }] });
      }
      return { brand, config };
    }

    private buildLayer(input: RaidRuntimeInput) {
      const base = Layer.merge(Layer.succeed(RaidConfigTag, input.config), Layer.succeed(RaidRunContextTag, input.context));
      const records = Layer.succeed(RaidRecordRepositoryTag, {
        getMeta: (oid: string) => Effect.tryPromise({ try: () => RecordsService.getMeta(oid), catch: cause => new RaidSourceRecordError({ message: `Failed to load record '${oid}'`, cause }) }),
        appendToRecord: (oid: string, value: unknown, path: string) => Effect.tryPromise({ try: async () => { const result = await RecordsService.appendToRecord(oid, value, path); if (!result?.isSuccessful?.()) throw new Error(String(result?.message ?? 'append failed')); }, catch: cause => cause })
      });
      const queue = Layer.succeed(RaidQueueTag, {
        schedule: (data: { oid: string; options: SerializableRaidOptions; attemptCount: number; traceId?: string }) => Effect.tryPromise({
          try: async () => { await AgendaQueueService.schedule(input.config.durableRetry.jobName, input.config.durableRetry.schedule, data); },
          catch: cause => new RaidQueueError({ message: 'Failed to schedule RAiD retry', cause })
        })
      });
      const servicesLayer = Layer.mergeAll(makeMappingLayer(), makeHttpLayer(), makeAuditLayer(typeof IntegrationAuditService !== 'undefined' ? IntegrationAuditService : undefined)).pipe(Layer.provide(base));
      return Layer.mergeAll(base, records, queue, servicesLayer, makeLoggerLayer(sails.log));
    }

    private async mintRaid(oid: string, record: RecordLike, options: RaidOptions, attemptCount = 0): Promise<RecordLike> {
      const { brand, config } = this.resolveConfig(record);
      if (!config.enabled) return record;
      const input: RaidRuntimeInput = { record, options, config, context: { oid, brandId: brand.id, brandName: brand.name, triggerSource: String(options.triggerSource ?? 'mintTrigger'), attemptCount } };
      const program = mintRaidProgram(input).pipe(Effect.provide(this.buildLayer(input)));
      try { return await runRaidProgram(program, options.signal); }
      catch (error) {
        const status = typeof error === 'object' && error !== null && 'statusCode' in error ? String((error as AnyRecord).statusCode ?? '') : '';
        throw new RBValidationError({ message: error instanceof Error ? error.message : String(error), options: { cause: error }, displayErrors: [{ code: error != null && typeof error === 'object' && String((error as AnyRecord)._tag).includes('Mapping') ? 'raid-mint-transform-validation-error' : 'raid-mint-server-error', status }] });
      }
    }

    public async mintTrigger(oid: string, record: RecordLike, options: RaidOptions): Promise<RecordLike> {
      if (this.metTriggerCondition(oid, record as AnyRecord, options) === 'true') await this.mintRaid(oid, record, options);
      return record;
    }

    public async mintRetryJob(job: MintRetryJob) {
      const data = job.attrs.data; const record = await RecordsService.getMeta(data.oid);
      await this.mintRaid(data.oid, record, { ...(data.options ?? {}), triggerSource: 'mintRetryJob' }, data.attemptCount ?? 0);
    }

    public async mintPostCreateRetryHandler(oid: string, record: RecordLike, _options: RaidOptions) {
      const attemptCount = Number(getPath(record, 'metaMetadata.raid.attemptCount') ?? 0);
      if (oid && attemptCount > 0) {
        const options = (getPath(record, 'metaMetadata.raid.options') ?? {}) as SerializableRaidOptions;
        const { config } = this.resolveConfig(record);
        await AgendaQueueService.schedule(config.durableRetry.jobName, config.durableRetry.schedule, { oid, options, attemptCount });
      }
    }

    public getContributors(record: RecordLike, options: RaidOptions, fieldConfig?: Record<string, unknown>, mappedData?: Record<string, unknown>) {
      const config = legacyConfigToPublishing(sails.config.raid as AnyRecord);
      return buildContributors(record, fieldConfig as unknown as RaidMappingField, mappedData ?? {}, config);
    }

    public buildContribVal(contributors: Record<string, Record<string, unknown>>, contribVal: Record<string, unknown>, contribConfig: Record<string, unknown>, startDate: string, endDate?: string) {
      const fakeRecord = { metadata: { contributor: contribVal } } as unknown as RecordLike;
      const config = legacyConfigToPublishing(sails.config.raid as AnyRecord);
      const built = buildContributors(fakeRecord, { dest: 'contributor', engine: 'jsonata', expression: '$contributors()', contributorMap: { contributor: contribConfig as any } }, { date: { startDate, endDate } }, config);
      for (const item of built) contributors[item.id] = item;
    }

    public getSubject(record: RecordLike, _options: RaidOptions, _fieldConfig: Record<string, unknown> = {}, subjects: Array<Record<string, unknown>> = [], subjectType = '', subjectData?: Array<Record<string, unknown>>) {
      const config = legacyConfigToPublishing(sails.config.raid as AnyRecord);
      subjects.push(...buildSubjects(subjectData, subjectType, config)); return subjects;
    }
  }
}

declare global { let RaidService: Services.Raid; }
