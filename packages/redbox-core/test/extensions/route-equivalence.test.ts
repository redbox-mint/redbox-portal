import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import express from 'express';
import { pathToRegexp } from 'path-to-regexp';
import { canonicalHttpRoutePath, resolveExtensions } from '../../src/extensions/resolution';

// These are explicit observations, not an equivalence proof from a finite sample.
// 400 means a route matched but parameter decoding failed. Capture names/values
// and decoding behavior are outside the structural collision identity.
interface RouteCase {
  label: string;
  a: string;
  b: string;
  paths: string[];
  statuses: [number[], number[]];
  equivalent: boolean;
  collision?: boolean;
  structural?: boolean;
}
const cases: RouteCase[] = [
  {
    label: 'case and parameter names',
    a: '/items/:id',
    b: '/ITEMS/:other',
    paths: ['/items/a', '/ITEMS/a/'],
    statuses: [
      [200, 200],
      [200, 200],
    ],
    equivalent: true,
  },
  {
    label: 'all trailing declaration slashes are loosened',
    a: '/items/:id',
    b: '/items/:other///',
    paths: ['/items/a', '/items/a/', '/items/a//'],
    statuses: [
      [200, 200, 404],
      [200, 200, 404],
    ],
    equivalent: true,
  },
  {
    label: 'repeated interior slashes remain significant',
    a: '/items/:id',
    b: '/items//:other',
    paths: ['/items/a', '/items//a'],
    statuses: [
      [200, 404],
      [404, 200],
    ],
    equivalent: false,
  },
  {
    label: 'quoted and Unicode parameter names',
    a: '/items/:"first-name"',
    b: '/items/:α',
    paths: ['/items/a', '/items/a%2Fb'],
    statuses: [
      [200, 200],
      [200, 200],
    ],
    equivalent: true,
  },
  {
    label: 'literal encodings are not decoded',
    a: '/items/a',
    b: '/items/%61',
    paths: ['/items/a', '/items/%61'],
    statuses: [
      [200, 404],
      [404, 200],
    ],
    equivalent: false,
  },
  {
    label: 'encoded literal spelling is case insensitive',
    a: '/items/%2f',
    b: '/ITEMS/%2F',
    paths: ['/items/%2f', '/items/%2F'],
    statuses: [
      [200, 200],
      [200, 200],
    ],
    equivalent: true,
  },
  {
    label: 'double encoding remains distinct',
    a: '/items/%2F',
    b: '/items/%252F',
    paths: ['/items/%2F', '/items/%252F'],
    statuses: [
      [200, 404],
      [404, 200],
    ],
    equivalent: false,
  },
  {
    label: 'parameters decode after matching',
    a: '/items/:id',
    b: '/items/:other',
    paths: ['/items/%61', '/items/a%2Fb', '/items/%ZZ', '/items/%E9'],
    statuses: [
      [200, 200, 400, 400],
      [200, 200, 400, 400],
    ],
    equivalent: true,
  },
  {
    label: 'literal percent and captured percent have different decoding',
    a: '/items/%ZZ',
    b: '/items/:id',
    paths: ['/items/%ZZ', '/items/%25ZZ', '/items/a'],
    statuses: [
      [200, 404, 404],
      [400, 200, 200],
    ],
    equivalent: false,
  },
  {
    label: 'escaped literal in an optional group',
    a: '/items/\\:id',
    b: '/items/{\\:id}',
    paths: ['/items/:id', '/items/'],
    statuses: [
      [200, 404],
      [200, 200],
    ],
    equivalent: false,
    collision: true,
  },
  {
    label: 'empty optional groups',
    a: '/items/:id',
    b: '/items{}/:other',
    paths: ['/items/a', '/items/a/'],
    statuses: [
      [200, 200],
      [200, 200],
    ],
    equivalent: true,
  },
  {
    label: 'optional aliases',
    a: '/items{/:id}',
    b: '/ITEMS{/:other}',
    paths: ['/items', '/items/', '/items/a', '/items/a/', '/items//'],
    statuses: [
      [200, 200, 200, 200, 404],
      [200, 200, 200, 200, 404],
    ],
    equivalent: true,
  },
  {
    label: 'redundant optional groups',
    a: '/items{/:id}',
    b: '/items{/:other{}}',
    paths: ['/items', '/items/a'],
    statuses: [
      [200, 200],
      [200, 200],
    ],
    equivalent: true,
  },
  {
    label: 'nested and reordered alternatives',
    a: '/items{/:id}{/:child}',
    b: '/items{/:other{/:nested}}',
    paths: ['/items', '/items/a', '/items/a/b'],
    statuses: [
      [200, 200, 200],
      [200, 200, 200],
    ],
    equivalent: true,
  },
  {
    label: 'a shared optional alternative is a collision',
    a: '/items/:id',
    b: '/items{/:other}',
    paths: ['/items', '/items/a'],
    statuses: [
      [404, 200],
      [200, 200],
    ],
    equivalent: false,
    collision: true,
  },
  {
    label: 'named wildcard aliases',
    a: '/files/*path',
    b: '/FILES/*"other-name"/',
    paths: ['/files/a', '/files/a/b', '/files/'],
    statuses: [
      [200, 200, 404],
      [200, 200, 404],
    ],
    equivalent: true,
  },
  {
    label: 'optional wildcard aliases',
    a: '/files/{*path}',
    b: '/FILES/{*other}',
    paths: ['/files/', '/files//', '/files/a/b'],
    statuses: [
      [200, 200, 200],
      [200, 200, 200],
    ],
    equivalent: true,
  },
  {
    label: 'redundant optional wildcard suffix',
    a: '/files/*path',
    b: '/files/*other{.:extension}',
    paths: ['/files/a', '/files/a.json', '/files/a/b', '/files//'],
    statuses: [
      [200, 200, 200, 200],
      [200, 200, 200, 200],
    ],
    equivalent: true,
  },
  {
    label: 'redundant optional wildcard prefix',
    a: '/files/*path',
    b: '/files/{:base.}*other',
    paths: ['/files/a', '/files/a.json', '/files/a/b', '/files//'],
    statuses: [
      [200, 200, 200, 200],
      [200, 200, 200, 200],
    ],
    equivalent: true,
  },
  {
    label: 'redundant optional parameter suffix',
    a: '/items/:id',
    b: '/items/:other{.:extension}',
    paths: ['/items/a', '/items/a.json', '/items/a/b'],
    statuses: [
      [200, 200, 404],
      [200, 200, 404],
    ],
    equivalent: true,
  },
  {
    label: 'absorbed alternatives remain collision candidates',
    a: '/items/:id.:ext',
    b: '/items/:other{.:extension}',
    paths: ['/items/a', '/items/a.json'],
    statuses: [
      [404, 200],
      [200, 200],
    ],
    equivalent: false,
    collision: true,
  },
  {
    label: 'required and optional wildcards differ',
    a: '/files/*path',
    b: '/files/{*other}',
    paths: ['/files/', '/files/a/b'],
    statuses: [
      [404, 200],
      [200, 200],
    ],
    equivalent: false,
    collision: true,
  },
  {
    label: 'wildcards and parameters intentionally overlap',
    a: '/files/:path',
    b: '/files/*other',
    paths: ['/files/a', '/files/a/b'],
    statuses: [
      [200, 404],
      [200, 200],
    ],
    equivalent: false,
  },
  {
    label: 'static and parameter routes intentionally overlap',
    a: '/items/value',
    b: '/items/:id',
    paths: ['/items/value', '/items/other'],
    statuses: [
      [200, 404],
      [200, 200],
    ],
    equivalent: false,
  },
  {
    label: 'required suffix and wildcard routes intentionally overlap',
    a: '/files/*path',
    b: '/files/*other.:ext',
    paths: ['/files/a', '/files/a.json', '/files/a/b.json'],
    statuses: [
      [200, 200, 200],
      [404, 200, 200],
    ],
    equivalent: false,
  },
  {
    label: 'optional slash permits an additional request slash',
    a: '/items',
    b: '/items{/}',
    paths: ['/items', '/items/', '/items//'],
    statuses: [
      [200, 200, 404],
      [200, 200, 200],
    ],
    equivalent: false,
    collision: true,
  },
  {
    label: 'root is preserved before declaration loosening',
    a: '/',
    b: '///',
    paths: ['/', '//', '///'],
    statuses: [
      [200, 200, 404],
      [200, 404, 404],
    ],
    equivalent: false,
  },
  {
    label: 'non-root slash-only declarations are loosened to empty',
    a: '//',
    b: '///',
    paths: ['/', '//', '///'],
    statuses: [
      [200, 404, 404],
      [200, 404, 404],
    ],
    equivalent: true,
  },
  {
    label: 'non-ASCII literals are not decoded from encoded HTTP paths',
    a: '/é',
    b: '/É',
    paths: ['/%C3%A9', '/%C3%89'],
    statuses: [
      [404, 404],
      [404, 404],
    ],
    equivalent: true,
  },
  {
    label: 'Kelvin does not fold into ASCII',
    a: '/k',
    b: '/K',
    paths: ['/k', '/K', '/%E2%84%AA'],
    statuses: [
      [200, 200, 404],
      [404, 404, 404],
    ],
    equivalent: false,
  },
  {
    label: 'complex equivalent tails retain their structural distinction',
    a: '/items/:a-:b',
    b: '/items/:a-:b{-:c}',
    paths: ['/items/a', '/items/a-b', '/items/a--', '/items/a-b-c', '/items/a-b-c-d'],
    statuses: [
      [404, 200, 200, 200, 200],
      [404, 200, 200, 200, 200],
    ],
    equivalent: true,
    structural: false,
  },
];

