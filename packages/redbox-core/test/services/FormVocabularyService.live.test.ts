import assert from 'node:assert/strict';
import axios from 'axios';
import { vocab } from '../../src/config/vocab.config';
import { Services } from '../../src/services/FormVocabularyService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

// Opt in with VOCAB_SOLR_TEST_URL pointing to a fresh disposable Solr 10 core,
// e.g. http://127.0.0.1:18986/solr/vocab_literal from `solr-precreate vocab_literal`.
// This suite adds its schema and index fixtures; remove the container afterwards.
const liveDescribe = process.env.VOCAB_SOLR_TEST_URL ? describe : describe.skip;
type Provider = 'geonames' | 'geonamesCountries';
type Operator = 'AND' | 'OR';
type SolrResult = {
  debug: { parsedquery: string };
  response: { docs: Array<{ id: string }> };
  responseHeader: { params: Record<string, string> };
};

liveDescribe('FormVocabularyService real Solr literal autocomplete', function () {
  this.timeout(15000);
  let coreUrl: string;
  let service: Services.FormVocabulary;

  before(async function () {
    const endpoint = new URL(process.env.VOCAB_SOLR_TEST_URL!);
    assert.equal(endpoint.hostname, '127.0.0.1', 'Use a disposable loopback fixture core');
    coreUrl = endpoint.href.replace(/\/$/, '');
    await axios.post(`${coreUrl}/schema`, {
      'add-field-type': {
        name: 'vocab_literal_text',
        class: 'solr.TextField',
        analyzer: {
          tokenizer: { class: 'solr.StandardTokenizerFactory' },
          filters: [{ class: 'solr.LowerCaseFilterFactory' }],
        },
      },
      'add-field': [
        { name: 'basic_name', type: 'vocab_literal_text', stored: true, indexed: true },
        { name: 'keyword_name', type: 'string', stored: true, indexed: true },
        { name: 'feature_class', type: 'string', stored: true, indexed: true },
        { name: 'feature_code', type: 'string', stored: true, indexed: true },
        { name: 'population', type: 'pint', stored: true, indexed: true },
      ],
    });
    const fixtures = [
      ['new-york', 'New York', 'neutral'],
      ['new-yorkshire', 'New Yorkshire', 'neutral'],
      ['wrong-field', 'Elsewhere', 'New Yorkshire'],
      ['a-only', 'a', 'neutral'],
      ['a-b', 'a b', 'neutral'],
      ['a-or-b', 'a OR b', 'neutral'],
      ['a-and-b', 'a AND b', 'neutral'],
      ['a-not-b', 'a NOT b', 'neutral'],
      ['regex-target', 'foo', 'neutral'],
      ['slash', '/foo/', 'neutral'],
      ['slash-open', '/foo', 'neutral'],
      ['backslash-slash', String.raw`\/foo/`, 'neutral'],
      ['double-backslash-slash', String.raw`\\/foo/`, 'neutral'],
      ['backslash-not', String.raw`\NOT`, 'neutral'],
      ['double-backslash-not', String.raw`\\NOT`, 'neutral'],
      ['bare-not', 'NOT', 'neutral'],
      ['backslash-star', String.raw`\*`, 'neutral'],
      ['star', 'a*b', 'neutral'],
      ['star-prefix', 'a*bcd', 'neutral'],
      ['star-decoy', 'axxb', 'neutral'],
      ['question', 'a?b', 'neutral'],
      ['question-decoy', 'acb', 'neutral'],
      ['unrelated', 'Nowhere', 'neutral'],
      ['unicode', 'São Paulo', 'neutral'],
    ].map(([id, name, text]) => ({
      id,
      basic_name: name,
      keyword_name: name,
      _text_: [text],
      feature_class: 'A',
      feature_code: 'COUNTRY',
      population: 100,
    }));
    await axios.post(`${coreUrl}/update`, fixtures, { params: { commit: true } });
  });

  beforeEach(function () {
    setupServiceTestGlobals(createMockSails({ config: { vocab: structuredClone(vocab) } }));
    service = new Services.FormVocabulary();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
  });

  async function search(
    provider: Provider,
    input: string,
    operator?: Operator,
    field = 'basic_name'
  ): Promise<SolrResult> {
    const endpoint = structuredClone(vocab.external[provider]);
    endpoint.url = endpoint.url
      .replace(/^[^?]+/, `${coreUrl}/select`)
      .replace('rows=7', 'rows=100')
      .replace('basic_name', field);
    endpoint.options = { debugQuery: true, df: '_text_', fl: 'id', ...(operator ? { 'q.op': operator } : {}) };
    sails.config.vocab.external[provider] = endpoint;
    return (await service.findInExternalService(provider, { options: { query: input } })) as SolrResult;
  }

  function ids(result: SolrResult): string[] {
    return result.response.docs.map(doc => doc.id).sort();
  }

  for (const provider of ['geonames', 'geonamesCountries'] as const) {
    it(`${provider} preserves the configured parser and its default query operator`, async function () {
      const result = await search(provider, 'New Yo');
      assert.equal(result.responseHeader.params.defType, provider === 'geonames' ? 'edismax' : undefined);
      assert.equal(result.responseHeader.params['q.op'], undefined);
      assert.deepEqual(ids(result), ['new-york', 'new-yorkshire']);
    });

    for (const operator of ['AND', 'OR'] as const) {
      it(`${provider} keeps tokenized name terms in their field with q.op=${operator}`, async function () {
        for (const input of ['New Yo', ' New York ', 'New York\t', 'São Pau']) {
          const result = await search(provider, input, operator);
          assert.doesNotMatch(result.debug.parsedquery, /RegexpQuery|MatchAllDocsQuery|_text_:/);
          assert.deepEqual(ids(result), input.includes('São') ? ['unicode'] : ['new-york', 'new-yorkshire']);
        }
      });

      it(`${provider} keeps slashes and Boolean words literal with q.op=${operator}`, async function () {
        for (const input of [
          '/foo/',
          '/foo',
          '/.*/',
          'a AND b',
          'a OR b',
          'a NOT b',
          String.raw`\NOT /foo/`,
          String.raw`\) OR *:*`,
        ]) {
          const result = await search(provider, input, operator);
          assert.doesNotMatch(result.debug.parsedquery, /RegexpQuery|MatchAllDocsQuery|_text_:/);
          assert.equal(ids(result).includes('unrelated'), false);
          const word = input.match(/^a (AND|OR|NOT) b$/)?.[1];
          if (word) {
            assert.ok(result.debug.parsedquery.includes(`basic_name:${word.toLowerCase()}`));
            if (operator === 'AND') assert.deepEqual(ids(result), [`a-${word.toLowerCase()}-b`]);
          }
        }
      });

      it(`${provider} retains the configured prefix wildcard and literal user wildcards with q.op=${operator}`, async function () {
        for (const [input, expected] of [
          ['/foo/', ['slash']],
          ['/foo', ['slash', 'slash-open']],
          ['a*b', ['star', 'star-prefix']],
          ['a?b', ['question']],
          ['*', []],
          [String.raw`\/foo/`, ['backslash-slash']],
          [String.raw`\\/foo/`, ['double-backslash-slash']],
          [String.raw`\NOT`, ['backslash-not']],
          [String.raw`\\NOT`, ['double-backslash-not']],
          [String.raw`\*`, ['backslash-star']],
        ] as const) {
          const result = await search(provider, input, operator, 'keyword_name');
          assert.doesNotMatch(result.debug.parsedquery, /RegexpQuery|MatchAllDocsQuery|_text_:/);
          assert.deepEqual(ids(result), expected);
        }
      });
    }
  }
});
