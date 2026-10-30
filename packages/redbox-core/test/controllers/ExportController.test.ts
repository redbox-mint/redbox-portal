import assert from 'node:assert/strict';
import { PassThrough, Readable } from 'node:stream';
import { createServer, request as httpRequest, type IncomingHttpHeaders, type Server } from 'node:http';
import { finished } from 'node:stream/promises';
import express = require('express');
import * as sinon from 'sinon';
import type { ExportJobDto } from '@researchdatabox/sails-ng-common';
import { Controllers } from '../../src/controllers/ExportController';
import { ExportServiceError } from '../../src/services/ExportService';
import { BrandingModel, UserModel } from '../../src/model';
import { routes } from '../../src/config/routes.config';
import { createSinonStubLogger } from '../logger.test';

describe('ExportController background CSV transport', function () {
  const globals = ['sails', 'BrandingService', 'TranslationService', 'ExportService', 'RecordsService'];
  const brand = Object.assign(new BrandingModel(), { id: 'brand-one', name: 'institution' });
  const user = Object.assign(new UserModel(), { id: 'user-one', username: 'librarian' });
  const baseUrl = '/portal-root/institution/catalogue/export/jobs';
  const job: ExportJobDto = {
    id: 'job-one',
    recordType: 'rdmp',
    format: 'csv',
    modifiedBefore: null,
    modifiedAfter: null,
    status: 'queued',
    createdAt: '2026-10-30T00:00:00.000Z',
    startedAt: null,
    completedAt: null,
    expiresAt: null,
    filename: 'Plan - Exported Records.csv',
    byteLength: null,
    downloadUrl: null,
    errorCode: null,
    errorMessage: null,
  };
  let originals: Map<string, PropertyDescriptor | undefined>;
  let app: express.Express;
  let server: Server;
  let createJob: sinon.SinonStub;
  let listJobs: sinon.SinonStub;
  let getJob: sinon.SinonStub;
  let deleteJob: sinon.SinonStub;
  let openDownload: sinon.SinonStub;
  let requestUser: UserModel | undefined;

  async function listen(target: Server): Promise<void> {
    await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve));
  }

  async function request<T = ExportJobDto>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    status: number,
    body?: unknown,
    headers: Record<string, string> = {},
    target = server
  ): Promise<{ body: T; text: string; headers: IncomingHttpHeaders }> {
    const address = target.address();
    assert.ok(address && typeof address !== 'string');
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const outbound = httpRequest(
        {
          hostname: '127.0.0.1',
          port: address.port,
          method,
          path,
          headers: {
            ...headers,
            ...(payload === undefined
              ? {}
              : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }),
          },
        },
        response => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.once('aborted', () => reject(new Error('aborted')));
          response.once('error', reject);
          response.once('end', () => {
            try {
              assert.equal(response.statusCode, status);
              const text = Buffer.concat(chunks).toString('utf8');
              resolve({
                body: response.headers['content-type']?.includes('application/json') ? JSON.parse(text) : undefined,
                text,
                headers: response.headers,
              });
            } catch (error) {
              reject(error);
            }
          });
        }
      );
      outbound.once('error', reject);
      outbound.end(payload);
    });
  }

  beforeEach(async function () {
    originals = new Map(globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    Reflect.set(globalThis, 'sails', { config: {}, log: createSinonStubLogger(sinon) });
    Reflect.set(globalThis, 'BrandingService', { getBrand: (name: string) => (name === brand.name ? brand : null) });
    Reflect.set(globalThis, 'TranslationService', { t: (key: string) => (key === 'rdmp-title' ? 'Plan' : key) });
    createJob = sinon.stub().resolves(job);
    listJobs = sinon.stub().resolves([job]);
    getJob = sinon.stub().resolves(job);
    deleteJob = sinon.stub().resolves();
    openDownload = sinon.stub();
    Reflect.set(globalThis, 'ExportService', { createJob, listJobs, getJob, deleteJob, openDownload });
    requestUser = user;

    const controller = new Controllers.Export();
    app = express();
    app.use(express.json());
    const adapt = (req: express.Request): Sails.Req =>
      Object.assign(req, {
        session: { branding: 'session-brand', portal: 'session-portal' },
        user: requestUser,
        param: (name: string, fallback = '') => req.params[name] ?? req.query[name] ?? fallback,
      }) as Sails.Req;
    const mount = (
      method: 'get' | 'post' | 'delete',
      suffix: string,
      action: 'createJob' | 'listJobs' | 'getJob' | 'deleteJob' | 'downloadJob'
    ) => {
      app[method](`/portal-root/:branding/:portal/export/jobs${suffix}`, (req, res, next) => {
        void controller[action](adapt(req), res as Sails.Res).catch(next);
      });
    };
    mount('post', '', 'createJob');
    mount('get', '', 'listJobs');
    mount('get', '/:id', 'getJob');
    mount('delete', '/:id', 'deleteJob');
    mount('get', '/:id/download', 'downloadJob');
    app.get('/portal-root/:branding/:portal/export/record/download/:format', (req, res, next) => {
      void controller.downloadRecs(adapt(req), res as Sails.Res).catch(next);
    });
    app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (!res.destroyed) res.status(500).json({ message: error instanceof Error ? error.message : 'Request failed' });
    });
    server = createServer(app);
    await listen(server);
  });

  afterEach(async function () {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    sinon.restore();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  it('accepts a CSV request with a localized filename and preserves the root context in Location', async function () {
    const input = { format: 'csv', recType: 'rdmp', after: '2026-10-01T00:00:00.000Z' };
    const response = await request('POST', baseUrl, 202, {
      ...input,
      branding: 'spoofed',
      portal: 'spoofed',
      status: 'ready',
    });
    assert.deepEqual(response.body, job);
    assert.equal(response.headers.location, `${baseUrl}/${job.id}`);
    assert.equal(response.headers['cache-control'], 'private, no-store');
    sinon.assert.calledOnce(createJob);
    assert.equal(createJob.firstCall.args[0].brand, brand);
    assert.equal(createJob.firstCall.args[0].portal, 'catalogue');
    assert.equal(createJob.firstCall.args[0].user.id, user.id);
    assert.deepEqual(createJob.firstCall.args[1], input);
    assert.equal(createJob.firstCall.args[2], 'Plan - Exported Records.csv');
  });

  it('uses the standard API v2 data envelope when requested', async function () {
    const response = await request<{ data: ExportJobDto; meta: object }>(
      'POST',
      baseUrl,
      202,
      { format: 'csv', recType: 'rdmp' },
      { 'X-ReDBox-Api-Version': '2.0' }
    );
    assert.deepEqual(response.body.data, job);
    assert.deepEqual(response.body.meta, {});
  });

  it('lists jobs and retrieves a status through the scoped service methods', async function () {
    const listed = await request<ExportJobDto[]>('GET', baseUrl, 200);
    assert.deepEqual(listed.body, [job]);
    assert.equal(listed.headers['cache-control'], 'private, no-store');
    const status = await request('GET', `${baseUrl}/${job.id}`, 200);
    assert.deepEqual(status.body, job);
    assert.equal(getJob.firstCall.args[1], job.id);
    assert.equal(listJobs.firstCall.args[0].portal, 'catalogue');
  });

  it('rejects unauthenticated requests before invoking the service', async function () {
    requestUser = undefined;
    for (const suffix of ['', '/job-one', '/job-one/download']) {
      await request('GET', `${baseUrl}${suffix}`, 401);
    }
    await request('POST', baseUrl, 401, { format: 'csv', recType: 'rdmp' });
    await request('DELETE', `${baseUrl}/${job.id}`, 401);
    assert.equal(
      createJob.called || listJobs.called || getJob.called || deleteJob.called || openDownload.called,
      false
    );
  });

  it('deletes the scoped export with an empty private 204 response', async function () {
    const response = await request('DELETE', `${baseUrl}/${job.id}?branding=spoofed&portal=spoofed`, 204);
    assert.equal(response.text, '');
    assert.equal(response.headers['cache-control'], 'private, no-store');
    sinon.assert.calledOnce(deleteJob);
    assert.equal(deleteJob.firstCall.args[0].brand, brand);
    assert.equal(deleteJob.firstCall.args[0].portal, 'catalogue');
    assert.equal(deleteJob.firstCall.args[0].user.id, user.id);
    assert.equal(deleteJob.firstCall.args[1], job.id);
  });

  it('keeps API v2 delete responses empty', async function () {
    const response = await request('DELETE', `${baseUrl}/${job.id}`, 204, undefined, { 'X-ReDBox-Api-Version': '2.0' });
    assert.equal(response.text, '');
  });

  for (const status of [403, 404, 409]) {
    it(`maps deletion ${status} errors through the normal private response`, async function () {
      deleteJob.rejects(new ExportServiceError(status, 'export-delete-error', 'The export cannot be deleted.'));
      const response = await request<{ details: string }>('DELETE', `${baseUrl}/${job.id}`, status);
      assert.equal(response.headers['cache-control'], 'private, no-store');
      assert.equal(response.body.details, 'The export cannot be deleted.');
    });
  }

  it('does not expose unexpected deletion failures', async function () {
    deleteJob.rejects(new Error('SECRET storage credentials'));
    const response = await request('DELETE', `${baseUrl}/${job.id}`, 500);
    assert.equal(JSON.stringify(response.body).includes('SECRET'), false);
  });

  for (const input of [
    { format: 'json', recType: 'rdmp' },
    { format: 'csv' },
    { format: 'csv', recType: ['rdmp'] },
    { format: 'csv', recType: 'rdmp', before: {} },
  ]) {
    it(`rejects malformed request ${JSON.stringify(input)} before enqueue`, async function () {
      await request('POST', baseUrl, 400, input);
      sinon.assert.notCalled(createJob);
    });
  }

  it('streams a stored CSV with its exact length and attachment headers', async function () {
    const csv = '\uFEFF"redboxOid","metadata.title"\n"one","Ångström"';
    openDownload.resolves({
      stream: Readable.from([Buffer.from(csv)]),
      filename: job.filename,
      byteLength: Buffer.byteLength(csv),
    });
    const response = await request('GET', `${baseUrl}/${job.id}/download`, 200);
    assert.equal(response.text, csv);
    assert.equal(response.headers['content-type'], 'text/csv; charset=utf-8');
    assert.equal(Number(response.headers['content-length']), Buffer.byteLength(csv));
    assert.equal(response.headers['content-disposition'], 'attachment; filename="Plan - Exported Records.csv"');
    assert.equal(response.headers['cache-control'], 'private, no-store');
    assert.equal(openDownload.firstCall.args[1], job.id);
  });

  it('serves a zero-byte CSV successfully', async function () {
    openDownload.resolves({ stream: Readable.from([]), filename: job.filename, byteLength: 0 });
    const response = await request('GET', `${baseUrl}/${job.id}/download`, 200);
    assert.equal(response.text, '');
    assert.equal(response.headers['content-length'], '0');
  });

  for (const status of [403, 404, 409, 410, 503]) {
    it(`maps service ${status} errors before sending download headers`, async function () {
      openDownload.rejects(new ExportServiceError(status, 'export-test-error', 'Prepare another export.'));
      const response = await request<{ details: string }>('GET', `${baseUrl}/${job.id}/download`, status);
      assert.equal(response.headers['content-disposition'], undefined);
      assert.equal(response.headers['cache-control'], 'private, no-store');
      assert.equal(response.body.details, 'Prepare another export.');
    });
  }

  it('does not expose unexpected backend errors', async function () {
    createJob.rejects(new Error('SECRET storage credentials or internal object key'));
    const response = await request('POST', baseUrl, 500, { format: 'csv', recType: 'rdmp' });
    assert.equal(JSON.stringify(response.body).includes('SECRET'), false);
  });

  it('returns a normal API error when the stored CSV fails before its first byte', async function () {
    openDownload.resolves({
      stream: new Readable({
        read() {
          this.destroy(new Error('SECRET storage read failure'));
        },
      }),
      filename: job.filename,
      byteLength: 100,
    });
    const response = await request('GET', `${baseUrl}/${job.id}/download`, 500);
    assert.equal(response.headers['content-disposition'], undefined);
    assert.equal(response.headers['cache-control'], 'private, no-store');
    assert.match(response.headers['content-type'] ?? '', /application\/json/);
    assert.equal(JSON.stringify(response.body).includes('SECRET'), false);
  });

  it('closes the storage source if the client disconnects while awaiting the first byte', async function () {
    let markReading: (() => void) | undefined;
    const reading = new Promise<void>(resolve => {
      markReading = resolve;
    });
    const source = new Readable({
      read() {
        markReading?.();
      },
    });
    const closed = new Promise<void>(resolve => source.once('close', resolve));
    openDownload.resolves({ stream: source, filename: job.filename, byteLength: 100 });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const outbound = httpRequest({
      hostname: '127.0.0.1',
      port: address.port,
      path: `${baseUrl}/${job.id}/download`,
    });
    outbound.on('error', () => undefined);
    try {
      outbound.end();
      await reading;
      outbound.destroy();
      await closed;
      assert.equal(source.destroyed, true);
    } finally {
      outbound.destroy();
      source.destroy();
    }
  });

  it('terminates a failed CSV stream without appending a JSON response', async function () {
    openDownload.resolves({
      stream: Readable.from(
        (async function* () {
          yield Buffer.from('header\n');
          throw new Error('late source failure');
        })()
      ),
      filename: job.filename,
      byteLength: 100,
    });
    await assert.rejects(request('GET', `${baseUrl}/${job.id}/download`, 200), /aborted|socket hang up|ECONNRESET/);
  });

  it('registers browser routes with normal CSRF handling', function () {
    assert.equal(routes['post /:branding/:portal/export/jobs'], 'ExportController.createJob');
    assert.equal(routes['get /:branding/:portal/export/jobs'], 'ExportController.listJobs');
    assert.equal(routes['get /:branding/:portal/export/jobs/:id'], 'ExportController.getJob');
    assert.equal(routes['delete /:branding/:portal/export/jobs/:id'], 'ExportController.deleteJob');
    assert.equal(routes['get /:branding/:portal/export/jobs/:id/download'], 'ExportController.downloadJob');
    assert.equal(routes['get /:branding/:portal/export/record/download/:format'], 'ExportController.downloadRecs');
  });

  it('survives a reverse-proxy idle timeout that aborts the old silent direct CSV request', async function () {
    this.timeout(5_000);
    const csv = Buffer.from('\uFEFF"redboxOid","metadata.lateField"\n"one","preserved"');
    const delayedCsv = () => {
      const stream = new PassThrough();
      const timer = setTimeout(() => stream.end(csv), 300);
      stream.once('close', () => clearTimeout(timer));
      return stream;
    };
    Reflect.set(globalThis, 'RecordsService', { exportAllPlans: delayedCsv });
    let artifact: Buffer | undefined;
    let resolveReady: (() => void) | undefined;
    let rejectReady: ((error: unknown) => void) | undefined;
    const prepared = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    createJob.callsFake(async () => {
      const stream = delayedCsv();
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      void finished(stream).then(
        () => {
          artifact = Buffer.concat(chunks);
          resolveReady?.();
        },
        error => rejectReady?.(error)
      );
      return job;
    });
    getJob.callsFake(async () => ({ ...job, status: artifact ? 'ready' : 'running' }));
    openDownload.callsFake(async () => {
      if (!artifact) throw new ExportServiceError(409, 'export-not-ready', 'The export is still being prepared.');
      return { stream: Readable.from([artifact]), filename: job.filename, byteLength: artifact.length };
    });

    const upstreamServer = createServer(app);
    await listen(upstreamServer);
    const address = upstreamServer.address();
    assert.ok(address && typeof address !== 'string');
    const proxy = createServer((req, res) => {
      const upstream = httpRequest(
        { hostname: '127.0.0.1', port: address.port, path: req.url, method: req.method, headers: req.headers },
        response => {
          res.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(res);
        }
      );
      const timeout = () => {
        if (!res.headersSent) res.writeHead(504);
        res.end('Gateway Timeout');
        upstream.destroy();
      };
      upstream.setTimeout(100, timeout);
      upstream.on('error', () => {
        if (!res.writableEnded) timeout();
      });
      res.once('close', () => upstream.destroy());
      req.pipe(upstream);
    });
    try {
      await listen(proxy);
      await request(
        'GET',
        '/portal-root/institution/catalogue/export/record/download/csv?recType=rdmp',
        504,
        undefined,
        {},
        proxy
      );
      const accepted = await request('POST', baseUrl, 202, { format: 'csv', recType: 'rdmp' }, {}, proxy);
      assert.equal(accepted.body.status, 'queued');
      const preparing = await request('GET', `${baseUrl}/${job.id}`, 200, undefined, {}, proxy);
      assert.equal(preparing.body.status, 'running');
      await prepared;
      const ready = await request('GET', `${baseUrl}/${job.id}`, 200, undefined, {}, proxy);
      assert.equal(ready.body.status, 'ready');
      const downloaded = await request('GET', `${baseUrl}/${job.id}/download`, 200, undefined, {}, proxy);
      assert.equal(downloaded.text, csv.toString('utf8'));
    } finally {
      proxy.closeAllConnections();
      if (proxy.listening) await new Promise<void>(resolve => proxy.close(() => resolve()));
      upstreamServer.closeAllConnections();
      await new Promise<void>(resolve => upstreamServer.close(() => resolve()));
    }
  });
});
