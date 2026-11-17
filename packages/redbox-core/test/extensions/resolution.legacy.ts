// Explicit retained Express adapter cases, removed with FM-043.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express, { type Request, type Response } from 'express';
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

  it('matches repeated trailing slashes like the actual Express router', async () => {
    const router = express();
    router.get('/items/:item//', (_req, res) => res.send('matched'));
    const server = createServer(router);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert(address && typeof address !== 'string');
      for (const requestPath of ['/items/example', '/items/example/']) {
        const url: string = `http://127.0.0.1:${address.port}${requestPath}`;
        const response: Awaited<ReturnType<typeof fetch>> = await fetch(url);
        assert.equal(response.status, 200);
        assert.equal(await response.text(), 'matched');
        assert.equal((await fetch(url, { method: 'HEAD' })).status, 200);
      }
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
    }
  });
  for (const [first, second] of [
    ['/items/*first', '/ITEMS/*second/'],
    ['/items/{*first}', '/items/{*second}'],
    ['/items/:"first-name"', '/items/:"second-name"'],
    ['/items/:α', '/items/:β'],
    ['/items/:first', '/items/:"second"'],
    ['/items/:first', '/ITEMS/:second//'],
    ['//', '///'],
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