function resolve(a: string, b: string, owned: boolean, replaces = false) {
  const route = { name: 'first', method: 'get' as const, path: a, handler: 'read', access: 'public' as const };
  return resolveExtensions(
    [
      {
        name: 'test',
        root: '/installed/test',
        declaration: {
          apiVersion: 1,
          handlers: [
            {
              name: 'read',
              create: () => {
                throw Error('must stay offline');
              },
            },
          ],
          routes: [
            ...(owned ? [] : [route]),
            {
              ...route,
              name: replaces ? 'core' : 'second',
              path: b,
              access: ['isAdmin'],
              ...(replaces ? { replaces: true as const } : {}),
            },
          ],
        },
      },
    ],
    [],
    owned ? [{ name: 'core', method: 'get', path: a }] : []
  );
}

async function observe(app: ReturnType<typeof express>, paths: string[]): Promise<number[]> {
  // Avoid Express logging expected URI decoding failures from negative controls.
  app.use((error: { status?: number }, _req: unknown, res: express.Response, _next: unknown) =>
    res.status(error.status ?? 500).end()
  );
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert(address && typeof address !== 'string');
    const statuses: number[] = [];
    for (const path of paths) {
      // Raw Node request paths preserve repeated slashes and percent escapes.
      statuses.push(
        await new Promise<number>((resolve, reject) => {
          request({ host: '127.0.0.1', port: address.port, path }, res => {
            res.resume();
            res.on('end', () => resolve(res.statusCode!));
          })
            .on('error', reject)
            .end();
        })
      );
    }
    return statuses;
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
}

