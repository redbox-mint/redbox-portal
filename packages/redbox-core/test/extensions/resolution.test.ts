import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { resolveExtensions, type ExtensionProvider, type RedboxExtension } from '../../src/extensions';

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
  for (const [first, second] of [
    ['/items/*first', '/ITEMS/*second/'],
    ['/items/{*first}', '/items/{*second}'],
    ['/items/:"first-name"', '/items/:"second-name"'],
    ['/items/:α', '/items/:β'],
    ['/items/:first', '/items/:"second"'],
  ])
    it(`rejects equivalent Express 5 paths ${first} and ${second} before constructing handlers`, () => {
      const route = { name: 'first', method: 'get' as const, path: first, handler: 'read', access: 'public' as const };
      assert.throws(
        () =>
          resolveExtensions([
            provider('core', {
              handlers: [
                {
                  name: 'read',
                  create: () => {
                    throw new Error('must stay offline');
                  },
                },
              ],
              routes: [route, { ...route, name: 'second', path: second, access: ['brandActor'] }],
            }),
          ]),
        /collision/
      );
    });

  it('requires explicit named route replacements, unique method/path and access declarations', () => {
    const handler = {
      name: 'read',
      create: () => (_req: Request, res: Response) => {
        res.end();
      },
    };
    const route = {
      name: 'list',
      method: 'get' as const,
      path: '/:brand/items',
      handler: 'read',
      access: 'public' as const,
    };
    const core = provider('core', { handlers: [handler], routes: [route] });
    for (const path of ['/:tenant/items', '/:tenant/ITEMS/'])
      assert.throws(
        () => resolveExtensions([core, provider('collision', { routes: [{ ...route, name: 'other', path }] })]),
        /collision/
      );
    assert.throws(
      () => resolveExtensions([provider('private', { handlers: [handler], routes: [{ ...route, access: [] }] })]),
      /explicit public/
    );
    const result = resolveExtensions([
      core,
      provider('hook', { routes: [{ ...route, replaces: true, access: ['isAdmin'] }] }),
    ]);
    assert.equal(result.routes.length, 1);
    assert.equal(result.routes[0].provider, 'hook');
    assert.throws(() => resolveExtensions([provider('missingHandler', { routes: [route] })]), /missing HTTP handler/);
  });
});
