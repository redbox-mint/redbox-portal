import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { resolveExtensions, type ExtensionProvider } from '../../src/extensions/resolution';
import { type RedboxExtension } from '../../src/extensions/legacyContract';

const makeModule = (name: string, requires?: string[]) => ({
  name,
  requires,
  create: () => ({ initialize: async () => {}, close: async () => {} }),
});
const provider = (name: string, declaration: Partial<RedboxExtension> = {}): ExtensionProvider => ({
  name,
  root: '/installed/' + name,
  declaration: { apiVersion: 1, ...declaration },
});

describe('v6 extension declarations', () => {
  it('preserves listed priority and descending-name lookup with low-to-high contributions', () => {
    const result = resolveExtensions(
      [
        provider('core'),
        provider('a', { views: ['views'], assets: ['assets'] }),
        provider('z', { views: ['views'] }),
        provider('low'),
        provider('high'),
      ],
      ['high', 'low']
    );
    assert.deepEqual(
      result.providers.map(item => item.name),
      ['core', 'a', 'z', 'low', 'high']
    );
    assert.deepEqual(result.views, ['/installed/z/views', '/installed/a/views']);
    assert.deepEqual(result.assets, ['/installed/a/assets']);
  });
  it('resolves replacements and lexical migrations without constructing anything', () => {
    let calls = 0;
    const first = {
      ...makeModule('storage'),
      create: () => {
        calls++;
        throw new Error('discarded core factory');
      },
    };
    const result = resolveExtensions([
      provider('core', {
        modules: [first],
        migrations: [
          {
            name: 'zLater',
            run: async () => {
              calls++;
            },
          },
        ],
      }),
      provider('hook', {
        modules: [{ ...makeModule('storage'), replaces: true }, makeModule('recordTypes', ['storage'])],
        migrations: [
          {
            name: 'aFirst',
            run: async () => {
              calls++;
            },
          },
        ],
      }),
    ]);
    assert.deepEqual(
      result.modules.map(item => item.declaration.name),
      ['storage', 'recordTypes']
    );
    assert.equal(result.modules[0].provider, 'hook');
    assert.deepEqual(
      result.migrations.map(item => item.declaration.name),
      ['aFirst', 'zLater']
    );
    assert.equal(calls, 0);
  });
  it('rejects missing contracts, invalid fields, duplicate entries, invalid replacements and cycles', () => {
    const invalid: ExtensionProvider[] = [
      provider('version', { apiVersion: 2 } as unknown as RedboxExtension),
      provider('duplicate', { modules: [makeModule('same'), makeModule('same')] }),
      provider('missing', { modules: [makeModule('a', ['absent'])] }),
      provider('cycle', { modules: [makeModule('a', ['b']), makeModule('b', ['a'])] }),
      provider('replacement', { modules: [{ ...makeModule('a'), replaces: true }] }),
      provider('traversal', { views: ['../escape'] }),
      provider('configModel', { configModels: [{ name: 'pdfgen', definition: null! }] }),
    ];
    for (const value of invalid) assert.throws(() => resolveExtensions([value]), /Extension /);
    assert.throws(
      () =>
        resolveExtensions([
          provider('core', { modules: [makeModule('a')] }),
          provider('hook', { modules: [makeModule('a')] }),
        ]),
      /requires replaces/
    );
  });

});
