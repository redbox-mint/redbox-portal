'use strict';

const { Server } = require('node:http');
const { randomUUID } = require('node:crypto');

const safe = new Set(['GET', 'HEAD', 'OPTIONS']);

// These mounted operations can allocate session credentials or persistent grants
// even when they use a safe HTTP method. Keep this list with the HTTP classifier,
// independent of which tests happen to witness a refusal.
const sideEffecting = [
  /^\/csrfToken\/?$/i,
  /^\/user\/(?:begin_oidc|login_oidc)\/?$/i,
  /^\/[^/]+\/[^/]+\/asynch\/socket-token\/?$/i,
  /^\/[^/]+\/[^/]+\/api\/records\/schemas\/(?:create|update)\//i,
];

function canHaveSideEffects(operation) {
  return (
    !safe.has(operation.method) ||
    operation.upgrade ||
    operation.socketHandshake ||
    operation.sideEffecting ||
    sideEffecting.some(pattern => pattern.test(operation.path))
  );
}

function requiresEffectObservation(operation) {
  return (operation.status >= 400 || operation.denied === true) && canHaveSideEffects(operation);
}

let tracking;
function registerPortal(port, root, declarations = []) {
  if (!tracking) return () => {};
  const writers = declarations
    .filter(route => route.mutating === true || route.sideEffecting === true)
    .map(route => ({
      method: route.method.toUpperCase(),
      path: new RegExp(
        '^' +
          route.path
            .split('/')
            .map(part => {
              if (part.startsWith(':')) return '[^/]+';
              if (part.startsWith('*')) return '.*';
              return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            })
            .join('/') +
          '/?$',
        'i'
      ),
    }));
  const portals = tracking.portals;
  const portal = { root, writers };
  portals.set(port, portal);
  return () => {
    if (portals.get(port) === portal) portals.delete(port);
  };
}

async function witness(title, run) {
  if (!tracking) return run();
  const current = tracking;
  const previous = current.witness;
  current.witness = { file: previous?.file ?? current.hookFile, title };
  try {
    return await run();
  } finally {
    current.witness = previous;
  }
}

function capture(port) {
  if (!tracking) return () => [];
  const listeners = tracking.observers;
  const entry = { port, ids: [] };
  listeners.add(entry);
  return () => {
    listeners.delete(entry);
    return entry.ids.slice();
  };
}

function install(runner) {
  if (tracking) throw new Error('An authorization request recorder is already installed.');
  const current = {
    portals: new Map(),
    observers: new Set(),
    rows: new Map(),
    verified: new Set(),
    witness: undefined,
    hookFile: undefined,
  };
  tracking = current;
  const namespace = randomUUID();
  let sequence = 0;
  const emit = Server.prototype.emit;
  Server.prototype.emit = function (event, ...args) {
    if (event !== 'request' && event !== 'upgrade') return Reflect.apply(emit, this, [event, ...args]);
    const [req, res] = args;
    const port = req.socket.localPort;
    const portal = current.portals.get(port);
    if (!portal) return Reflect.apply(emit, this, [event, ...args]);
    let target;
    try {
      target = new URL(req.url ?? '/', 'http://portal.invalid');
    } catch {
      target = new URL('http://portal.invalid/');
    }

    const path = target.pathname.startsWith(portal.root + '/')
      ? target.pathname.slice(portal.root.length)
      : target.pathname;
    const method = req.method;
    const upgrade = event === 'upgrade';
    const socketHandshake = /^\/portal-socket\.io(?:\/|$)/i.test(path) && target.searchParams.has('transport');
    const operation = {
      id: namespace + ':' + ++sequence,
      method,
      path,
      upgrade,
      socketHandshake,
      sideEffecting: portal.writers.some(route => ['ALL', method].includes(route.method) && route.path.test(path)),
    };
    const witness = current.witness;
    if (witness?.file) {
      const { file, title } = witness;
      const key = file + '\0' + title;
      const rows = current.rows.get(key) ?? [];
      rows.push(operation);
      current.rows.set(key, rows);
    }
    for (const observer of current.observers) if (observer.port === port) observer.ids.push(operation.id);
    if (!upgrade)
      res.once('finish', () => {
        operation.status ??= res.statusCode;
        const location = res.getHeader('location');
        operation.denied ||= /\/user\/login(?:[?#]|$)/i.test(String(location ?? ''));
      });
    if (!upgrade && canHaveSideEffects(operation)) {
      const end = res.end;
      res.end = function (chunk, ...rest) {
        if (chunk && String(res.getHeader('content-type')).includes('json')) {
          try {
            const body = JSON.parse(String(chunk));
            operation.denied = body?.user === false || body?.status === false || body?.data?.status === false;
          } catch {
            // Raw streams and already-classified HTTP failures use the status.
          }
        }
        return Reflect.apply(end, this, [chunk, ...rest]);
      };
    }
    // Raw integrations may write the terminal HTTP status directly to the
    // socket, in which case ServerResponse never emits finish.
    const socket = req.socket;
    const write = socket.write;
    function restore() {
      if (socket.write === tap) socket.write = write;
      socket.off('close', restore);
    }
    function tap(chunk, ...rest) {
      const status = /^HTTP\/1\.[01] (\d{3}) /.exec(String(chunk).slice(0, 16));
      const code = Number(status?.[1]);
      if (code === 101 || code >= 200) {
        operation.status = code;
        restore();
      }
      return Reflect.apply(write, this, [chunk, ...rest]);
    }
    if (upgrade || socketHandshake) {
      socket.write = tap;
      socket.once('close', restore);
      if (!upgrade) res.once('finish', restore);
    }
    return Reflect.apply(emit, this, [event, ...args]);
  };
  runner.on('hook', hook => {
    current.hookFile = hook.file || hook.parent.file;
  });
  runner.on('test', test => {
    current.witness = { file: test.file, title: test.fullTitle() };
  });
  runner.on('test end', () => {
    current.witness = undefined;
  });
  runner.once('end', () => {
    Server.prototype.emit = emit;
    tracking = undefined;
  });
  return {
    verify(ids) {
      for (const id of ids) current.verified.add(id);
    },
    receipt(test) {
      const operations = current.rows.get(test.file + '\0' + test.fullTitle()) ?? [];
      return { operations, observedRequestIds: operations.filter(op => current.verified.has(op.id)).map(op => op.id) };
    },
  };
}

module.exports = { registerPortal, witness, capture, install, requiresEffectObservation };
