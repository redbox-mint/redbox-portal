import { assertGoldenNext, goldenControls } from './goldenContracts';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { connect } from 'node:net';
import { join } from 'node:path';

interface Response {
  status: string;
  headers: Record<string, string>;
  body: string;
}

function raw(port: number, target: string, method = 'GET', wire?: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port });
    let data = '';
    socket.setTimeout(2000, () => socket.destroy(new Error('Raw survival request timed out')));
    socket.on('error', reject);
    socket.on('data', chunk => (data += chunk));
    socket.on('connect', () => {
      // Keep the request transport open while delayed hooks complete. The
      // Connection header asks the server to close after its complete response.
      socket.write(wire ?? `${method} ${target} HTTP/1.1\r\nHost: fixture.invalid\r\nConnection: close\r\n\r\n`);
    });
    socket.on('end', () => {
      try {
        const end = data.indexOf('\r\n\r\n');
        assert(end >= 0, 'expected a complete HTTP response');
        const [status, ...fields] = data.slice(0, end).split('\r\n');
        const headers: Record<string, string> = {};
        for (const field of fields) {
          const colon = field.indexOf(':');
          const name = field.slice(0, colon).toLowerCase();
          if (name !== 'date') headers[name] = field.slice(colon + 1).trim();
        }
        resolve({ status, headers, body: data.slice(end + 4) });
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function inProcess<T>(
  kind: 'fastify' | 'native' | 'fastify-security' | 'fastify-diagnostics' | 'fastify-default-diagnostics',
  run: (fixture: Fixture) => Promise<T>
): Promise<T> {
  const child = fork(join(__dirname, 'fixtures/host-survival.cjs'), [kind], {
    execArgv: ['--unhandled-rejections=strict'],
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let output = '';
  child.stdout!.on('data', chunk => (output += chunk));
  child.stderr!.on('data', chunk => (output += chunk));
  const exit = once(child, 'exit');
  let id = 0;
  const next = () =>
    Promise.race([
      once(child, 'message').then(([message]) => message),
      exit.then(([code, signal]) => {
        throw new Error(`${kind} fixture exited (${code}, ${signal}): ${output}`);
      }),
    ]);
  const command: Fixture['command'] = async (command, code) => {
    const message = next();
    child.send({ id: ++id, command, code }, () => {});
    assert.deepEqual(await message, { id });
  };
  const timer = setTimeout(() => child.kill('SIGKILL'), 7000);
  try {
    const { port } = await next();
    assert(Number.isInteger(port));
    return await run({
      port,
      command,
      async survives(active) {
        // Each fault is followed by an IPC round trip and fresh real connections.
        await command('ping');
        for (const [target, status, body] of [
          ['/healthz', 200, '{"healthy":true}'],
          ['/readyz', active ? 200 : 503, `{"ready":${active}}`],
          ['/probe', active ? 200 : 503, active ? '{"ok":true}' : '{"error":"application-not-ready"}'],
        ] as const) {
          const response = await raw(port, target);
          assert.match(response.status, new RegExp(`^HTTP/1.1 ${status} `));
          if (target === '/healthz' && JSON.parse(response.body).logging) {
            const signal = JSON.parse(response.body);
            assert.equal(signal.healthy, true);
            assert(signal.logging.failures > 0);
            assert.equal(typeof signal.logging.degraded, 'boolean');
            assert.equal(typeof signal.logging.dropped, 'number');
            assert(!response.body.includes('secret'));
          } else assert.equal(response.body, body);
        }
        await command('ping');
        assert.equal(child.exitCode, null);
        assert.equal(child.signalCode, null);
      },
    });
  } finally {
    try {
      if (child.exitCode === null && child.signalCode === null && child.connected)
        child.send({ command: 'stop' }, () => {});
      const [code, signal] = await exit;
      assert.equal(code, 0, output);
      assert.equal(signal, null, output);
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exit;
    }
  }
}

interface Fixture {
  port: number;
  command(command: string, code?: string): Promise<void>;
  survives(active: boolean): Promise<void>;
}

const malformed = [
  ['authorities', ['http://[bad/healthz', 'http:///healthz', 'http://[v1.fe]/healthz']],
  ['ports', ['http://host:bad/healthz', 'http://host:999999/healthz', 'http://host:-1/readyz']],
  ['userinfo', ['http://user%ZZ@host/healthz', 'http://user%E0%A4%A@host/readyz', 'http://user%FF:pass@host/healthz']],
  ['IPv6 brackets', ['http://[::1/healthz', 'http://user@[::1]:bad/readyz', 'http://[::1]]/healthz']],
  ['authority escapes', ['http://%ZZ/healthz', 'http://%68ost/healthz', 'http://host%2Fother/readyz']],
  ['overlong targets', ['http://host/' + 'x'.repeat(20_000), '/' + '%'.repeat(20_000)]],
] as const;

describe('Fastify host process survival at request boundaries', function () {
  this.timeout(15_000);

  for (const logger of ['sync', 'async'])
    it(`survives default application logger fault=${logger}`, async () => {
      await inProcess('fastify-default-diagnostics', async fixture => {
        await fixture.command('activate');
        await fixture.command('logger-fault', logger);
        const response = await raw(fixture.port, '/hook-failure?kind=error&password=query-secret');
        assert.equal(response.status, 'HTTP/1.1 500 Internal Server Error');
        assert.equal(response.body, '{"message":"Internal server error","details":""}');
        assert(!JSON.stringify(response).includes('secret'));
        await fixture.survives(true);
        await fixture.command('audit-diagnostics');
      });
    });

  for (const logger of ['sync', 'async'])
    for (const point of [
      'late-failure',
      'sync-after-send',
      'double-send',
      'double-send-pending',
      'reject-while-pending',
      'native-logging',
      'hook-failure',
      'serializer-failure',
    ])
      for (const kind of ['error', 'object', 'string', 'null', 'undefined', 'false', 'zero', 'symbol'])
        it(`survives ${point}, throw=${kind}, logger fault=${logger}`, async () => {
          await inProcess('fastify-diagnostics', async fixture => {
            await fixture.command('activate');
            await fixture.command('logger-fault', logger);
            const response = await raw(fixture.port, `/${point}?kind=${kind}&password=query-secret`);
            const failed = ['hook-failure', 'serializer-failure', 'reject-while-pending'].includes(point);
            assert.match(response.status, new RegExp(`^HTTP/1.1 ${failed ? 500 : 200} `));
            assert.equal(response.body, failed ? '{"message":"Internal server error","details":""}' : '{"ok":true}');
            assert(!JSON.stringify(response).includes('secret'));
            await fixture.survives(true);
            await fixture.command('audit-diagnostics');
          });
        });

  for (const key of ['toString', 'valueOf', 'Symbol.toPrimitive']) {
    for (const method of ['POST', 'HEAD'])
      it(`survives malformed ${method} JSON with structured apiVersion ${key}`, async () => {
        const responses = [];
        for (const kind of ['fastify-security'] as const)
          responses.push(
            await inProcess(kind, async fixture => {
              await fixture.command('activate');
              const body = '{"bad":';
              let response;
              try {
                response = await raw(
                  fixture.port,
                  '/body',
                  method,
                  `${method} /body?apiVersion[${key}]=constructor HTTP/1.1\r\nHost: fixture.invalid\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
                );
              } catch (error) {
                assert.equal(kind, 'express-security');
                assert.equal(key, 'toString');
                assert.match((error as Error).message, /complete HTTP response/);
              }
              await fixture.survives(true);
              return response;
            })
          );
        assert.match(responses[0]!.status, /^HTTP\/1.1 400 /);
        assert.equal(responses[0]!.body, method === 'HEAD' ? '' : '{"message":"Invalid request","details":""}');
        // ACCEPTED-NESTED-INPUT-SAFE-RESPONSE: Express abort is recorded above;
        // native emits exact safe 400 and survives fresh connections and IPC.
        assertGoldenNext('fastify-host-survival', responses[0]);
      });
    it(`rejects bracketed header names containing ${key} at the HTTP boundary and survives`, async () => {
      const responses = [];
      for (const kind of ['fastify-security'] as const)
        responses.push(
          await inProcess(kind, async fixture => {
            await fixture.command('activate');
            const response = await raw(
              fixture.port,
              '/body',
              'POST',
              `POST /body HTTP/1.1\r\nHost: fixture.invalid\r\nConnection: close\r\nAccept[${key}]: constructor\r\nContent-Length: 2\r\n\r\n{}`
            );
            await fixture.survives(true);
            return response;
          })
        );
      assertGoldenNext('fastify-host-survival', responses[0]);
      assert.match(responses[0].status, /^HTTP\/1.1 400 /);
    });
  }

  for (const key of Object.getOwnPropertyNames(Object.prototype))
    for (const header of ['encoding', 'type', 'charset'] as const)
      it(`survives request-controlled ${header} prototype key ${key} like Express`, async () => {
        const responses = [];
        for (const kind of ['fastify-security'] as const)
          responses.push(
            await inProcess(kind, async fixture => {
              await fixture.command('activate');
              const type =
                header === 'type' ? key : `application/json${header === 'charset' ? '; charset=' + key : ''}`;
              const extra = header === 'encoding' ? `Content-Encoding: ${key}\r\n` : '';
              const response = await raw(
                fixture.port,
                '/body',
                'POST',
                `POST /body HTTP/1.1\r\nHost: fixture.invalid\r\nConnection: close\r\nContent-Type: ${type}\r\n${extra}Content-Length: 2\r\n\r\n{}`
              );
              await fixture.survives(true);
              return response;
            })
          );
        assertGoldenNext('fastify-host-survival', responses[0]);
        assert.match(responses[0].status, new RegExp(`^HTTP/1.1 ${header === 'type' ? 200 : 415} `));
      });

  for (const [category, targets] of malformed) {
    it(`matches Express for ${category} before/after activation and survives every target`, async () => {
      const observations = [];
      for (const kind of ['fastify'] as const) {
        observations.push(
          await inProcess(kind, async fixture => {
            const responses = [];
            for (const active of [false, true]) {
              if (active) await fixture.command('activate');
              for (const target of targets) {
                for (const method of ['GET', 'HEAD', 'POST']) {
                  responses.push(await raw(fixture.port, target, method));
                  await fixture.survives(active);
                }
              }
            }
            return responses;
          })
        );
      }

      assertGoldenNext('fastify-host-survival', observations[0]);
      if (category === 'overlong targets')
        for (const response of observations[0])
          assert.deepEqual(response, {
            status: 'HTTP/1.1 431 Request Header Fields Too Large',
            headers: { connection: 'close' },
            body: '',
          });
    });
  }

  it('uses the fixed Express HTML 404 without reflecting malformed targets/errors', async () => {
    await inProcess('fastify', async fixture => {
      for (const active of [false, true]) {
        if (active) await fixture.command('activate');
        const response = await raw(fixture.port, 'http://[private-sentinel/healthz');
        assert.deepEqual(response, {
          status: 'HTTP/1.1 404 Not Found',
          headers: {
            'content-security-policy': "default-src 'none'",
            'x-content-type-options': 'nosniff',
            'content-type': 'text/html; charset=utf-8',
            'content-length': '146',
            connection: 'close',
          },
          body: '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>Cannot GET resource</pre>\n</body>\n</html>\n',
        });
        await fixture.survives(active);
      }
    });
  });

  it('handles synchronous/async hooks, admission rejection and admission rejection without process failure', async () => {
    await inProcess('fastify', async fixture => {
      for (const active of [false, true]) {
        if (active) await fixture.command('activate');
        for (const target of ['/sync-hook-error', '/async-hook-error', '/probe']) {
          if (target === '/probe') await fixture.command('status-error');
          const response = await raw(fixture.port, target);
          const status = active || target === '/probe' ? 500 : 503;
          assert.match(response.status, new RegExp(`^HTTP/1.1 ${status} `));
          await fixture.survives(active);
        }
      }
    });
  });

  it('keeps the raw core router framework-error boundary safe for asynchronous constraint errors', async () => {
    await inProcess('native', async fixture => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await raw(fixture.port, '/framework-error');
        assert.match(response.status, /^HTTP\/1.1 500 /);
        assert.equal(response.body, '{"error":"internal-server-error"}');
        await fixture.command('ping');
      }
    });
  });

  it('matches Express for parser/socket errors and survives resets and partial requests', async () => {
    const observations = [];
    for (const kind of ['fastify'] as const) {
      observations.push(
        await inProcess(kind, async fixture => {
          const responses = [];
          for (const active of [false, true]) {
            if (active) await fixture.command('activate');
            for (const wire of [
              'INVALID< /healthz HTTP/1.1\r\nHost: fixture.invalid\r\n\r\n',
              'GET /healthz HTTP/1.1\r\nHost: fixture.invalid\r\nBad Header: value\r\n\r\n',
            ]) {
              responses.push(await raw(fixture.port, '/', 'GET', wire));
              await fixture.survives(active);
            }
            for (const code of [
              'HPE_INVALID_HEADER_TOKEN',
              'HPE_HEADER_OVERFLOW',
              'ERR_HTTP_REQUEST_TIMEOUT',
              'HPE_CHUNK_EXTENSIONS_OVERFLOW',
            ]) {
              await fixture.command('socket-error', code);
              responses.push(await raw(fixture.port, '/', 'GET', 'G'));
              await fixture.survives(active);
            }
            for (const partial of [false, true]) {
              const socket = connect({ host: '127.0.0.1', port: fixture.port });
              socket.on('error', () => {});
              const closed = new Promise<void>(resolve => socket.once('close', () => resolve()));
              await once(socket, 'connect');
              if (partial) socket.write('GET /healthz HTTP/1.1\r\nHost:');
              socket.resetAndDestroy();
              await closed;
              await fixture.survives(active);
            }
          }
          return responses;
        })
      );
    }

    assertGoldenNext('fastify-host-survival', observations[0]);
    for (const response of observations[0]) {
      assert.deepEqual(response.headers, { connection: 'close' });
      assert.equal(response.body, '');
    }
  });
});

goldenControls('fastify-host-survival');
