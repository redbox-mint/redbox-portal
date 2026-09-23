#!/usr/bin/env node
'use strict';

const http = require('node:http');
const { URL } = require('node:url');

const port = Number(process.env.PORT || 8787);
const state = { responses: new Map(), requests: [], pending: new Map(), sequence: 0 };
const transparentTile = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);
const json = (res, status, body, headers = {}) => {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': payload.length, ...headers });
  res.end(payload);
};
const key = (method, pathname) => `${method.toUpperCase()} ${pathname}`;
const readBody = req =>
  new Promise(resolve => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });

function configuredResponse(req, pathname) {
  const configured = state.responses.get(key(req.method, pathname)) || state.responses.get(`* ${pathname}`);
  if (configured) return configured;
  return undefined;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true });
  if (req.method === 'POST' && url.pathname === '/control/reset') {
    for (const pending of state.pending.values()) pending.release();
    await Promise.all([...state.pending.values()].map(pending => pending.finished));
    state.responses.clear();
    state.requests.length = 0;
    state.pending.clear();
    return json(res, 200, { ok: true });
  }
  if (req.method === 'GET' && url.pathname === '/control/requests') return json(res, 200, state.requests);
  if (req.method === 'POST' && url.pathname === '/control/responses') {
    const body = JSON.parse((await readBody(req)) || '{}');
    for (const [responseKey, value] of Object.entries(body.responses || {})) state.responses.set(responseKey, value);
    return json(res, 200, { ok: true, configured: state.responses.size });
  }
  if (req.method === 'POST' && url.pathname === '/control/release') {
    const id = String(JSON.parse((await readBody(req)) || '{}').id || '');
    const pending = state.pending.get(id);
    if (pending) {
      pending.release();
      await pending.finished;
    }
    return json(res, pending ? 200 : 404, { ok: Boolean(pending) });
  }
  const body = await readBody(req);
  const entry = {
    id: String(++state.sequence),
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    body: body.slice(0, 20_000),
    timestamp: new Date().toISOString(),
  };
  const response = configuredResponse(req, url.pathname);
  const tile = req.method === 'GET' && /^\/tiles\/\d+\/\d+\/\d+\.png$/.test(url.pathname);
  const fontCss = req.method === 'GET' && url.pathname === '/fonts/css' && ['Titillium Web:400,200,300,700,600', 'Roboto Condensed:400,700,300', 'Raleway:400,100', 'Open Sans:400italic,600'].includes(url.searchParams.get('family'));
  entry.matched = Boolean(response) || tile || fontCss;
  entry.status = response ? Number(response.status || 200) : tile || fontCss ? 200 : 404;
  entry.completed = false;
  state.requests.push(entry);
  const finished = new Promise(resolve => {
    res.once('finish', () => { entry.completed = true; state.pending.delete(entry.id); resolve(); });
    res.once('close', () => { state.pending.delete(entry.id); resolve(); });
  });
  if (fontCss) {
    // Typography is outside this behavioural baseline. Use the browser's
    // installed sans-serif fonts, with no live Google stylesheet/font fetches.
    const css = Buffer.from('/* Local regression font stylesheet: system sans-serif fallback. */');
    res.writeHead(200, { 'content-type': 'text/css', 'content-length': css.length });
    return res.end(css);
  }
  if (!response && tile) {
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': transparentTile.length, 'access-control-allow-origin': '*' });
    return res.end(transparentTile);
  }
  if (!response) return json(res, 404, { error: 'unexpected playwright stub request', path: url.pathname });
  const send = () => json(res, Number(response.status || 200), response.body ?? {}, response.headers || {});
  if (response.hold) await new Promise(release => state.pending.set(entry.id, { release, finished }));
  return send();
});
server.listen(port, '0.0.0.0', () => process.stdout.write(`playwright stub listening on ${port}\n`));
process.on('SIGTERM', () => {
  for (const pending of state.pending.values()) pending.release();
  state.pending.clear();
  server.closeAllConnections?.();
  server.close(() => process.exit(0));
});
