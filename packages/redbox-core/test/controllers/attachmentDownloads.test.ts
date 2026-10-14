import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Agent, createServer, get, IncomingMessage } from 'node:http';
import { PassThrough, Readable } from 'node:stream';
import * as lodash from 'lodash';
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { Controllers as PortalControllers } from '../../src/controllers/RecordController';
import { Controllers as ApiControllers } from '../../src/controllers/webservice/RecordController';

describe('Attachment download stream cleanup', () => {
  let originalGlobals: Record<string, PropertyDescriptor | undefined>;
  const attachment = { fileId: 'file-1', name: 'notes.txt', mimeType: 'text/plain' };
  const record = { metaMetadata: { attachmentFields: ['files'] }, metadata: { files: [attachment] } };

  beforeEach(() => {
    originalGlobals = Object.fromEntries(
      ['sails', 'BrandingService', '_'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
    );
    Object.assign(globalThis, {
      sails: {
        log: { verbose: sinon.stub(), debug: sinon.stub(), info: sinon.stub(), error: sinon.stub() },
      },
      BrandingService: {
        getBrandAndPortalPath: () => '/default/rdmp',
        getBrand: () => ({ id: 'brand-1' }),
      },
      _: lodash,
    });
  });

  afterEach(() => {
    for (const [key, descriptor] of Object.entries(originalGlobals)) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, key);
      }
    }
    sinon.restore();
  });

  for (const route of ['attachment', 'datastream', 'webservice'] as const) {
    describe(route, () => {
      function setup() {
        const getDatastream = sinon.stub();
        const controller = route === 'webservice' ? new ApiControllers.Record() : new PortalControllers.Record();
        Object.assign(controller, {
          getReqBrand: () => ({ id: 'brand-1' }),
          getRecord: () => of(record),
          hasViewAccess: () => route === 'webservice' ? true : of(true),
          requireRecordInBrand: async () => record,
          initTusServer: () => undefined,
          datastreamService: { getDatastream },
          DatastreamService: { getDatastream },
          RecordsService: { getAttachments: async () => [attachment] },
        });
        const sendResp = sinon.stub();
        Object.assign(controller, { sendResp });
        const params: Record<string, string> = { oid: 'oid-1', attachId: 'file-1', datastreamId: 'file-1' };
        const req = {
          method: 'GET', headers: {}, user: { username: 'tester' },
          session: { branding: 'brand-1' },
          url: '/default/rdmp/record/oid-1/attach/file-1',
          path: '/default/rdmp/record/oid-1/attach/file-1',
          param: (key: string) => params[key],
          apiRequest: { params, query: {} },
        } as unknown as Sails.Req;
        const res = Object.assign(new PassThrough(), { set: sinon.stub(), attachment: sinon.stub() });
        const run = () => route === 'attachment'
          ? (controller as PortalControllers.Record).doAttachment(req, res as unknown as Sails.Res)
          : controller.getDataStream(req, res as unknown as Sails.Res);
        return { getDatastream, res, run, sendResp };
      }

      it('finishes a successful download with its original contents', async () => {
        const { getDatastream, res, run, sendResp } = setup();
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(Buffer.from(chunk)));
        getDatastream.resolves({ readstream: Readable.from(['complete file']) });
        await run();
        assert.equal(Buffer.concat(chunks).toString(), 'complete file');
        assert.equal(res.writableFinished, true);
        assert.equal(sendResp.called, false);
      });

      it('destroys the source when the client disconnects during a download', async () => {
        const { getDatastream, res, run, sendResp } = setup();
        const source = new PassThrough();
        getDatastream.resolves({ readstream: source });
        res.once('data', () => res.destroy());
        source.write('partial file');
        const closed = new Promise<void>(resolve => source.once('close', resolve));
        await run();
        await closed;
        assert.equal(source.destroyed, true);
        assert.equal(sendResp.called, false);
      });

      it('destroys a stream returned after the client has already disconnected', async () => {
        const { getDatastream, res, run, sendResp } = setup();
        const source = new PassThrough();
        let resolveRead!: (value: { readstream: PassThrough }) => void;
        let started!: () => void;
        const requested = new Promise<void>(resolve => { started = resolve; });
        getDatastream.callsFake(() => {
          started();
          return new Promise(resolve => { resolveRead = resolve; });
        });
        const running = run();
        await requested;
        const responseClosed = once(res, 'close');
        res.destroy();
        await responseClosed;
        resolveRead({ readstream: source });
        await running;
        assert.equal(source.destroyed, true);
        assert.equal(sendResp.called, false);
      });

      it('closes the response on a source error without sending a second response', async () => {
        const { getDatastream, res, run, sendResp } = setup();
        const source = new PassThrough();
        getDatastream.resolves({ readstream: source });
        res.once('data', () => source.destroy(new Error('storage read failed')));
        source.write('partial file');
        await run();
        assert.equal(source.destroyed, true);
        assert.equal(res.destroyed, true);
        assert.equal(sendResp.called, false);
      });

      it('releases the storage HTTP connection for the next request after cancellation', async () => {
        const agent = new Agent({ keepAlive: true, maxSockets: 1 });
        const storage = createServer((_req, res) => res.end(Buffer.alloc(1024 * 1024)));
        storage.listen(0, '127.0.0.1');
        await once(storage, 'listening');
        const address = storage.address();
        assert.ok(address && typeof address !== 'string');
        const read = () => new Promise<IncomingMessage>((resolve, reject) => {
          get({ host: '127.0.0.1', port: address.port, agent, signal: AbortSignal.timeout(2000) }, resolve).on('error', reject);
        });

        try {
          const { getDatastream, res, run } = setup();
          getDatastream.callsFake(async () => ({ readstream: await read() }));
          res.once('data', () => res.destroy());
          await run();

          // With only one connection, this request cannot start if the previous
          // download still owns its unread response body.
          const next = await read();
          next.resume();
          await once(next, 'end');
          assert.equal(Object.values(agent.requests).flat().length, 0);
        } finally {
          agent.destroy();
          storage.closeAllConnections();
          await new Promise<void>(resolve => storage.close(() => resolve()));
        }
      });
    });
  }
});