describe('Express 5 route collision structure and native HTTP behavior', () => {
  for (const row of cases) {
    it(row.label, async () => {
      const app = express();
      for (const [i, path] of [row.a, row.b].entries()) {
        const router = express.Router();
        assert.equal(Reflect.get(router, 'caseSensitive'), undefined);
        assert.equal(Reflect.get(router, 'strict'), undefined);
        router.get(path, (_req, res) => res.end('matched'));
        app.use('/' + i, router);
      }
      const paths = ['/0', '/1'].flatMap(prefix => row.paths.map(path => prefix + path));
      assert.deepEqual(await observe(app, paths), row.statuses.flat());
      for (const owned of [false, true]) {
        if (row.equivalent || row.collision) assert.throws(() => resolve(row.a, row.b, owned), /collision/);
        else assert.doesNotThrow(() => resolve(row.a, row.b, owned));
      }
      const structural = row.structural ?? row.equivalent;
      assert.equal(canonicalHttpRoutePath(row.a) === canonicalHttpRoutePath(row.b), structural);
      if (structural) {
        const result = resolve(row.a, row.b, true, true);
        assert.equal(result.routes[0].declaration.name, 'core');
        assert.deepEqual(result.routes[0].declaration.access, ['isAdmin']);
      } else {
        assert.throws(() => resolve(row.a, row.b, true, true), /replacement must retain/);
      }
    });
  }

  for (const [caseSensitive, strict, statuses] of [
    [false, false, [200, 200, 200, 404, 404, 404]],
    [true, false, [200, 404, 200, 404, 404, 404]],
    [false, true, [404, 404, 404, 200, 200, 404]],
    [true, true, [404, 404, 404, 200, 404, 404]],
  ] as const) {
    it(`native options control: caseSensitive=${caseSensitive}, strict=${strict}`, async () => {
      const app = express();
      const router = express.Router({ caseSensitive, strict });
      router.get('/ITEMS/:id//', (_req, res) => res.end('matched'));
      app.use(router);
      assert.deepEqual(
        await observe(app, ['/ITEMS/a', '/items/a', '/ITEMS/a/', '/ITEMS/a//', '/items/a//', '/ITEMS/a///']),
        statuses
      );
    });
  }
  it('application routing options do not change a default child router', async () => {
    const app = express();
    app.enable('case sensitive routing');
    app.enable('strict routing');
    const router = express.Router();
    router.get('/ITEMS/:id//', (_req, res) => res.end('matched'));
    app.use(router);
    assert.deepEqual(await observe(app, ['/items/a', '/items/a/', '/items/a//']), [200, 200, 404]);
  });

  it('uses non-Unicode regexp case folding even for literals unavailable as raw HTTP bytes', () => {
    for (const [a, b, equivalent] of [
      ['/é', '/É', true],
      ['/μ', '/µ', true],
      ['/σ', '/ς', true],
      ['/k', '/K', false],
      ['/s', '/ſ', false],
      ['/i', '/İ', false],
      ['/ß', '/SS', false],
      ['/ß', '/ẞ', false],
      ['/𐐀', '/𐐨', false],
    ] as const) {
      assert.equal(pathToRegexp(a).regexp.test(b), equivalent, `${a} versus ${b}`);
      assert.equal(pathToRegexp(b).regexp.test(a), equivalent, `${b} versus ${a}`);
      assert.equal(canonicalHttpRoutePath(a) === canonicalHttpRoutePath(b), equivalent);
    }
  });

  it('rejects invalid matcher grammar and excessive optional alternatives offline', () => {
    for (const path of ['/items/*', '/items/:id?', '/items/:id(.*)', '/items' + '{/x}'.repeat(9)]) {
      assert.throws(() => resolve('/unrelated', path, false), /invalid Express route path/);
    }
  });

  it('retains constrained capture tails and slash-crossing parameter alternatives', () => {
    for (const [a, b] of [
      ['/items/:a-:b', '/items/:a-:b{-:c}'],
      ['/files/*first/end/*last', '/files/*first/end/*last{.:ext}'],
      ['/items/:id', '/items/:id{/:child}'],
    ]) {
      assert.notEqual(canonicalHttpRoutePath(a), canonicalHttpRoutePath(b));
      assert.throws(() => resolve(a, b, false), /collision/);
      assert.throws(() => resolve(a, b, true, true), /replacement must retain/);
    }
  });

  it('does not confuse matching identity with parameter decoding behavior', async () => {
    const a = '/files/*path';
    const b = '/files/*other{2F:extension}';
    const app = express();
    app.get('/0' + a, (_req, res) => res.end('matched'));
    app.get('/1' + b, (_req, res) => res.end('matched'));
    assert.deepEqual(await observe(app, ['/0/files/a%2Fb', '/1/files/a%2Fb']), [200, 400]);
    assert.equal(canonicalHttpRoutePath(a), canonicalHttpRoutePath(b));
    assert.throws(() => resolve(a, b, false), /collision/);
  });
});
