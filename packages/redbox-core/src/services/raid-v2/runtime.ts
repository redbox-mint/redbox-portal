/* oxlint-disable typescript/no-explicit-any */
import { Cause, Duration, Effect, Exit, Fiber, Ref, Schedule } from 'effect';
import type { RaidCreateRequest } from '@researchdatabox/raido-openapi-generated-node';
import { RaidHttpError, RaidPersistenceError, RaidQueueError, RaidSourceRecordError, RaidTimeoutError, isRetryable } from './errors';
import { RaidAuditTag, RaidConfigTag, RaidHttpClientTag, RaidMappingTag, RaidQueueTag, RaidRecordRepositoryTag, RaidRunContextTag } from './tags';
import type { RaidOptions, RaidRecord, RaidRuntimeInput, SerializableRaidOptions } from './types';

type AnyRecord = Record<string, any>;

function getPath(value: unknown, path: string): unknown {
  return path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean).reduce<unknown>((cur, key) => cur != null && typeof cur === 'object' ? (cur as AnyRecord)[key] : undefined, value);
}
function setPath(target: AnyRecord, path: string, value: unknown): void {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean); let cursor = target;
  parts.forEach((part, index) => { if (index === parts.length - 1) cursor[part] = value; else { cursor[part] ??= /^\d+$/.test(parts[index + 1] ?? '') ? [] : {}; cursor = cursor[part]; } });
}
function deletePath(target: AnyRecord, path: string): void {
  const parts = path.split('.'); const key = parts.pop(); const parent = getPath(target, parts.join('.')) as AnyRecord | undefined; if (parent && key) delete parent[key];
}
function serializableOptions(options: RaidOptions): SerializableRaidOptions { const { signal: _signal, ...rest } = options; return rest; }

function stage<A, E, R>(action: string, summary: Record<string, unknown>, effect: Effect.Effect<A, E, R>, parent: import('../IntegrationAuditService').IntegrationAuditContext | null) {
  return Effect.gen(function* () {
    const audit = yield* RaidAuditTag;
    const ctx = yield* audit.start(action, summary, parent);
    return yield* effect.pipe(
      Effect.tap(value => audit.complete(ctx, { responseSummary: typeof value === 'object' ? value as Record<string, unknown> : { value } })),
      Effect.tapError(error => audit.fail(ctx, error))
    );
  });
}

