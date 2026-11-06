import assert from 'node:assert/strict';
import { script, url, targetForms, type Settings } from './sessionDifferential';
import { pairwise, assertPairwise } from './sessionMatrix';

(url ? describe : describe.skip)(
  'Express/native differential sessions on real Mongo (full/pairwise transport matrix)',
  function () {
    this.timeout(30_000);
    const transport: Settings[] = [];
    for (const rolling of [false, true])
      for (const resave of [false, true])
        for (const saveUninitialized of [false, true])
          for (const secure of [true, false, 'auto'] as const)
            for (const trust of [false, true])
              for (const proto of [undefined, 'http', 'https', 'https, http', 'http, https'])
                for (const sameSite of [undefined, false, true, 'lax', 'strict', 'none'] as const) {
                  const settings = { rolling, resave, saveUninitialized, secure, trust, proto, sameSite };
                  transport.push(settings);
                }
    const selected = process.env.FM014_SESSION_FULL === '1' ? transport : pairwise(transport);
    it('covers every pair of transport-axis values in the default subset', () =>
      assertPairwise(transport, pairwise(transport)));
    for (const settings of selected)
      it(JSON.stringify(settings), async () =>
        assert.deepEqual(await script(true, settings), await script(false, settings))
      );
    for (const proxy of [false, true])
      for (const secure of [false, 'auto', true] as const)
        for (const proto of [undefined, 'http', 'https', 'https, http', 'http, https', 'HTTPS, http'])
          it(`proxy override ${JSON.stringify({ proxy, secure, proto })}`, async () => {
            const settings = {
              rolling: false,
              resave: false,
              saveUninitialized: false,
              secure,
              trust: !proxy,
              proto,
              proxy,
              sameSite: 'none' as const,
            };
            assert.deepEqual(await script(true, settings), await script(false, settings));
          });

    for (const rolling of [false, true])
      for (const resave of [false, true])
        for (const saveUninitialized of [false, true])
          it(`session cookie ${JSON.stringify({ rolling, resave, saveUninitialized })}`, async () => {
            const settings = { rolling, resave, saveUninitialized, secure: false, trust: false, sessionCookie: true };
            assert.deepEqual(await script(true, settings), await script(false, settings));
          });

    for (const trust of [['loopback'], ['192.0.2.0/24']])
      for (const secure of [false, true])
        for (const proto of ['https, http', 'http, https'])
          it(`host proxy policy ${JSON.stringify({ trust, secure, proto })}`, async () => {
            const settings = { rolling: false, resave: false, saveUninitialized: false, trust, secure, proto };
            assert.deepEqual(await script(true, settings), await script(false, settings));
          });

    const targets = targetForms.flatMap(target =>
      ['/', '/scope', '/scope/', '/%73cope', '/scop', '/outside'].flatMap(path =>
        [false, true].flatMap(rolling =>
          [false, true].flatMap(resave =>
            [false, true].map(saveUninitialized => ({ target, path, rolling, resave, saveUninitialized }))
          )
        )
      )
    );
    it('covers every pair of request-target and cookie-path axis values in the default subset', () =>
      assertPairwise(targets, pairwise(targets)));
    for (const row of process.env.FM014_SESSION_FULL === '1' ? targets : pairwise(targets))
      it(`request target ${JSON.stringify(row)}`, async () => {
        const settings = { ...row, secure: false, trust: false, cookie: { path: row.path } };
        assert.deepEqual(await script(true, settings), await script(false, settings));
      });

    it('keeps data past original maxAge with real wall-clock 750ms rolling reads', async () => {
      const settings = { rolling: true, resave: false, saveUninitialized: false, secure: false, trust: false };
      // Wall-clock dates differ between sequential hosts; verify each against the
      // concrete retained-value/renewal contract. Exact dates use controlled Date above.
      for (const native of [false, true]) {
        const observations = (await script(native, settings, true)) as { value: unknown; cookies: unknown[] }[];
        assert.equal(observations.length, 4);
        assert(observations.every(observation => observation.value === 'kept' && observation.cookies.length === 1));
      }
    });
  }
);
