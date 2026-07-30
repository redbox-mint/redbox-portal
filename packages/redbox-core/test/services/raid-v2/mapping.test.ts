import { expect } from 'chai';
import { Effect, Layer } from 'effect';
import { makeMappingLayer } from '../../../src/services/raid-v2/mapping';
import { RaidConfigTag, RaidMappingTag, RaidRunContextTag } from '../../../src/services/raid-v2/tags';
import type { RaidPublishingConfigData } from '../../../src/configmodels/RaidPublishing';

const config: RaidPublishingConfigData = {
  enabled: true,
  connection: {
    baseUrl: 'https://raid.test', token: 'secret', timeoutMs: 1000,
    oauth: { url: '', clientId: '', username: '', password: '', timeoutMs: 1000, expirySkewMs: 0 },
    retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, jitter: false, retryOnStatusCodes: [503] }
  },
  durableRetry: { jobName: '', schedule: '', maxAttempts: 0 },
  saveBodyInMeta: true, raidFieldName: 'raidUrl', orcidBaseUrl: 'https://orcid.org/',
  types: {
    title: { Primary: { id: 'primary', schemaUri: 'title-schema' } },
    contributor: { position: {}, roles: { schemaUri: '', types: {} }, flags: {}, hiearchy: { position: [] } },
    subject: { for: { id: 'for/', schemaUri: 'for-schema' } }
  }, mapping: {}
};

const base = Layer.merge(
  Layer.succeed(RaidConfigTag, config),
  Layer.succeed(RaidRunContextTag, { oid: 'oid-1', brandId: 'brand-1', brandName: 'brand', triggerSource: 'test', attemptCount: 0 })
);
const layer = makeMappingLayer().pipe(Layer.provide(base));

describe('RAiD Effect mapping', () => {
  it('maps typed JSONata values and Handlebars text in declaration order', async () => {
    const program = Effect.gen(function* () {
      const mapper = yield* RaidMappingTag;
      return yield* mapper.map({ metadata: { title: 'A title' } }, {
        title: { dest: 'title[0].text', engine: 'jsonata', expression: 'record.metadata.title' },
        type: { dest: 'title[0].type', engine: 'jsonata', expression: 'types.title.Primary' },
        url: { dest: 'alternateUrl[0].url', engine: 'handlebars', template: 'https://example.test/{{runContext.oid}}' }
      }, {});
    }).pipe(Effect.provide(layer));
    const result = await Effect.runPromise(program);
    expect(result).to.deep.include({
      title: [{ text: 'A title', type: { id: 'primary', schemaUri: 'title-schema' } }],
      alternateUrl: [{ url: 'https://example.test/oid-1' }]
    });
  });

  it('rejects legacy lodash templates', async () => {
    const program = Effect.gen(function* () {
      const mapper = yield* RaidMappingTag;
      return yield* mapper.map({ metadata: {} }, {
        bad: { dest: 'title', engine: 'handlebars', template: '<%= record.metadata.title %>' }
      }, {});
    }).pipe(Effect.provide(layer));
    const exit = await Effect.runPromiseExit(program);
    expect(exit._tag).to.equal('Failure');
  });
});
