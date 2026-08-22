import { expect } from 'chai';
import { Effect, Layer } from 'effect';
import { makeMappingLayer } from '../../../src/services/raid-v2/mapping';
import { RaidConfigTag, RaidMappingTag, RaidRunContextTag } from '../../../src/services/raid-v2/tags';
import type { RaidPublishingConfigData } from '../../../src/configmodels/RaidPublishing';
import { raid } from '../../../src/config/raid.config';

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
        title: raid.mapping.dmp.title_text,
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

  it('evaluates shared and RAiD-local JSONata functions through the centralized helper', async () => {
    const program = Effect.gen(function* () {
      const mapper = yield* RaidMappingTag;
      return yield* mapper.map({ metadata: {} }, {
        formatted: {
          dest: 'date.startDate',
          engine: 'jsonata',
          expression: '$luxonFormatDate("2026-08-22", "yyyy-LL-dd")',
        },
        subjects: {
          dest: 'subject',
          engine: 'jsonata',
          expression: '$subjects([{"notation":"4601","label":"Applied computing"}], "for")',
        },
      }, {});
    }).pipe(Effect.provide(layer));

    expect(await Effect.runPromise(program)).to.deep.equal({
      date: { startDate: '2026-08-22' },
      subject: [{
        id: 'for/4601',
        schemaUri: 'for-schema',
        keyword: [{ text: 'Applied computing' }],
      }],
    });
  });

  it('ships no RAiD mapping expression that uses dynamic eval', function () {
    const expressions = Object.values(raid.mapping)
      .flatMap(fields => Object.values(fields))
      .map(field => field.expression)
      .filter((expression): expression is string => typeof expression === 'string');

    expect(expressions).not.to.be.empty;
    expect(expressions.filter(expression => /\$eval\s*\(/.test(expression))).to.deep.equal([]);
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
