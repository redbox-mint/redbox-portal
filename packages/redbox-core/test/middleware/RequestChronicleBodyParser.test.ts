import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, unlink, access, readdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import express from 'express';
import * as sinon from 'sinon';
import { httpBodyParser, httpRequestChronicle, httpErrorHandler, httpAction } from '../../src/http/express/middleware';
import { StreamingMultipart } from '../../src/http/express/multipart';
import { RequestChronicleHelper } from '../../src/utilities/RequestChronicle';
import { recordServiceChronicle } from '../../src/utilities/serviceChronicle';
import { currentRequestChronicle } from '../../src/utilities/RequestChronicleContext';
import { createSinonStubLogger } from '../logger.test';

describe('Request chronicle through owned body and streaming multipart parsers', () => {
  for (const parser of [
    {
      label: 'malformed JSON',
      contentType: 'application/json',
      body: (marker: string) => `{"password":"${marker}",`,
      status: 400,
      type: 'entity.parse.failed',
    },
    {
      label: 'urlencoded parameter-limit',
      contentType: 'application/x-www-form-urlencoded',
      body: (marker: string) =>
        `password=${marker}&` + Array.from({ length: 1001 }, (_, index) => `p${index}=value`).join('&'),
      status: 413,
      type: 'parameters.too.many',
    },
  ])
    for (const captureChronicle of [true, false]) {
      it(`excludes ${parser.label} content from errors and logs ${captureChronicle ? 'with' : 'without'} a chronicle`, async () => {
        const logger = createSinonStubLogger(sinon);
        let forwardedError: unknown;
        const app = express();
        if (captureChronicle) app.use(httpRequestChronicle(logger, { successSampleRate: 1 }));
        app.use(httpBodyParser());
        app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
          forwardedError = error;
          // A custom extension can log the forwarded error without disclosing parser excerpts.
          logger.error(error);
          httpErrorHandler(logger)(error, req, res, next);
        });
        const server = app.listen(0, '127.0.0.1');
        try {
          await once(server, 'listening');
          const address = server.address();
          assert(address && typeof address !== 'string');
          const marker = 'PRIVATE-MALFORMED-PASSWORD';
          const response = await fetch(`http://127.0.0.1:${address.port}/malformed`, {
            method: 'POST',
            headers: { 'content-type': parser.contentType },
            body: parser.body(marker),
          });
          assert.equal(response.status, parser.status);
          assert(!(await response.text()).includes(marker));
          assert(forwardedError instanceof Error);
          assert.equal(Reflect.get(forwardedError, 'status'), parser.status);
          assert.equal(Reflect.get(forwardedError, 'type'), parser.type);
          assert.equal(Reflect.has(forwardedError, 'body'), false);
          assert.equal(forwardedError.cause, undefined);
          assert(
            !inspect(
              logger.error.getCalls().map(call => call.args),
              { depth: null }
            ).includes(marker)
          );
        } finally {
          await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
        }
      });
    }
  for (const mode of ['buffered', 'streamed', 'callback-only'] as const) {
    it(`keeps service capture and error deduplication inside ${mode} streaming finalization`, async () => {
      const logger = createSinonStubLogger(sinon);
      const directory = await mkdtemp(join(tmpdir(), 'chronicle-streaming-'));
      const uploads = new StreamingMultipart(
        {
          putStream: async (key, stream) => {
            await pipeline(stream, createWriteStream(join(directory, key)));
          },
          delete: key => unlink(join(directory, key)),
          exists: async key => {
            try {
              await access(join(directory, key));
              return true;
            } catch {
              return false;
            }
          },
        },
        { files: 2, fileSize: 2 * 1024 * 1024, fields: 2, fieldSize: 128 }
      );
      const uploadStarted = Promise.withResolvers<void>();
      const app = express();
      app.use(httpRequestChronicle(logger, { successSampleRate: 0 }));
      app.use(httpBodyParser(['/upload']));
      app.post(
        '/upload',
        httpAction(async (req, res) => {
          uploadStarted.resolve();
          const result = await uploads.receive(req, async ({ files }) => {
            const error = new Error('upload service failed');
            const complete = async () => {
              recordServiceChronicle(
                logger,
                { uploadFileCount: files.length, uploadContextPresent: currentRequestChronicle()?.isRunning },
                [error]
              );
              const helper = RequestChronicleHelper.fromReq(logger, req);
              helper.addInfo({ uploadOutcome: 'failed' });
              helper.addError(error);
              return {
                uploaded: files.length,
                bytes: (await readFile(join(directory, files[0].key))).length,
                parserFailed: false,
              };
            };
            // Authors may bridge callback APIs; the finalization promise still owns completion.
            return mode === 'callback-only'
              ? new Promise<Awaited<ReturnType<typeof complete>>>((resolve, reject) => {
                  void complete().then(resolve, reject);
                })
              : complete();
          });
          res.json(result);
        })
      );
      app.use(httpErrorHandler(logger));
      const server = app.listen(0, '127.0.0.1');
      try {
        await once(server, 'listening');
        const address = server.address();
        assert(address && typeof address !== 'string');
        const body = new FormData();
        body.set('marker', 'private-marker');
        body.set('attachment', new Blob(['private-upload-content']), 'test.txt');
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
                  await uploadStarted.promise;
                  for (let index = 0; index < 4; index++) {
                    await delay(20);
                    stream.enqueue(Buffer.alloc(256 * 1024, 'x'));
                  }
                  stream.enqueue(Buffer.from(`\r\n--${boundary}--\r\n`));
                  stream.close();
                },
              });
        const response = await fetch(
          `http://127.0.0.1:${address.port}/upload`,
          streamedBody
            ? {
                method: 'POST',
                headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
                body: streamedBody,
                duplex: 'half',
              }
            : { method: 'POST', body }
        );
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          uploaded: 1,
          bytes: Buffer.byteLength('private-upload-content') + (mode === 'buffered' ? 0 : 4 * 256 * 1024),
          parserFailed: false,
        });
        assert.deepEqual(await readdir(directory), []);
      } finally {
        await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
        await uploads.close();
        await rm(directory, { recursive: true, force: true });
      }
      assert(logger.error.calledOnce);
      assert(!logger.debug.called);
      const event = logger.error.firstCall.args[0];
      assert.equal(logger.error.firstCall.args[1], 'Request chronicle');
      assert.equal(event.uploadFileCount, 1);
      assert.equal(event.uploadContextPresent, true);
      assert.equal(event.uploadOutcome, 'failed');
      assert.equal(Object.keys(event.errors ?? {}).length, 1);
      assert.equal(event.result?.classification, 'error');
      assert(!JSON.stringify(event).includes('private-upload-content'));
      assert(!JSON.stringify(event).includes('private-marker'));
    });
  }
});
