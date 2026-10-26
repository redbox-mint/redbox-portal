// Temporary, out-of-band CI trace. The wrapped test command owns the exit code;
// diagnostics never send Karma events, replace completion, or extend its limits.
const { spawn } = require('node:child_process');
const { mkdirSync, appendFileSync } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const directory = path.resolve(process.cwd(), '../.tmp/form-completion-trace');
mkdirSync(directory, { recursive: true });
const output = path.join(directory, 'trace.jsonl');
function record(event, data = {}) {
  appendFileSync(output, JSON.stringify({ at: new Date().toISOString(), event, ...data }) + '\n');
}

const clients = new Set();
const attached = new Set();
let finished = false;
let discovering = false;
function attach(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  clients.add(socket);
  const pending = new Map();
  let sequence = 0;
  let sampling = false;
  let pausedForTrace = false;
  let debuggerArmed = false;
  let exceptions = 0;
  function command(method, params = {}, deadline = 3000) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(method + ' did not respond'));
      }, deadline);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  socket.addEventListener('open', async () => {
    record('attached', { target: target.id, url: target.url });
    try {
      for (const domain of ['Runtime', 'Network', 'Inspector']) await command(domain + '.enable');
      await command('Runtime.addBinding', { name: '__redboxTraceArmDebugger' });
      // Runtime events duplicate every console message and its stack. Keep the
      // explicit binding, but disable those events during the test workload.
      await command('Runtime.disable');
    } catch (error) {
      record('enable-error', { message: error.message });
    }
  });
  socket.addEventListener('message', async event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      if (request) {
        clearTimeout(request.timer);
        pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
      }
      return;
    }
    const data = message.params || {};
    if (message.method === 'Runtime.bindingCalled' && data.name === '__redboxTraceArmDebugger') {
      try {
        // Enabling the debugger during startup slows source-map parsing and
        // browser tests. Arm it only near the end, before the observed stall.
        await command('Debugger.enable');
        debuggerArmed = true;
        record('debugger-armed');
      } catch (error) { record('debugger-error', { message: error.message }); }
    }
    if (message.method === 'Inspector.targetCrashed') record('renderer-crashed', { target: target.id });
    if (message.method === 'Runtime.exceptionThrown' && exceptions++ < 100) record('exception', { details: data.exceptionDetails });
    if (message.method === 'Network.webSocketFrameSent') {
      const payload = data.response.payloadData;
      const packet = /^\d+\["([^"]+)"/.exec(payload)?.[1];
      if (packet === 'complete' || payload.length > 1000000) {
        const data = { packet, bytes: Buffer.byteLength(payload), sha256: createHash('sha256').update(payload.slice(1)).digest('hex') };
        if (packet === 'complete') {
          try {
            const decoded = JSON.parse(payload.slice(payload.indexOf('[')));
            data.coverageFiles = Object.keys(decoded[1]?.coverage || {}).length;
            data.keys = Object.keys(decoded[1] || {});
          } catch (error) { data.parseError = error.message; }
        }
        record('websocket-send', data);
      }
    }
    if (message.method === 'Debugger.paused') {
      record('paused-stack', {
        reason: data.reason,
        frames: data.callFrames.map(frame => ({ function: frame.functionName, url: frame.url, location: frame.location })),
      });
      try { await command('Debugger.resume'); } catch (error) { record('resume-error', { message: error.message }); }
    }
  });
  socket.addEventListener('error', () => record('socket-error', { target: target.id }));
  socket.addEventListener('close', () => {
    clearInterval(interval);
    clients.delete(socket);
    attached.delete(target.id);
  });
  const interval = setInterval(async () => {
    if (sampling || finished || socket.readyState !== WebSocket.OPEN) return;
    sampling = true;
    try {
      const result = await command('Runtime.evaluate', {
        expression: `JSON.stringify([window,...Array.from(document.querySelectorAll('iframe'),frame=>frame.contentWindow)].map(view=>({url:view.location.href,visibility:view.document.visibilityState,state:view.__redboxFormCompletionTrace?.(),socket:view.karma?.socket && {connected:view.karma.socket.connected,transport:view.karma.socket.io.engine.transport.name,readyState:view.karma.socket.io.engine.readyState,writeBuffer:view.karma.socket.io.engine.writeBuffer.length}})))`,
        returnByValue: true,
      });
      if (result.exceptionDetails) record('snapshot-exception', { details: result.exceptionDetails });
      if (result.result.value) {
        const browsers = JSON.parse(result.result.value);
        for (const browser of browsers) record('snapshot', { browser });
        if (!debuggerArmed && browsers.some(browser => browser.state)) {
          // Karma creates its test iframe after capture. Install the binding in
          // that new context without enabling its console-event stream.
          await command('Runtime.addBinding', { name: '__redboxTraceArmDebugger' });
        }
      }
    } catch (error) {
      record('snapshot-error', { message: error.message });
      if (!finished && debuggerArmed && !pausedForTrace && error.message === 'Runtime.evaluate did not respond') {
        pausedForTrace = true;
        // A one-time pause/resume captures a blocked renderer's stack. It
        // does not mark the suite complete or change any timeout.
        command('Debugger.pause').catch(error => record('pause-error', { message: error.message }));
      }
    } finally {
      sampling = false;
    }
  }, 5000);
}

const discovery = setInterval(async () => {
  if (finished || discovering) return;
  discovering = true;
  try {
    const response = await fetch('http://127.0.0.1:9222/json/list', { signal: AbortSignal.timeout(1000) });
    for (const target of await response.json()) {
      if (target.type === 'page' && /^http:\/\/localhost:9876\//.test(target.url) && !attached.has(target.id)) {
        attached.add(target.id);
        attach(target);
      }
    }
  } catch { /* Chrome is not running during compilation. */ } finally { discovering = false; }
}, 500);

record('start', { node: process.version, architecture: process.arch });
const child = spawn(process.argv[2], process.argv.slice(3), { stdio: 'inherit' });
function stop(code, signal) {
  if (finished) return;
  finished = true;
  clearInterval(discovery);
  for (const client of clients) client.close();
  record('exit', { code, signal });
  process.exitCode = code ?? 1;
}
child.on('error', error => { record('command-error', { message: error.message }); stop(1); });
child.on('exit', stop);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
