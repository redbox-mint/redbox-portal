import { expect } from 'chai';
import { Effect, Layer } from 'effect';
import type { RaidPublishingConfigData } from '../../../src/configmodels/RaidPublishing';
import { RaidHttpError } from '../../../src/services/raid-v2/errors';
import { mintRaidProgram, runRaidProgram } from '../../../src/services/raid-v2/runtime';
import {
  RaidAuditTag,
  RaidConfigTag,
  RaidHttpClientTag,
  RaidMappingTag,
  RaidQueueTag,
  RaidRecordRepositoryTag,
  RaidRunContextTag,
} from '../../../src/services/raid-v2/tags';

const makeConfig = (): RaidPublishingConfigData => ({
  enabled: true,
  connection: {
    baseUrl: 'https://raid.test',
    token: 'token',
    timeoutMs: 1000,
    oauth: { url: '', clientId: '', username: '', password: '', timeoutMs: 1000, expirySkewMs: 0 },
    retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, jitter: false, retryOnStatusCodes: [503] },
  },
  durableRetry: { jobName: '', schedule: '', maxAttempts: 0 },
  saveBodyInMeta: true,
  raidFieldName: 'raidUrl',
  orcidBaseUrl: 'https://orcid.org/',
  types: {
    title: {},
    contributor: { position: {}, roles: { schemaUri: '', types: {} }, flags: {}, hiearchy: { position: [] } },
    subject: {},
  },
  mapping: { dmp: { title: { dest: 'title[0].text', engine: 'jsonata', expression: 'record.metadata.title' } } },
});

function makeLayer(overrides: {
  config?: RaidPublishingConfigData;
  getMeta?: (oid: string) => Effect.Effect<any, any>;
  appendToRecord?: (oid: string, value: unknown, path: string) => Effect.Effect<void, any>;
  map?: (record: any) => Effect.Effect<any, any>;
  getToken?: (refresh?: boolean) => Effect.Effect<string, any>;
  mint?: (request: any, token: string, attempt: number) => Effect.Effect<any, any>;
  schedule?: (data: any) => Effect.Effect<void, any>;
} = {}) {
  const config = overrides.config ?? makeConfig();
  const auditEvents: string[] = [];
  const layer = Layer.mergeAll(
    Layer.succeed(RaidConfigTag, config),
    Layer.succeed(RaidRunContextTag, {
      oid: 'record-1',
      brandId: 'brand-1',
      brandName: 'default',
      triggerSource: 'test',
      attemptCount: 0,
    }),
    Layer.succeed(RaidRecordRepositoryTag, {
      getMeta: overrides.getMeta ?? (() => Effect.succeed({ metadata: {} })),
      appendToRecord: overrides.appendToRecord ?? (() => Effect.void),
    }),
    Layer.succeed(RaidMappingTag, {
      map: (record: any) => overrides.map?.(record) ?? Effect.succeed({ title: [{ text: record.metadata?.title }] }),
    }),
    Layer.succeed(RaidHttpClientTag, {
      getToken: overrides.getToken ?? (() => Effect.succeed('access-token')),
      mint: overrides.mint ?? (() =>
        Effect.succeed({ statusCode: 201, body: { identifier: { id: 'raid-1' } }, identifier: { id: 'raid-1' } })),
    }),
    Layer.succeed(RaidQueueTag, {
      schedule: overrides.schedule ?? (() => Effect.void),
    }),
    Layer.succeed(RaidAuditTag, {
      start: (action: string) => {
        auditEvents.push(`start:${action}`);
        return Effect.succeed({ id: action, traceId: 'trace-1' } as any);
      },
      complete: (ctx: any) => {
        auditEvents.push(`complete:${ctx?.id}`);
        return Effect.void;
      },
      fail: (ctx: any) => {
        auditEvents.push(`fail:${ctx?.id}`);
        return Effect.void;
      },
    })
  );
  return { config, layer, auditEvents };
}

