import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as createSmtpServer, type Socket } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
/** Real network boundaries. Production clients, provider services and registration
 * remain intact, including their actual timeout and malformed-response handling. */
export async function integrationProviderFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'fm027-providers-'));
  await writeFile(path.join(directory, 'test.hbs'), 'Hello {{name}}');
  let mode = 'success';
  let held:
    | {
        entered: ReturnType<typeof Promise.withResolvers<void>>;
        release: ReturnType<typeof Promise.withResolvers<void>>;
      }
    | undefined;
  const calls: { method: string; path: string }[] = [],
    deliveries: string[] = [],
    sockets = new Set<Socket>();
  const http = createServer((req, res) => {
    calls.push({ method: req.method!, path: req.url! });
    if (mode === 'held') {
      assert(held);
      held.entered.resolve();
      void held.release.promise.then(() => res.end(JSON.stringify({ results: [{ label: 'Alpha', value: 'A' }] })));
      return;
    }
    if (mode === 'timeout') return;
    if (mode === 'disconnect') {
      req.socket.destroy();
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'upstream-error') {
      res.statusCode = 503;
      res.end('{"private":"provider-password-token-marker"}');
      return;
    }
    if (mode === 'invalid-json') {
      res.end('{broken JSON');
      return;
    }
    if (mode === 'malformed') {
      res.end('{"unexpected":true}');
      return;
    }
    if (req.url?.match(/concept-tree|conceptTree/)) {
      res.end(
        mode === 'malformed-tree' ? 'not JSON' : JSON.stringify([{ id: 'alpha', label: 'Alpha', notation: 'A' }])
      );
      return;
    }
    if (req.url?.includes('/vocabularies/')) {
      res.end(
        JSON.stringify({ id: 225, title: 'RVA fixture', slug: 'rva-fixture', version: [{ id: 1, status: 'current' }] })
      );
      return;
    }
    if (req.url?.includes('/categories')) {
      res.end(
        JSON.stringify([
          {
            id: 1,
            title: 'Science',
            parent_id: 0,
            taxonomy_id: 10,
            taxonomy_name: 'Fields',
            source_id: '10',
            is_selectable: true,
          },
        ])
      );
      return;
    }
    if (req.url?.startsWith('/dois')) {
      res.end(
        JSON.stringify({
          data: [{ id: '10.1/alpha', type: 'dois', attributes: { doi: '10.1/alpha', titles: [{ title: 'Alpha' }] } }],
          meta: { total: 1 },
        })
      );
      return;
    }
    res.end(JSON.stringify({ results: [{ label: 'Alpha', value: 'A' }] }));
  });
  http.on('connection', s => {
    sockets.add(s);
    s.once('close', () => sockets.delete(s));
  });
  const smtp = createSmtpServer(socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    calls.push({ method: 'SMTP', path: 'connect' });
    if (mode === 'timeout') return;
    if (mode === 'disconnect') {
      socket.destroy();
      return;
    }
    if (mode === 'malformed' || mode === 'invalid-json') {
      socket.end('broken greeting\r\n');
      return;
    }
    socket.write('220 fixture ESMTP\r\n');
    let pending = '',
      data = false,
      message = '';
    socket.on('data', chunk => {
      pending += chunk.toString();
      let index: number;
      while ((index = pending.indexOf('\r\n')) >= 0) {
        const line = pending.slice(0, index);
        pending = pending.slice(index + 2);
        if (data) {
          if (line === '.') {
            data = false;
            if (mode === 'upstream-error') socket.write('451 try later\r\n');
            else {
              deliveries.push(message);
              socket.write('250 accepted\r\n');
            }
            message = '';
          } else message += line + '\r\n';
        } else if (/^EHLO|^HELO/.test(line)) socket.write('250 fixture\r\n');
        else if (/^DATA/.test(line)) {
          data = true;
          socket.write('354 send message\r\n');
        } else if (/^QUIT/.test(line)) socket.end('221 goodbye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  smtp.listen(0, '127.0.0.1');
  await once(smtp, 'listening');
  const address = http.address(),
    mail = smtp.address();
  assert(address && typeof address === 'object');
  assert(mail && typeof mail === 'object');
  const endpoint = 'http://127.0.0.1:' + address.port;
  return {
    endpoint,
    calls,
    deliveries,
    hold: () => {
      mode = 'held';
      held = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() };
      const gate = held;
      return { entered: gate.entered.promise, release: () => gate.release.resolve() };
    },
    setMode: (value: string) => {
      mode = value;
    },
    reset: () => {
      mode = 'success';
      calls.length = 0;
      deliveries.length = 0;
    },
    configuration: {
      vocab: {
        bootstrapRvaImports: false,
        bootstrapFigshareImports: false,
        rva: { baseUrl: endpoint },
        external: { fixture: { method: 'get', url: endpoint + '/lookup', options: {} } },
        queries: {
          owned: {
            querySource: 'database',
            databaseQuery: { queryName: 'owned' },
            queryField: { property: 'search', type: 'text' },
          },
        },
        services: {
          datacite: {
            serviceName: 'DoiService',
            methodName: 'lookupDataciteDois',
            options: { baseUrl: endpoint, timeoutMs: 100 },
          },
        },
      },
      brandingConfigurationDefaults: {
        auth: {
          active: ['local'],
          local: {
            default: {
              adminUser: 'pilot-admin',
              adminPw: 'pilot-password',
              email: 'synthetic@example.invalid',
              token: 'pilot-api-token',
            },
          },
        },
        figsharePublishing: {
          connection: {
            baseUrl: endpoint,
            token: 'synthetic-provider-token',
            timeoutMs: 100,
            operationTimeouts: { metadataMs: 100 },
            retry: { maxAttempts: 1 },
          },
        },
      },
      emailnotification: {
        settings: {
          enabled: true,
          templateDir: directory + '/',
          serverOptions: {
            host: '127.0.0.1',
            port: mail.port,
            secure: false,
            ignoreTLS: true,
            greetingTimeout: 150,
            socketTimeout: 150,
            connectionTimeout: 150,
          },
        },
      },
    },
    close: async () => {
      held?.release.resolve();
      for (const socket of sockets) socket.destroy();
      await Promise.all([
        new Promise<void>((r, j) => http.close(e => (e ? j(e) : r()))),
        new Promise<void>((r, j) => smtp.close(e => (e ? j(e) : r()))),
      ]);
      await rm(directory, { recursive: true, force: true });
    },
  };
}
