import assert from 'node:assert/strict';
import { buildCatalogue } from '../../../src/record-graphql/catalogue';
import { queryPlan } from '../../../src/record-graphql/collection';
import { foldAsciiCase, gridPrefixIndexBindings } from '../../../src/record-graphql/index-bindings';
import type { GridEnvironment } from '../../../src/record-graphql/grid-types';
import { gridContracts, gridEnvironment, gridHarness } from '../../fixtures/record-grid.fixtures';

function enablePrefix(env = gridEnvironment()): GridEnvironment {
  env.config.recordGraphqlCaseInsensitivePrefixFields = { 'metadata:/title': 'grid_title_iprefix_v1' };
  const definition = {
    name: 'grid_title_iprefix_v1',
    type: 'string',
    indexed: true,
    stored: false,
    multiValued: false,
    docValues: false,
  };
  env.config.schema['add-field'] = [...env.config.schema['add-field'], definition];
  env.schema.fields = [...env.schema.fields, { ...definition }];
  return env;
}

describe('Record grid ASCII-case-insensitive literal prefix', () => {
  it('folds exactly ASCII capitals for every UTF-16 code unit without domain restrictions', () => {
    // Whole-string lowercasing does not preserve prefixes; the agreed fold does.
    assert.ok(!'ΟΣΑ'.toLowerCase().startsWith('ΟΣ'.toLowerCase()));
    for (let unit = 0; unit <= 0xffff; unit++) {
      const ch = String.fromCharCode(unit);
      const expected = unit >= 65 && unit <= 90 ? String.fromCharCode(unit + 32) : ch;
      assert.equal(foldAsciiCase(ch), expected);
      const left = `A${ch}`;
      const right = `${String.fromCharCode((unit * 31) & 0xffff)}Z`;
      assert.equal(foldAsciiCase(left + right), foldAsciiCase(left) + foldAsciiCase(right));
      assert.equal(Buffer.byteLength(foldAsciiCase(left + right)), Buffer.byteLength(left + right));
    }
    assert.equal(foldAsciiCase('\ud83d' + '\ude00'), foldAsciiCase('\ud83d') + foldAsciiCase('\ude00'));
    for (const text of ['UON-ΟΣΑ', 'École', 'İSTANBUL', 'ı-ß-ẞ-SS', 'E\u0301cole', 'ＡBc—\u00a0\t\n\0\x7f😀']) {
      for (let i = 1; i <= text.length; i++) {
        const prefix = text.slice(0, i);
        if (!prefix.isWellFormed()) continue;
        assert.ok(foldAsciiCase(text).startsWith(foldAsciiCase(prefix)));
        assert.equal(foldAsciiCase(prefix.replace(/[a-z]/g, ch => ch.toUpperCase())), foldAsciiCase(prefix));
      }
    }
  });

  it('adds only IPREFIX to the verified companion, keeping ordinary comparisons and sorts on the raw field', () => {
    const env = enablePrefix();
    const snapshot = buildCatalogue(gridContracts(), 'grid-fixture', [], env);
    assert.deepEqual(snapshot.catalogue.fields.find(f => f.id === 'metadata:/title')?.operators, [
      'EQ',
      'CONTAINS',
      'IN',
      'EXISTS',
      'IPREFIX',
    ]);
    assert.equal(snapshot.bindings.get('metadata:/title')?.name, 'grid_title');
    assert.equal(snapshot.prefixBindings.get('metadata:/title')?.name, 'grid_title_iprefix_v1');
    assert.ok(!snapshot.catalogue.fields.find(f => f.id === 'record:oid')?.operators.includes('IPREFIX'));
    const params = queryPlan(
      {
        recordType: 'grid-fixture',
        filters: [
          { field: 'metadata:/title', iprefix: 'UoN' },
          { field: 'metadata:/title', eq: { text: 'UoN' } },
        ],
        sort: [{ field: 'metadata:/title', direction: 'ASC' }],
      },
      snapshot,
      env,
      'brand'
    );
    assert.ok(params.getAll('fq').some(fq => fq.startsWith('{!field f=grid_title ')));
    assert.equal(params.get('sort'), 'grid_title asc,id asc');
  });

  const invalidBindings: Array<[string, (env: GridEnvironment) => void]> = [
    [
      'absent opt-in',
      env => {
        delete env.config.recordGraphqlCaseInsensitivePrefixFields;
      },
    ],
    [
      'absent primary copy',
      env => {
        env.config.preIndex!.copy = [];
      },
    ],
    [
      'ambiguous primary copy',
      env => {
        env.config.preIndex!.copy!.push({ source: 'metadata.other', dest: 'grid_title' });
      },
    ],
    [
      'aliased primary binding',
      env => {
        env.config.recordGraphqlFields!['metadata:/other'] = 'grid_title';
      },
    ],
    [
      'raw destination alias',
      env => {
        env.config.recordGraphqlCaseInsensitivePrefixFields!['metadata:/title'] = 'grid_title';
      },
    ],
    [
      'shared companion',
      env => {
        env.config.recordGraphqlCaseInsensitivePrefixFields!['metadata:/amount'] = 'grid_title_iprefix_v1';
      },
    ],
    [
      'reserved companion',
      env => {
        env.config.recordGraphqlCaseInsensitivePrefixFields!['metadata:/title'] = 'redbox_grid_oid';
      },
    ],
    [
      'unsafe companion',
      env => {
        env.config.recordGraphqlCaseInsensitivePrefixFields!['metadata:/title'] = 'x} OR *:*';
      },
    ],
    [
      'unique-key alias',
      env => {
        env.schema.uniqueKey = 'grid_title_iprefix_v1';
        Object.assign(env.schema.fields.at(-1)!, { stored: true, docValues: true });
      },
    ],
    [
      'unconfigured explicit companion',
      env => {
        env.config.schema['add-field'] = env.config.schema['add-field'].slice(0, -1);
      },
    ],
    [
      'dynamic-only companion',
      env => {
        env.schema.fields = env.schema.fields.slice(0, -1);
      },
    ],
    [
      'unindexed companion',
      env => {
        env.schema.fields.at(-1)!.indexed = false;
      },
    ],
    [
      'multivalued companion',
      env => {
        env.schema.fields.at(-1)!.multiValued = true;
      },
    ],
    [
      'unverified cardinality',
      env => {
        delete env.schema.fields.at(-1)!.multiValued;
      },
    ],
    [
      'analyzed companion',
      env => {
        env.schema.fields.at(-1)!.type = 'text_general';
      },
    ],
    [
      'schema type mismatch',
      env => {
        env.schema.fields.at(-1)!.type = 'other_string';
        env.schema.fieldTypes.push({ name: 'other_string', class: 'solr.StrField' });
      },
    ],
    [
      'analyzed primary',
      env => {
        env.schema.fields.find(f => f.name === 'grid_title')!.type = 'text_general';
      },
    ],
    [
      'incoming exact copy',
      env => {
        env.schema.copyFields = [{ source: 'unrelated', dest: 'grid_title_iprefix_v1' }];
      },
    ],
    [
      'incoming suffix copy',
      env => {
        env.schema.copyFields = [{ source: 'unrelated', dest: '*_iprefix_v1' }];
      },
    ],
    [
      'incoming prefix copy',
      env => {
        env.schema.copyFields = [{ source: 'unrelated', dest: 'grid_title_*' }];
      },
    ],
    [
      'polluted primary',
      env => {
        env.schema.copyFields = [{ source: 'unrelated', dest: 'grid_title' }];
      },
    ],
  ];
  for (const [name, mutate] of invalidBindings) {
    it(`rejects IPREFIX for ${name}`, () => {
      const env = enablePrefix();
      mutate(env);
      const snapshot = buildCatalogue(gridContracts(), 'grid-fixture', [], env);
      assert.ok(!snapshot.catalogue.fields.find(f => f.id === 'metadata:/title')?.operators.includes('IPREFIX'));
      assert.equal(snapshot.prefixBindings.size, 0);
      assert.throws(
        () =>
          queryPlan(
            { recordType: 'grid-fixture', filters: [{ field: 'metadata:/title', iprefix: 'A' }] },
            snapshot,
            env,
            'brand'
          ),
        /not supported/
      );
    });
  }

  it('never exposes private, repeating, non-string or partial-variant fields through a companion', () => {
    for (const [id, source] of [
      ['metadata:/secret', 'metadata.secret'],
      ['metadata:/people', 'metadata.people'],
      ['metadata:/amount', 'metadata.amount'],
      ['metadata:/publication_note', 'metadata.publication_note'],
    ]) {
      const env = enablePrefix();
      env.config.recordGraphqlFields![id] = 'grid_other';
      env.config.preIndex!.copy!.push({ source, dest: 'grid_other' });
      env.schema.fields.push({ name: 'grid_other', type: 'string', indexed: true, stored: true, multiValued: false });
      env.config.recordGraphqlCaseInsensitivePrefixFields = { [id]: 'grid_title_iprefix_v1' };
      const snapshot = buildCatalogue(gridContracts(), 'grid-fixture', [], env);
      assert.ok(!snapshot.catalogue.fields.find(f => f.id === id)?.operators.includes('IPREFIX'));
    }
  });

  it('uses the prefix parser with an exact separate folded parameter, without escaping or generated wildcards', () => {
    const env = enablePrefix();
    const snapshot = buildCatalogue(gridContracts(), 'grid-fixture', [], env);
    for (const input of ['UON*?\\"[]:/ OR *:*', '{!prefix f=id}ABC', ' É—\u00a0\t\n\0\x7f😀']) {
      const params = queryPlan(
        { recordType: 'grid-fixture', filters: [{ field: 'metadata:/title', iprefix: input }] },
        snapshot,
        env,
        'brand'
      );
      const clause = params.getAll('fq').find(fq => fq.startsWith('{!prefix '));
      assert.equal(clause, '{!prefix f=grid_title_iprefix_v1 v=$rbGridValue5}');
      assert.equal(params.get('rbGridValue5'), foldAsciiCase(input));
      assert.equal(new URLSearchParams(params.toString()).get('rbGridValue5'), foldAsciiCase(input));
    }
  });

  it('accepts bounded Unicode/space/control prefixes and rejects only empty, malformed or oversized text before search', async () => {
    const h = gridHarness();
    enablePrefix(h.environment);
    const query =
      'query($p:String){records(recordType:"grid-fixture",filters:[{field:"metadata:/title",iprefix:$p}]){nodes{oid}}}';
    for (const p of ['', '\ud800', '\udfff', 'x\ud800y', 'a'.repeat(257), 'é'.repeat(129), '😀'.repeat(65), null]) {
      const response = await h.query(query, { p });
      assert.equal(response.body.errors?.[0].extensions.code, 'INVALID_FILTER_VALUE');
      assert.equal(response.body.data?.records, null);
    }
    assert.equal(h.calls.length, 0);
    for (const p of ['a'.repeat(256), 'é'.repeat(128), '😀'.repeat(64), ' ', '\t\n\0\x7f', 'ΟΣ', 'İ', 'ß', 'E\u0301']) {
      const response = await h.query(query, { p });
      assert.equal(response.body.errors, undefined, JSON.stringify(response.body));
    }
    assert.equal(h.calls.length, 9);
    assert.equal(gridPrefixIndexBindings(h.environment.config).size, 1);
  });
});
