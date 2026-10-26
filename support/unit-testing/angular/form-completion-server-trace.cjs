// Temporary CI diagnostics. Observe both sides of completion without changing
// packets, browser state, event ordering, test outcomes, or timeout settings.
const { appendFileSync, mkdirSync } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');

function completionSummary(payload) {
  const text = String(payload);
  const summary = {
    bytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex'),
  };
  try {
    const packet = JSON.parse(text.slice(text.indexOf('[')));
    summary.packet = packet[0];
    summary.keys = Object.keys(packet[1] || {});
    summary.coverageFiles = Object.keys(packet[1]?.coverage || {}).length;
  } catch (error) {
    summary.parseError = error.message;
  }
  return summary;
}

function serverTrace(emitter, socketServer, config) {
  const directory = path.resolve(config.basePath, '../../../../.tmp/form-completion-trace');
  mkdirSync(directory, { recursive: true });
  const output = path.join(directory, 'server-trace.jsonl');
  const connections = new Map();
  const browsers = new Set();
  function record(event, data = {}) {
    appendFileSync(output, JSON.stringify({ at: new Date().toISOString(), event, ...data }) + '\n');
  }
  function browserState(browser) {
    const result = browser.lastResult;
    return {
      id: browser.id,
      state: browser.state,
      inactivityTimer: Boolean(browser.noActivityTimeoutId),
      total: result.total,
      success: result.success,
      failed: result.failed,
      skipped: result.skipped,
      disconnected: result.disconnected,
    };
  }
  function transportState(connection) {
    const transport = connection.transport;
    const websocket = transport.socket;
    const receiver = websocket?._receiver;
    return {
      id: connection.id,
      readyState: connection.readyState,
      transport: transport.name,
      bytesRead: websocket?._socket?.bytesRead,
      bytesWritten: websocket?._socket?.bytesWritten,
      receiver: receiver && {
        bufferedBytes: receiver._bufferedBytes,
        totalPayloadLength: receiver._totalPayloadLength,
        messageLength: receiver._messageLength,
        state: receiver._state,
      },
    };
  }
  record('start', {
    node: process.version,
    architecture: process.arch,
    transports: socketServer.engine.opts.transports,
    maxHttpBufferSize: socketServer.engine.opts.maxHttpBufferSize,
    client: { clearContext: config.client.clearContext, useIframe: config.client.useIframe },
  });
  socketServer.engine.on('connection', connection => {
    connections.set(connection.id, connection);
    record('engine-connected', transportState(connection));
    connection.on('upgrade', () => record('engine-upgrade', transportState(connection)));
    connection.on('packet', packet => {
      if (packet.type === 'message' && typeof packet.data === 'string' && /^2\["complete"/.test(packet.data)) {
        record('engine-complete', { id: connection.id, ...completionSummary(packet.data) });
      }
    });
    connection.on('error', error => record('engine-error', { id: connection.id, message: error.message }));
    connection.on('close', (reason, details) => {
      record('engine-close', { ...transportState(connection), reason, message: details?.message });
      connections.delete(connection.id);
    });
  });
  socketServer.sockets.on('connection', socket => {
    socket.client.decoder.on('decoded', packet => {
      if (packet.data?.[0] === 'complete') {
        record('decoded-complete', { id: socket.id, coverageFiles: Object.keys(packet.data[1]?.coverage || {}).length });
      }
    });
    let completed = false;
    let lateEvents = 0;
    socket.onAny((event, value) => {
      if (event === 'complete') {
        completed = true;
        record('socket-complete', { id: socket.id, coverageFiles: Object.keys(value?.coverage || {}).length });
      } else if (completed && lateEvents++ < 20) {
        record('after-complete', { id: socket.id, name: event, keys: Object.keys(value || {}), log: value?.log?.slice(0, 200) });
      }
    });
    socket.on('error', error => record('socket-error', { id: socket.id, message: error.message }));
    socket.on('disconnect', reason => record('socket-disconnect', { id: socket.id, reason }));
  });
  emitter.on('browser_register', browser => {
    browsers.add(browser);
    record('browser-register', browserState(browser));
  });
  emitter.on('browser_complete', (browser, result) => record('browser-complete', {
    ...browserState(browser), coverageFiles: Object.keys(result?.coverage || {}).length,
  }));
  emitter.on('run_complete', (_browsers, result) => record('run-complete', { result }));
  const interval = setInterval(() => record('snapshot', {
    browsers: Array.from(browsers, browserState),
    connections: Array.from(connections.values(), transportState),
    memory: process.memoryUsage(),
  }), 5000);
  interval.unref();
  emitter.on('exit', done => {
    clearInterval(interval);
    record('exit');
    done();
  });
}
serverTrace.$inject = ['emitter', 'socketServer', 'config'];
module.exports = { 'framework:form-completion-server-trace': ['factory', serverTrace] };