export const mintRaidProgram = (input: RaidRuntimeInput) => Effect.gen(function* () {
  const config = yield* RaidConfigTag;
  const context = yield* RaidRunContextTag;
  const records = yield* RaidRecordRepositoryTag;
  const mapper = yield* RaidMappingTag;
  const client = yield* RaidHttpClientTag;
  const audit = yield* RaidAuditTag;
  const queue = yield* RaidQueueTag;
  const parent = yield* audit.start('mintRaid', { brandId: context.brandId, mappingProfile: String(getPath(input.options, 'request.mappingProfile') ?? getPath(input.options, 'request.recordType') ?? 'dmp') });

  const result = yield* Effect.gen(function* () {
    yield* stage('resolveRaidConfiguration', { brandId: context.brandId, brandName: context.brandName, enabled: config.enabled }, Effect.void, parent);
    let sourceRecord: RaidRecord = structuredClone(input.record);
    const sourceField = String(getPath(input.options, 'request.sourceOidField') ?? '');
    if (sourceField) {
      const sourceOid = String(getPath(input.record, sourceField) ?? '');
      if (!sourceOid) return yield* Effect.fail(new RaidSourceRecordError({ message: `Source OID is missing at '${sourceField}'` }));
      sourceRecord = yield* stage('loadRaidSourceRecord', { sourceOid }, records.getMeta(sourceOid).pipe(
        Effect.map(record => structuredClone(record)),
        Effect.mapError(cause => new RaidSourceRecordError({ message: `Failed to load source record '${sourceOid}'`, cause }))
      ), parent);
      for (const override of (getPath(input.options, 'request.recordOverrides') as Array<{ field?: string; value?: string }> | undefined) ?? []) {
        if (override.field && override.value) setPath(sourceRecord as AnyRecord, override.field, getPath(input.record, override.value));
      }
    }

    const profile = String(getPath(input.options, 'request.mappingProfile') ?? getPath(input.options, 'request.recordType') ?? 'dmp');
    const inlineFields = getPath(input.options, 'request.mint.fields');
    const fields = typeof inlineFields === 'object' && inlineFields !== null ? inlineFields as Record<string, unknown> : config.mapping[profile];
    if (!fields) return yield* Effect.fail(new RaidSourceRecordError({ message: `RAiD mapping profile '${profile}' is not configured` }));
    const request = yield* stage('mapRaidRequest', { profile, fieldCount: Object.keys(fields).length }, mapper.map(sourceRecord, fields, input.options), parent);

    const token = yield* stage('acquireRaidToken', {}, client.getToken().pipe(
      Effect.timeoutFail({ duration: Duration.millis(config.connection.oauth.timeoutMs), onTimeout: () => new RaidTimeoutError({ message: 'RAiD token request timed out', operation: 'token', retryable: true }) })
    ), parent);

    const attempts = yield* Ref.make(0);
    let retrySchedule = Schedule.exponential(Duration.millis(config.connection.retry.baseDelayMs)).pipe(
      Schedule.intersect(Schedule.recurs(Math.max(0, config.connection.retry.maxAttempts - 1))),
      Schedule.whileInput(isRetryable),
      Schedule.modifyDelay((_output, duration) => Duration.min(duration, Duration.millis(config.connection.retry.maxDelayMs)))
    );
    if (config.connection.retry.jitter) retrySchedule = retrySchedule.pipe(Schedule.jittered) as typeof retrySchedule;
    const minted = yield* Effect.gen(function* () {
      const attempt = yield* Ref.updateAndGet(attempts, value => value + 1);
      const mintOnce = (accessToken: string) => client.mint(request as RaidCreateRequest, accessToken, attempt).pipe(
        Effect.timeoutFail({ duration: Duration.millis(config.connection.timeoutMs), onTimeout: () => new RaidTimeoutError({ message: 'RAiD mint request timed out', operation: 'mint', retryable: true }) })
      );
      return yield* stage('mintRaidRequest', { attempt, method: 'POST', path: '/raid' }, mintOnce(token).pipe(
        Effect.catchIf(error => error instanceof RaidHttpError && error.statusCode === 401, () => client.getToken(true).pipe(Effect.flatMap(mintOnce)))
      ), parent);
    }).pipe(
      Effect.tapError(error => Effect.logWarning('RAiD mint attempt failed').pipe(Effect.annotateLogs({ retryable: isRetryable(error) }))),
      Effect.retry(retrySchedule)
    );
    if (!minted.identifier?.id) return yield* Effect.fail(new RaidHttpError({ message: 'RAiD response did not contain an identifier', statusCode: minted.statusCode, responseBody: minted.body, method: 'POST', path: '/raid', retryable: false }));

    const identifier = minted.identifier.id;
    yield* stage('persistRaid', { identifier }, Effect.gen(function* () {
      setPath(input.record as AnyRecord, `metadata.${config.raidFieldName}`, identifier);
      if (config.saveBodyInMeta) setPath(input.record as AnyRecord, 'metaMetadata.raid.response', minted.body);
      deletePath(input.record as AnyRecord, 'metaMetadata.raid.attemptCount');
      deletePath(input.record as AnyRecord, 'metaMetadata.raid.attemptResponse');
      for (const associated of (getPath(input.options, 'request.alsoSaveRaidToOid') as Array<{ oidPath?: string; raidPath?: string }> | undefined) ?? []) {
        const targetOid = String(getPath(input.record, associated.oidPath ?? '') ?? '');
        if (targetOid) yield* records.appendToRecord(targetOid, identifier, associated.raidPath ?? '').pipe(Effect.mapError(cause => new RaidPersistenceError({ message: `RAiD minted but failed to persist it to associated record '${targetOid}'`, mintedIdentifier: identifier, cause })));
      }
    }), parent);
    return input.record;
  }).pipe(
    Effect.catchAll(error => Effect.gen(function* () {
      if (isRetryable(error) && config.durableRetry.jobName && context.attemptCount < config.durableRetry.maxAttempts) {
        const nextAttempt = context.attemptCount + 1;
        setPath(input.record as AnyRecord, 'metaMetadata.raid.attemptCount', nextAttempt);
        setPath(input.record as AnyRecord, 'metaMetadata.raid.options', serializableOptions(input.options));
        setPath(input.record as AnyRecord, 'metaMetadata.raid.attemptResponse', { statusCode: (error as AnyRecord).statusCode, message: (error as AnyRecord).message });
        yield* stage('scheduleRaidRetry', { attemptCount: nextAttempt }, queue.schedule({ oid: context.oid, options: serializableOptions(input.options), attemptCount: nextAttempt, traceId: parent?.traceId }).pipe(
          Effect.mapError(cause => new RaidQueueError({ message: 'Failed to schedule durable RAiD retry', cause }))
        ), parent);
        return input.record;
      }
      return yield* Effect.fail(error);
    }))
  ).pipe(Effect.onExit(exit => Exit.isFailure(exit)
    ? audit.fail(parent, Cause.squash(exit.cause), { message: Cause.isInterruptedOnly(exit.cause) ? 'RAiD orchestration interrupted' : undefined })
    : Effect.void));
  yield* audit.complete(parent, { responseSummary: { oid: context.oid, raid: getPath(result, `metadata.${config.raidFieldName}`) } });
  return result;
});

export async function runRaidProgram<A, E, R>(program: Effect.Effect<A, E, R>, signal?: AbortSignal): Promise<A> {
  const fiber = Effect.runFork(program as Effect.Effect<A, E, never>);
  const interrupt = () => Effect.runFork(Fiber.interrupt(fiber));
  if (signal?.aborted) interrupt(); else signal?.addEventListener('abort', interrupt, { once: true });
  try {
    const exit = await Effect.runPromise(Fiber.await(fiber));
    if (Exit.isSuccess(exit)) return exit.value;
    const failure = Cause.failureOption(exit.cause);
    if (failure._tag === 'Some') throw failure.value;
    throw Cause.squash(exit.cause);
  } finally { signal?.removeEventListener('abort', interrupt); }
}
