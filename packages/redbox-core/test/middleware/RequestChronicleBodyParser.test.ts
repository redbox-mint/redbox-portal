import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import * as sinon from 'sinon';
import { Services } from '../../src/CoreService';
import { Controllers } from '../../src/CoreController';
import { http } from '../../src/config/http.config';
import { requestChronicle } from '../../src/middleware/requestChronicle';
import { currentRequestChronicle } from '../../src/utilities/RequestChronicleContext';
import { createSinonStubLogger } from '../logger.test';

type UploadRequest = Sails.Req & {
  file(name: string): {
    upload(options: { dirname: string }, callback: (error: unknown, files: unknown[]) => void): void;
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

  it('keeps service capture and rethrow deduplication inside a multipart upload callback', async () => {
    const logger = createSinonStubLogger(sinon);
    Reflect.set(globalThis, 'sails', { config: { log: { requestChronicle: { successSampleRate: 0 } } }, log: logger });
    const service = new UploadService();
    const controller = new UploadController();
    const app = express();
    app.use((req, res, next) => requestChronicle(req as Sails.Req, res as unknown as Sails.Res, next));
    app.use((req, res, next) => http.middleware.myBodyParser!(req as Sails.Req, res as unknown as Sails.Res, next));
    app.post('/upload', (req, res) => {
      const sailsReq = req as UploadRequest;
      sailsReq.file('attachment').upload({ dirname: directory }, (uploadError: unknown, files: unknown[]) => {
        const error = new Error('upload service failed');
        service.recordFailure(files.length, error);
        controller.recordFailure(sailsReq, error);
        res.json({ uploaded: files.length, parserFailed: uploadError !== null && uploadError !== undefined });
      });
    });
    const server = app.listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const body = new FormData();
      body.set('marker', 'private-marker');
      body.set('attachment', new Blob(['private-upload-content']), 'test.txt');
      const response = await fetch(`http://127.0.0.1:${address.port}/upload`, { method: 'POST', body });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { uploaded: 1, parserFailed: false });
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
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
});
