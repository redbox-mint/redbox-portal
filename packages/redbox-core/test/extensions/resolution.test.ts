import assert from 'node:assert/strict';

import { resolveExtensionData, type ExtensionDataProvider } from '../../src/extensions/resolution';
import { type ExtensionData } from '../../src/extensions/contract';

const makeModule = (name: string, requires?: string[]) => ({
  name,
  requires,
  create: () => ({ initialize: async () => {}, close: async () => {} }),
});
const provider = (name: string, declaration: Partial<ExtensionData> = {}): ExtensionDataProvider => ({
  name,
  root: '/installed/' + name,
  declaration: { ...declaration },
});

describe('v6 extension declarations', () => {
  it('preserves listed priority and descending-name lookup with low-to-high contributions', () => {
    const result = resolveExtensionData(
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
    const result = resolveExtensionData([
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
    const invalid: ExtensionDataProvider[] = [
      provider('version', { unknownField: true } as unknown as ExtensionData),
      provider('duplicate', { modules: [makeModule('same'), makeModule('same')] }),
      provider('missing', { modules: [makeModule('a', ['absent'])] }),
      provider('cycle', { modules: [makeModule('a', ['b']), makeModule('b', ['a'])] }),
      provider('replacement', { modules: [{ ...makeModule('a'), replaces: true }] }),
      provider('traversal', { views: ['../escape'] }),
      provider('configModel', { configModels: [{ name: 'pdfgen', definition: null! }] }),
    ];
    for (const value of invalid) assert.throws(() => resolveExtensionData([value]), /Extension /);
    assert.throws(
      () =>
        resolveExtensionData([
          provider('core', { modules: [makeModule('a')] }),
          provider('hook', { modules: [makeModule('a')] }),
        ]),
      /requires replaces/
    );
  });
});
