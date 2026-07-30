import axios from 'axios';
import { expect } from 'chai';
import { Effect, Layer } from 'effect';
import * as sinon from 'sinon';
import { RaidApi } from '@researchdatabox/raido-openapi-generated-node';
import { invalidateToken, makeHttpLayer } from '../../../src/services/raid-v2/http';
import { RaidConfigTag, RaidHttpClientTag, RaidRunContextTag } from '../../../src/services/raid-v2/tags';

function config(overrides: Record<string, unknown> = {}): any {
  return {
    enabled: true,
    connection: {
      baseUrl: 'https://raid.test',
      token: '',
      timeoutMs: 1000,
      oauth: {
        url: 'https://auth.test/token',
        clientId: 'client',
        username: 'user',
        password: 'password',
        timeoutMs: 1000,
        expirySkewMs: 0,
      },
      retry: {
        maxAttempts: 1,
        baseDelayMs: 1,
        maxDelayMs: 1,
        jitter: false,
        retryOnStatusCodes: [429, 503],
      },
      ...overrides,
    },
    durableRetry: { jobName: '', schedule: '', maxAttempts: 0 },
    saveBodyInMeta: false,
    raidFieldName: 'raidUrl',
    orcidBaseUrl: '',
    types: { title: {}, contributor: {}, subject: {} },
    mapping: {},
  };
}

function clientProgram(raidConfig: any) {
  const base = Layer.merge(
    Layer.succeed(RaidConfigTag, raidConfig),
    Layer.succeed(RaidRunContextTag, {
      oid: 'oid-1',
      brandId: 'brand-1',
      brandName: 'default',
      triggerSource: 'test',
      attemptCount: 0,
    })
  );
  const layer = makeHttpLayer().pipe(Layer.provide(base));
  return Effect.gen(function* () {
    return yield* RaidHttpClientTag;
  }).pipe(Effect.provide(layer));
}

describe('RAiD Effect HTTP client', () => {
  afterEach(() => sinon.restore());

  it('uses a configured bearer token without making an OAuth request', async () => {
    const post = sinon.stub(axios, 'post');
    const client = await Effect.runPromise(clientProgram(config({ token: 'static-token' })));

    expect(await Effect.runPromise(client.getToken())).to.equal('static-token');
    expect(post.called).to.equal(false);
  });

  it('rejects incomplete OAuth configuration', async () => {
    const client = await Effect.runPromise(
      clientProgram(config({ oauth: { url: '', clientId: '', username: '', password: '', timeoutMs: 10, expirySkewMs: 0 } }))
    );
    const exit = await Effect.runPromiseExit(client.getToken());

    expect(exit._tag).to.equal('Failure');
  });

  it('fetches, caches, and force-refreshes OAuth tokens', async () => {
    invalidateToken('brand-1:https://raid.test:user');
    const post = sinon
      .stub(axios, 'post')
      .onFirstCall()
      .resolves({ data: { access_token: 'first', expires_in: 3600 } })
      .onSecondCall()
      .resolves({ data: { access_token: 'second', expires_in: 3600 } });
    const client = await Effect.runPromise(clientProgram(config()));

    expect(await Effect.runPromise(client.getToken())).to.equal('first');
    expect(await Effect.runPromise(client.getToken())).to.equal('first');
    expect(post.calledOnce).to.equal(true);
    expect(await Effect.runPromise(client.getToken(true))).to.equal('second');
    expect(post.calledTwice).to.equal(true);
    expect(post.firstCall.args[1]).to.be.instanceOf(URLSearchParams);
  });

  it('maps OAuth and mint transport failures to typed errors', async () => {
    invalidateToken('brand-1:https://raid.test:user');
    sinon.stub(axios, 'post').rejects({ response: { status: 503 } });
    const client = await Effect.runPromise(clientProgram(config()));
    const tokenExit: any = await Effect.runPromiseExit(client.getToken());
    expect(tokenExit._tag).to.equal('Failure');

    sinon.restore();
    sinon.stub(RaidApi.prototype, 'mintRaid').rejects({
      response: { status: 503, data: { error: 'unavailable' } },
    });
    const mintExit: any = await Effect.runPromiseExit(client.mint({} as any, 'token', 1));
    expect(mintExit._tag).to.equal('Failure');
  });

  it('returns the generated client response from mint', async () => {
    sinon.stub(RaidApi.prototype, 'mintRaid').resolves({
      status: 201,
      data: { identifier: { id: 'raid-1' } },
    } as any);
    const client = await Effect.runPromise(clientProgram(config({ token: 'static-token' })));
    const result = await Effect.runPromise(client.mint({} as any, 'static-token', 1));

    expect(result).to.deep.equal({
      statusCode: 201,
      body: { identifier: { id: 'raid-1' } },
      identifier: { id: 'raid-1' },
    });
  });
});