describe('RAiD Effect runtime', () => {
  it('maps, mints, persists, and audits a RAiD', async () => {
    const appended: any[] = [];
    const { config, layer, auditEvents } = makeLayer({
      appendToRecord: (oid, value, path) => {
        appended.push({ oid, value, path });
        return Effect.void;
      },
    });
    const record: any = {
      metadata: { title: 'Plan', relatedOid: 'related-1' },
      metaMetadata: { raid: { attemptCount: 2, attemptResponse: { old: true } } },
    };
    const program = mintRaidProgram({
      record,
      options: {
        request: {
          mappingProfile: 'dmp',
          alsoSaveRaidToOid: [{ oidPath: 'metadata.relatedOid', raidPath: 'metadata.raid' }],
        },
      },
      config,
      context: {} as any,
    }).pipe(Effect.provide(layer));

    const result: any = await runRaidProgram(program);

    expect(result.metadata.raidUrl).to.equal('raid-1');
    expect(result.metaMetadata.raid.response).to.deep.equal({ identifier: { id: 'raid-1' } });
    expect(result.metaMetadata.raid).not.to.have.property('attemptCount');
    expect(result.metaMetadata.raid).not.to.have.property('attemptResponse');
    expect(appended).to.deep.equal([{ oid: 'related-1', value: 'raid-1', path: 'metadata.raid' }]);
    expect(auditEvents).to.include.members([
      'start:mintRaid',
      'start:resolveRaidConfiguration',
      'start:mapRaidRequest',
      'start:acquireRaidToken',
      'start:mintRaidRequest',
      'start:persistRaid',
      'complete:mintRaid',
    ]);
  });

  it('loads a source record, applies overrides, and refreshes a rejected token', async () => {
    const tokens: string[] = [];
    let mappedRecord: any;
    const { config, layer } = makeLayer({
      getMeta: oid => Effect.succeed({ metadata: { title: `Source ${oid}`, owner: 'old' } }),
      map: record => {
        mappedRecord = record;
        return Effect.succeed({ title: [{ text: record.metadata.title }] });
      },
      getToken: refresh => Effect.succeed(refresh ? 'fresh-token' : 'stale-token'),
      mint: (_request, token) => {
        tokens.push(token);
        return token === 'stale-token'
          ? Effect.fail(
              new RaidHttpError({
                message: 'expired',
                statusCode: 401,
                method: 'POST',
                path: '/raid',
                retryable: false,
              })
            )
          : Effect.succeed({ statusCode: 201, body: { identifier: { id: 'raid-2' } }, identifier: { id: 'raid-2' } });
      },
    });
    const record: any = { metadata: { sourceOid: 'source-1', newOwner: 'new' } };
    const result: any = await runRaidProgram(
      mintRaidProgram({
        record,
        options: {
          request: {
            sourceOidField: 'metadata.sourceOid',
            recordOverrides: [{ field: 'metadata.owner', value: 'metadata.newOwner' }],
          },
        },
        config,
        context: {} as any,
      }).pipe(Effect.provide(layer))
    );

    expect(mappedRecord.metadata.owner).to.equal('new');
    expect(tokens).to.deep.equal(['stale-token', 'fresh-token']);
    expect(result.metadata.raidUrl).to.equal('raid-2');
  });

  it('stores retry state and schedules retryable failures', async () => {
    const config = makeConfig();
    config.durableRetry = { jobName: 'mint-raid', schedule: 'in 1 minute', maxAttempts: 2 };
    const scheduled: any[] = [];
    const failure = new RaidHttpError({
      message: 'unavailable',
      statusCode: 503,
      method: 'POST',
      path: '/raid',
      retryable: true,
    });
    const { layer } = makeLayer({
      config,
      mint: () => Effect.fail(failure),
      schedule: data => {
        scheduled.push(data);
        return Effect.void;
      },
    });
    const signal = new AbortController().signal;
    const record: any = { metadata: {}, metaMetadata: {} };
    const result: any = await runRaidProgram(
      mintRaidProgram({
        record,
        options: { signal, request: { mappingProfile: 'dmp' } },
        config,
        context: {} as any,
      }).pipe(Effect.provide(layer))
    );

    expect(result.metaMetadata.raid.attemptCount).to.equal(1);
    expect(result.metaMetadata.raid.options).not.to.have.property('signal');
    expect(result.metaMetadata.raid.attemptResponse).to.include({ statusCode: 503, message: 'unavailable' });
    expect(scheduled[0]).to.deep.include({ oid: 'record-1', attemptCount: 1, traceId: 'trace-1' });
  });

  it('fails for missing source oids and unconfigured profiles', async () => {
    const first = makeLayer();
    const missingSource = await Effect.runPromiseExit(
      mintRaidProgram({
        record: { metadata: {} },
        options: { request: { sourceOidField: 'metadata.sourceOid' } },
        config: first.config,
        context: {} as any,
      }).pipe(Effect.provide(first.layer))
    );
    expect(missingSource._tag).to.equal('Failure');

    const config = makeConfig();
    config.mapping = {};
    const second = makeLayer({ config });
    const missingMapping = await Effect.runPromiseExit(
      mintRaidProgram({
        record: { metadata: {} },
        options: { request: { mappingProfile: 'unknown' } },
        config,
        context: {} as any,
      }).pipe(Effect.provide(second.layer))
    );
    expect(missingMapping._tag).to.equal('Failure');
    expect(second.auditEvents).to.include('fail:mintRaid');
  });

  it('unwraps typed failures from runRaidProgram', async () => {
    const failure = new Error('typed failure');
    let caught: unknown;
    try {
      await runRaidProgram(Effect.fail(failure));
    } catch (error) {
      caught = error;
    }
    expect(caught).to.equal(failure);
    expect(await runRaidProgram(Effect.succeed('ok'))).to.equal('ok');
  });
});
