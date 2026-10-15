import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import express from 'express';
import * as sinon from 'sinon';
import { Services } from '../../src/CoreService';
import { Controllers } from '../../src/CoreController';
import { http } from '../../src/config/http.config';
import { requestChronicle } from '../../src/middleware/requestChronicle';
import { currentRequestChronicle } from '../../src/utilities/RequestChronicleContext';
import { createSinonStubLogger } from '../logger.test';

type UploadedFile = { fd: string; size: number };
type UploadCallback = (error: unknown, files: UploadedFile[]) => void;
type UploadRequest = Sails.Req & {
  file(name: string): {
    upload(callback: UploadCallback): unknown;
    upload(options: { dirname: string }, callback: UploadCallback): unknown;
  };
};

class UploadService extends Services.Core.Service {
  public recordFailure(fileCount: number, error: Error): void {
    this.updateChronicle({ uploadFileCount: fileCount, uploadContextPresent: currentRequestChronicle()?.isRunning }, [
      error,
    ]);
  }
}

class UploadController extends Controllers.Core.Controller {
  public recordFailure(req: Sails.Req, error: Error): void {
    this.updateChronicle(req, { uploadOutcome: 'failed' }, [error]);
  }
}

describe('Request chronicle through the configured body parser', () => {
  let originalSails: unknown;
  let directory: string;

  beforeEach(() => {
    originalSails = Reflect.get(globalThis, 'sails');
    directory = mkdtempSync(join(tmpdir(), 'chronicle-body-parser-'));
  });

  afterEach(() => {
    sinon.restore();
    Reflect.set(globalThis, 'sails', originalSails);
    rmSync(directory, { recursive: true, force: true });
  });

  for (const captureChronicle of [true, false]) {
    it(`excludes malformed JSON content from every Sails fallback error log ${captureChronicle ? 'with' : 'without'} a chronicle`, async () => {
      const logger = createSinonStubLogger(sinon);
      const sailsApp = { config: {}, log: logger };
      Reflect.set(globalThis, 'sails', sailsApp);
      const fallback = require('sails/lib/router/bindDefaultHandlers')(sailsApp)[500];
      let forwardedError: unknown;
      const app = express();
      if (captureChronicle) {
        app.use((req, res, next) => requestChronicle(req as Sails.Req, res as unknown as Sails.Res, next));
      }
      app.use((req, res, next) => http.middleware.myBodyParser!(req as Sails.Req, res as unknown as Sails.Res, next));
      app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
        forwardedError = error;
        fallback(error, req, res);
      });
      const server = app.listen(0, '127.0.0.1');
      try {
        await once(server, 'listening');
        const address = server.address();
        assert.ok(address && typeof address !== 'string');
        const marker = 'PRIVATE-MALFORMED-PASSWORD';
        const response = await fetch(`http://127.0.0.1:${address.port}/malformed`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: `{"password":"${marker}",`,
        });
        assert.equal(response.status, 500, 'Preserve the existing Sails fallback response contract');
        await response.text();
        assert.ok(forwardedError instanceof Error);
        assert.equal(Reflect.get(forwardedError, 'status'), 400);
        assert.equal(Reflect.get(forwardedError, 'type'), 'entity.parse.failed');
        assert.equal(Reflect.has(forwardedError, 'body'), false);
        assert.equal(forwardedError.cause, undefined);
        const output = inspect(
          logger.error.getCalls().map(call => call.args),
          { depth: null }
        );
        assert.ok(!output.includes(marker), 'All parser error logs must exclude the raw body and parser excerpts');
      } finally {
        await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
      }
    });
  }

  for (const mode of ['buffered', 'streamed', 'callback-only'] as const) {
    it(`keeps service capture and rethrow deduplication inside a ${mode} multipart upload callback`, async () => {
      const logger = createSinonStubLogger(sinon);
      Reflect.set(globalThis, 'sails', {
        config: { log: { requestChronicle: { successSampleRate: 0 } } },
        log: logger,
      });
      const service = new UploadService();
      const controller = new UploadController();
      let uploadedFiles: UploadedFile[] = [];
      let markUploadStarted: () => void = () => {};
      const uploadStarted = new Promise<void>(resolve => {
        markUploadStarted = resolve;
      });
      const app = express();
      app.use((req, res, next) => requestChronicle(req as Sails.Req, res as unknown as Sails.Res, next));
      app.use((req, res, next) => http.middleware.myBodyParser!(req as Sails.Req, res as unknown as Sails.Res, next));
      app.post('/upload', (req, res) => {
        const sailsReq = req as UploadRequest;
        const upstream = sailsReq.file('attachment');
        const onUpload: UploadCallback = (uploadError, files) => {
          uploadedFiles = files;
          const error = new Error('upload service failed');
          service.recordFailure(files.length, error);
          controller.recordFailure(sailsReq, error);
          res.json({
            uploaded: files.length,
            bytes: readFileSync(files[0].fd).length,
            parserFailed: uploadError !== null && uploadError !== undefined,
          });
        };
        if (mode === 'callback-only') upstream.upload(onUpload);
        else upstream.upload({ dirname: directory }, onUpload);
        markUploadStarted();
      });
      const server = app.listen(0, '127.0.0.1');
      try {
        await once(server, 'listening');
        const address = server.address();
        assert.ok(address && typeof address !== 'string');
        const body = new FormData();
        body.set('marker', 'private-marker');
        body.set('attachment', new Blob(['private-upload-content']), 'test.txt');
        const url = `http://127.0.0.1:${address.port}/upload`;
        const boundary = 'chronicle-test-boundary';
        const streamedBody =
          mode === 'buffered'
            ? undefined
            : new ReadableStream<Uint8Array>({
                async start(stream) {
                  stream.enqueue(
                    Buffer.from(
                      `--${boundary}\r\nContent-Disposition: form-data; name="marker"\r\n\r\nprivate-marker\r\n--${boundary}\r\nContent-Disposition: form-data; name="attachment"; filename="test.txt"\r\nContent-Type: application/octet-stream\r\n\r\nprivate-upload-content`
                    )
                  );
                  // Keep the file incomplete until the handler has registered the upload callback.
                  await uploadStarted;
                  for (let index = 0; index < 4; index++) {
                    await delay(20);
                    stream.enqueue(Buffer.alloc(256 * 1024, 'x'));
                  }
                  stream.enqueue(Buffer.from(`\r\n--${boundary}--\r\n`));
                  stream.close();
                },
              });
        const init = streamedBody
          ? {
              method: 'POST',
              headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
              body: streamedBody,
              duplex: 'half' as const,
            }
          : { method: 'POST', body };
        const response = await fetch(url, init);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          uploaded: 1,
          bytes: Buffer.byteLength('private-upload-content') + (mode === 'buffered' ? 0 : 4 * 256 * 1024),
          parserFailed: false,
        });
      } finally {
        await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
        for (const file of uploadedFiles) rmSync(file.fd, { force: true });
      }
      sinon.assert.calledOnce(logger.error);
      sinon.assert.notCalled(logger.debug);
      const event = logger.error.firstCall.args[0] as {
        errors?: Record<string, unknown>;
        result?: { classification?: string };
        [key: string]: unknown;
      };
      assert.equal(logger.error.firstCall.args[1], 'Request chronicle');
      assert.equal(event.uploadFileCount, 1);
      assert.equal(event.uploadContextPresent, true);
      assert.equal(event.uploadOutcome, 'failed');
      assert.equal(Object.keys(event.errors ?? {}).length, 1);
      assert.equal(event.result?.classification, 'error');
      assert.ok(!JSON.stringify(event).includes('private-upload-content'));
      assert.ok(!JSON.stringify(event).includes('private-marker'));
    });
  }
});
