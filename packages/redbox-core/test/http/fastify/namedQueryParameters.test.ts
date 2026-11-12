import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { assertNamedQueryParameterSafe, NamedQueryParameterError } from '../../../src/queries/namedQueryParameters';
import { RetainedNamedQueryParameters } from '../../helpers/retainedNamedQueryParameters';

describe('FM-024 narrow named-query injection guard', () => {
  const types = ['string', 'number', 'date', 'boolean', 'array', 'object', undefined];
  for (const type of types) {
    for (const value of [
      { $ne: 'x' },
      { $regex: '.*' },
      { 'a.b': 1 },
      { safe: { $ne: 1 } },
      [{ $ne: 1 }],
      [['x', { 'a.b': 1 }]],
    ])
      it(`rejects executable ${type} input ${JSON.stringify(value)} with safe 400`, () => {
        assert.throws(
          () => assertNamedQueryParameterSafe('value', { type }, value),
          (error: unknown) =>
            error instanceof NamedQueryParameterError && error.status === 400 && !error.message.includes('$')
        );
      });
    for (const value of [undefined, null, '', '0', false, 0, 'NaN', 'invalid', ['a', 'b']])
      it(`does not convert or validate ${type} ${JSON.stringify(value)}`, () => {
        assert.equal(assertNamedQueryParameterSafe('value', { type }, value), undefined);
      });
    if (type !== 'array' && type !== 'object')
      for (const value of [{ literal: 'x' }, [{ literal: 'x' }]])
        it(`rejects object-shaped scalar ${type} ${JSON.stringify(value)}`, () => {
          assert.throws(() => assertNamedQueryParameterSafe('value', { type }, value), NamedQueryParameterError);
        });
  }
  for (const type of ['array', 'object'])
    it(`permits configured ${type} data without changing it`, () => {
      const value = { label: 'literal', nested: [null, { value: 'x' }] },
        before = JSON.stringify(value);
      assertNamedQueryParameterSafe('value', { type, queryType: '$eq' }, value);
      assert.equal(JSON.stringify(value), before);
    });

  for (const queryType of ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '>', '>=', '<', '<=', '!=', 'in', 'nin']) {
    for (const type of ['object', 'array'])
      for (const value of [{ $schema: 'https://example.org/schema' }, { 'schema.org': 'Dataset' }, [{ kind: 'literal', $schema: 'schema', nested: { 'schema.org': 'Dataset' } }]])
        it(`preserves literal ${type} operands under ${queryType}: ${JSON.stringify(value)}`, () => {
          const before = JSON.stringify(value);
          assertNamedQueryParameterSafe('value', { type, queryType }, value);
          assert.equal(JSON.stringify(value), before);
        });
    for (const type of ['string', 'number', 'date', 'boolean', undefined])
      for (const value of [{ ordinary: 'data' }, [{ $schema: 'schema' }]])
        it(`still rejects scalar ${type} objects under ${queryType}: ${JSON.stringify(value)}`, () => {
          assert.throws(() => assertNamedQueryParameterSafe('value', { type, queryType }, value), NamedQueryParameterError);
        });
  }
  for (const queryType of [undefined, '', '$elemMatch', '$not', '$expr', '$where', '$all', '$regex', '$exists', 'contains', 'startsWith', 'endsWith', '$unknown'])
    for (const type of ['object', 'array'])
      for (const value of [{ ordinary: 'data' }, { $schema: 'schema' }, [{ 'schema.org': 'Dataset' }]])
        it(`refuses interpreted ${type} data under ${queryType}: ${JSON.stringify(value)}`, () => {
          assert.throws(() => assertNamedQueryParameterSafe('value', { type, queryType }, value), NamedQueryParameterError);
        });

  for (const type of ['array', 'object'])
    it(`rejects deeply nested ${type} operators without a recursion failure`, () => {
      let value: unknown = { $ne: 'x' };
      for (let depth = 0; depth < 5000; depth++) value = [value];
      assert.throws(
        () => assertNamedQueryParameterSafe('value', { type }, value),
        (error: unknown) => error instanceof NamedQueryParameterError && error.status === 400
      );
    });

  it('pins the retained fixture to e0a41f5d9 and restores production pipeline verbatim between safety checks', () => {
    const root = path.resolve(__dirname, '../../../../..');
    const original = execFileSync('git', ['show', 'e0a41f5d9:packages/redbox-core/src/queries/NamedQueries.ts'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 10000,
    });
    const method = (source: string) =>
      source.slice(source.indexOf('    setParamsInQuery('), source.indexOf('    runTemplate('));
    const retained = readFileSync(
      path.join(root, 'packages/redbox-core/test/helpers/retainedNamedQueryParameters.ts'),
      'utf8'
    );
    assert.equal(method(retained), method(original));
    const current = readFileSync(path.join(root, 'packages/redbox-core/src/queries/NamedQueries.ts'), 'utf8');
    const stripped = method(current)
      .replace(
        '      // Inspect raw client values without changing the retained conversion pipeline.\n      for (const [name, definition] of Object.entries(queryParams))\n        assertNamedQueryParameterSafe(name, definition, paramMap[name]);\n',
        ''
      )
      .replace(
        '        // Also inspect decoded/template operands before trusted query operators wrap them.\n        if (paramMap[queryParamKey] !== undefined || !_.isEmpty(queryParam.template))\n          assertNamedQueryParameterSafe(queryParamKey, queryParam, value);\n\n',
        ''
      );
    assert.equal(stripped, method(original));
    for (const start of ['const parseSerializedValue =', 'const parseObjectParamValue =']) {
      const body = (source: string) => {
        const from = source.indexOf(start);
        return source.slice(from, source.indexOf('\n};', from) + 3);
      };
      assert.equal(body(retained), body(original));
      assert.equal(body(current), body(original));
    }
    for (const start of [
      '    private getMongoQueryValue(',
      '    private setMongoQueryValue(',
      '    private unsetMongoQueryValue(',
      '    runTemplate(',
    ]) {
      const body = (source: string) => {
        const from = source.indexOf(start);
        return source.slice(from, source.indexOf('\n    }', from) + 6);
      };
      assert.equal(body(retained), body(original));
      assert.equal(body(current), body(original));
    }
    assert(RetainedNamedQueryParameters.prototype.setParamsInQuery);
  });
});
