import { expect } from 'chai';
import express from 'express';
import session from 'express-session';
import { createServer, get, type ClientRequest, type ServerResponse } from 'node:http';
import { of } from 'rxjs';
import { Controllers } from '../../src/CoreController';
import { redboxSession } from '../../src/middleware/redboxSession';
import {
  cleanupPersistence,
  initializePersistence,
  persistenceOperation,
  persistenceReady,
} from '../../src/persistence/runtime';
import { createMockSails } from '../services/testHelper';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
};
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
type Work = (req: Sails.Req, res: Sails.Res) => unknown;

function storedSession() {
  const store = new session.MemoryStore();
  const sid = 'fixture-response-session';
  store.set(sid, {
    cookie: new session.Cookie(),
    branding: '',
    portal: '',
    user: {},
    redirUrl: '',
    logoutUrl: '',
    lang: '',
    authenticated: false,
    data: null,
  });
  const signature = require('cookie-signature') as { sign(value: string, secret: string): string };
  return { store, cookie: `connect.sid=${encodeURIComponent('s:' + signature.sign(sid, 'request-lifetime-fixture'))}` };
}

class CallbackController extends Controllers.Core.Controller {
  protected override _exportedMethods = ['run'];
  constructor(private readonly work: Work) {
    super();
  }
  public run(req: Sails.Req, res: Sails.Res) {
    return this.work(req, res);
  }
  public handoff(req: Sails.Req) {
    this.retainRequestCallback(req);
  }
  public background(req: Sails.Req, work: Promise<unknown>) {
    this.recordBackgroundOperation(req, 'requestLifetimeFixture', work);
  }
}
class AsyncController extends CallbackController {
  public override async run(req: Sails.Req, res: Sails.Res) {
    return super.run(req, res);
  }
}

async function fixture(
  app: Sails.Application,
  controller: CallbackController,
  options: {
    session?: Parameters<typeof redboxSession>[0];
    cookie?: string;
    entered?: Promise<void>;
    handleError?: (error: unknown, res: Sails.Res) => unknown;
  } = {}
) {
  const web = express();
  const entered = deferred(),
    closed = deferred();
  const errors: unknown[] = [];
  const action = controller.exports().run as (req: Sails.Req, res: Sails.Res) => unknown;
  let returned: unknown;
  let response: ServerResponse | undefined;
  web.use((_req, res, next) => {
    response = res;
    res.once('close', closed.resolve);
    next();
  });
  web.use(redboxSession({ secret: 'request-lifetime-fixture', cookie: { secure: false }, ...options.session }));
  web.get('/', (req, res, next) => {
    try {
      returned = action(req as unknown as Sails.Req, res as unknown as Sails.Res);
      // Match Sails' AsyncFunction-specific error handling, rather than masking
      // a classification regression with Express 5's Promise-aware router.
      if (action.constructor.name === 'AsyncFunction') {
        void Promise.resolve(returned).catch(next);
      }
    } catch (error) {
      next(error);
    }
    entered.resolve();
  });
  web.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    errors.push(error);
    entered.resolve();
    if (options.handleError) return options.handleError(error, res as unknown as Sails.Res);
    if (!res.destroyed) res.status(500).end('failed');
  });
  const server = createServer(web);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Missing fixture listener');
  const request: ClientRequest = get(`http://127.0.0.1:${address.port}/`, {
    agent: false,
    headers: options.cookie ? { cookie: options.cookie } : {},
  });
  const body = new Promise<string>((resolve, reject) => {
    request.once('error', reject);
    request.once('response', incoming => {
      let data = '';
      incoming.setEncoding('utf8');
      incoming.on('data', chunk => {
        data += chunk;
      });
      incoming.once('end', () => resolve(data));
      incoming.once('error', reject);
    });
  });
  void body.catch(() => {});
  await (options.entered ?? entered.promise);
  let shutdownComplete = false;
  const shutdown = () =>
    new Promise<void>((resolve, reject) => {
      app.config.beforeShutdown!(error => {
        if (error) reject(error);
        else {
          shutdownComplete = true;
          resolve();
        }
      });
    });
  return {
    action,
    errors,
    body,
    get returned() {
      return returned;
    },
    get shutdownComplete() {
      return shutdownComplete;
    },
    get response() {
      return response;
    },
    shutdown,
    async abort() {
      request.destroy();
      await closed.promise;
    },
    async close() {
      request.destroy();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await cleanupPersistence(app);
    },
  };
}

describe('HTTP controller lifetime during persistence shutdown', () => {
  let original: Sails.Application;
  let app: Sails.Application;
  beforeEach(async () => {
    original = Reflect.get(global, 'sails');
    app = createMockSails();
    Reflect.set(global, 'sails', app);
    await initializePersistence(app);
  });
  afterEach(async () => {
    await cleanupPersistence(app);
    Reflect.set(global, 'sails', original);
  });

  it('waits for an aborted async action and its final persistence write', async () => {
    const held = deferred();
    let written = false;
    const f = await fixture(
      app,
      new AsyncController(async (_req, res) => {
        await held.promise;
        await persistenceOperation(app, async () => {
          written = true;
        });
        res.end('done');
      })
    );
    try {
      expect(f.action.constructor.name).to.equal('AsyncFunction');
      await f.abort();
      const lowering = f.shutdown();
      await turn();
      expect(f.shutdownComplete).to.equal(false);
      expect(persistenceReady(app)).to.equal(true);
      held.resolve();
      await lowering;
      expect(written).to.equal(true);
      expect(f.errors).to.deep.equal([]);
    } finally {
      held.resolve();
      await f.close();
    }
  });

  it('preserves an aborted async rejection and waits for that action to settle', async () => {
    const held = deferred(),
      marker = new Error('fixture action failure');
    const f = await fixture(
      app,
      new AsyncController(async () => {
        await held.promise;
        throw marker;
      })
    );
    try {
      await f.abort();
      const lowering = f.shutdown();
      await turn();
      expect(f.shutdownComplete).to.equal(false);
      held.resolve();
      await lowering;
      await turn();
      expect(f.errors).to.deep.equal([marker]);
    } finally {
      held.resolve();
      await f.close();
    }
  });

  it('keeps callback actions until their end attempt after abort and preserves the sync return', async () => {
    const held = deferred(),
      sentinel = {};
    let written = false;
    const f = await fixture(
      app,
      new CallbackController((_req, res) => {
        void held.promise.then(async () => {
          await persistenceOperation(app, async () => {
            written = true;
          });
          res.end('done');
        });
        return sentinel;
      })
    );
    try {
      expect(f.action.constructor.name).to.equal('Function');
      expect(f.returned).to.equal(sentinel);
      await f.abort();
      const lowering = f.shutdown();
      await turn();
      expect(f.shutdownComplete).to.equal(false);
      held.resolve();
      await lowering;
      expect(written).to.equal(true);
    } finally {
      held.resolve();
      await f.close();
    }
  });

  it('does not treat a closed outer RxJS subscription as a finished nested callback', async () => {
    const held = deferred();
    let written = false;
    const f = await fixture(
      app,
      new CallbackController((_req, res) =>
        of(1).subscribe(() => {
          void held.promise.then(async () => {
            await persistenceOperation(app, async () => {
              written = true;
            });
            res.end('done');
          });
        })
      )
    );
    try {
      expect((f.returned as { closed: boolean }).closed).to.equal(true);
      await f.abort();
      const lowering = f.shutdown();
      await turn();
      expect(f.shutdownComplete).to.equal(false);
      held.resolve();
      await lowering;
      expect(written).to.equal(true);
    } finally {
      held.resolve();
      await f.close();
    }
  });

  it('waits for declared callback work after an async action hands off its response', async () => {
    const held = deferred();
    let controller: AsyncController,
      written = false;
    controller = new AsyncController(async (req, res) => {
      await Promise.resolve();
      controller.handoff(req);
      void held.promise.then(async () => {
        await persistenceOperation(app, async () => {
          written = true;
        });
        res.end('done');
      });
    });
    const f = await fixture(app, controller);
    try {
      await f.abort();
      const lowering = f.shutdown();
      await turn();
      expect(f.shutdownComplete).to.equal(false);
      held.resolve();
      await lowering;
      expect(written).to.equal(true);
    } finally {
      held.resolve();
      await f.close();
    }
  });

  it('finishes cancelled async downloads that settle without calling end', async () => {
    const held = deferred();
    let ended = false;
    const f = await fixture(
      app,
      new AsyncController(async (_req, res) => {
        await held.promise;
        if (res.destroyed) return;
        ended = true;
        res.end('done');
      })
    );
    try {
      await f.abort();
      const lowering = f.shutdown();
      await turn();
      expect(f.shutdownComplete).to.equal(false);
      held.resolve();
      await lowering;
      expect(ended).to.equal(false);
    } finally {
      held.resolve();
      await f.close();
    }
  });

  it('waits for async work after an already-finished response', async () => {
    const held = deferred();
    let written = false;
    const f = await fixture(
      app,
      new AsyncController(async (_req, res) => {
        res.end('early');
        await held.promise;
        await persistenceOperation(app, async () => {
          written = true;
        });
      })
    );
    try {
      expect(await f.body).to.equal('early');
      const lowering = f.shutdown();
      await turn();
      expect(f.shutdownComplete).to.equal(false);
      held.resolve();
      await lowering;
      expect(written).to.equal(true);
    } finally {
      held.resolve();
      await f.close();
    }
  });

  it('waits for explicitly recorded background work after a callback response', async () => {
    const held = deferred();
    let controller: CallbackController,
      written = false;
    controller = new CallbackController((req, res) => {
      res.end('early');
      controller.background(
        req,
        held.promise.then(async () => {
          await persistenceOperation(app, async () => {
            written = true;
          });
        })
      );
    });
    const f = await fixture(app, controller);
    try {
      expect(await f.body).to.equal('early');
      const lowering = f.shutdown();
      await turn();
      expect(f.shutdownComplete).to.equal(false);
      held.resolve();
      await lowering;
      expect(written).to.equal(true);
    } finally {
      held.resolve();
      await f.close();
    }
  });

  it('retains normal response completion and synchronous error identity', async () => {
    const marker = new Error('fixture sync failure');
    const f = await fixture(
      app,
      new CallbackController(() => {
        throw marker;
      })
    );
    try {
      expect(f.action.constructor.name).to.equal('Function');
      expect(await f.body).to.equal('failed');
      await f.shutdown();
      expect(f.errors).to.deep.equal([marker]);
      expect(persistenceReady(app)).to.equal(false);
    } finally {
      await f.close();
    }
  });

  for (const operation of ['save', 'touch', 'destroy'] as const) {
    for (const failure of ['none', 'reject', 'throw'] as const) {
      it(`waits for a pending session ${operation} after action ${failure} and client abort`, async () => {
        const marker = new Error('fixture failure after session handoff');
        const failed = deferred();
        const saving = deferred(),
          held = deferred();
        const store = new session.MemoryStore();
        const sid = 'fixture-pending-session';
        const sessionCookie = new session.Cookie();
        sessionCookie.maxAge = 30000;
        store.set(sid, {
          cookie: sessionCookie,
          branding: '',
          portal: '',
          user: {},
          redirUrl: '',
          logoutUrl: '',
          lang: '',
          authenticated: false,
          data: null,
        });
        let completed = false;
        const defer = (run: () => void) => {
          saving.resolve();
          void held.promise.then(() => {
            run();
            completed = true;
          });
        };
        if (operation === 'save') {
          const save = store.set.bind(store);
          store.set = (id, value, callback) => {
            defer(() => save(id, value, callback));
          };
        } else if (operation === 'touch') {
          const touch = store.touch.bind(store);
          store.touch = (id, value, callback) => {
            defer(() => touch(id, value, callback));
          };
        } else {
          const destroy = store.destroy.bind(store);
          store.destroy = (id, callback) => {
            defer(() => destroy(id, callback));
          };
        }
        const signature = require('cookie-signature') as { sign(value: string, secret: string): string };
        const cookie = `connect.sid=${encodeURIComponent('s:' + signature.sign(sid, 'request-lifetime-fixture'))}`;
        const f = await fixture(
          app,
          new (failure === 'throw' ? CallbackController : AsyncController)((req, res) => {
            if (operation === 'save') req.session.data = { changed: true };
            if (operation === 'destroy') Reflect.set(req, 'session', null);
            res.end('done');
            if (failure === 'throw') {
              res.destroy();
              throw marker;
            }
            if (failure === 'reject')
              return failed.promise.then(() => {
                throw marker;
              });
          }),
          { session: { secret: 'request-lifetime-fixture', store, unset: 'destroy' }, cookie }
        );
        try {
          await saving.promise;
          await f.abort();
          failed.resolve();
          await turn();
          const lowering = f.shutdown();
          await turn();
          expect(f.shutdownComplete).to.equal(false);
          expect(persistenceReady(app)).to.equal(true);
          held.resolve();
          await lowering;
          expect(completed).to.equal(true);
          expect(f.errors).to.deep.equal(failure === 'none' ? [] : [marker]);
        } finally {
          failed.resolve();
          held.resolve();
          await turn();
          await f.close();
        }
      });
    }
  }

  for (const operation of ['save', 'touch', 'destroy', 'serialize'] as const) {
    for (const kind of ['async', 'callback'] as const) {
      for (const response of ['destroy', 'retry-end'] as const) {
        it(`releases a synchronous session ${operation} failure in an ${kind} action with ${response}`, async () => {
          const { store, cookie } = storedSession();
          const marker = new Error('fixture synchronous store failure');
          let dispatched = false;
          if (operation !== 'serialize')
            store[operation === 'save' ? 'set' : operation] = () => {
              dispatched = true;
              throw marker;
            };
          const f = await fixture(
            app,
            new (kind === 'async' ? AsyncController : CallbackController)((req, res) => {
              if (operation === 'save') req.session.data = { changed: true };
              if (operation === 'serialize') {
                const cyclic: Record<string, unknown> = {};
                cyclic.self = cyclic;
                req.session.data = cyclic;
              }
              if (operation === 'destroy') Reflect.set(req, 'session', null);
              res.end('done');
            }),
            {
              session: { secret: 'request-lifetime-fixture', store, unset: 'destroy' },
              cookie,
              handleError: (_error, res) => {
                if (response === 'retry-end') res.status(500).end('failed');
                res.destroy();
              },
            }
          );
          try {
            await f.abort();
            const lowering = f.shutdown();
            await turn();
            await turn();
            expect(f.errors).to.have.length(1);
            if (operation === 'serialize') expect(f.errors[0]).to.be.instanceOf(TypeError);
            else expect(f.errors[0]).to.equal(marker);
            expect(dispatched).to.equal(operation !== 'serialize');
            expect(f.shutdownComplete).to.equal(true);
            await lowering;
          } finally {
            await f.close();
          }
        });
      }
    }
  }

  for (const operation of ['save', 'touch', 'destroy'] as const) {
    it(`retains a dispatched session ${operation} when response writing throws synchronously`, async () => {
      const { store, cookie } = storedSession();
      const held = deferred();
      let completed = false;
      const callbackErrors: unknown[] = [];
      const finish = (callback: (() => void) | undefined) => {
        void held.promise.then(() => {
          try {
            callback?.();
          } catch (error) {
            callbackErrors.push(error);
          }
          completed = true;
        });
      };
      if (operation === 'save') store.set = (_id, _value, callback) => finish(callback);
      else if (operation === 'touch') store.touch = (_id, _value, callback) => finish(callback);
      else store.destroy = (_id, callback) => finish(callback);
      const f = await fixture(
        app,
        new AsyncController(async (req, res) => {
          if (operation === 'save') req.session.data = { changed: true };
          if (operation === 'destroy') Reflect.set(req, 'session', null);
          // Node rejects this chunk after express-session has dispatched the write.
          Reflect.apply(res.end, res, [{}]);
        }),
        {
          session: { secret: 'request-lifetime-fixture', store, unset: 'destroy' },
          cookie,
          handleError: (_error, res) => {
            res.destroy();
          },
        }
      );
      try {
        await f.abort();
        const lowering = f.shutdown();
        await turn();
        expect(f.errors).to.have.length(1);
        expect(Reflect.get(f.errors[0] as object, 'code')).to.equal('ERR_INVALID_ARG_TYPE');
        expect(f.shutdownComplete).to.equal(false);
        expect(completed).to.equal(false);
        held.resolve();
        await lowering;
        expect(completed).to.equal(true);
        expect(callbackErrors).to.have.length(1);
      } finally {
        held.resolve();
        await turn();
        await f.close();
      }
    });
  }

  for (const result of ['found', 'missing', 'error'] as const) {
    it(`drains an aborted initial session lookup returning ${result}`, async () => {
      const reading = deferred(),
        held = deferred();
      const marker = new Error('fixture delayed session lookup');
      const store = new session.MemoryStore();
      let lookupComplete = false,
        dispatched = false;
      store.get = (_id, callback) => {
        reading.resolve();
        void held.promise.then(() => {
          lookupComplete = true;
          callback(
            result === 'error' ? marker : null,
            result === 'found' ? ({ cookie: new session.Cookie() } as session.SessionData) : null
          );
        });
      };
      const signature = require('cookie-signature') as { sign(value: string, secret: string): string };
      const cookie = `connect.sid=${encodeURIComponent('s:' + signature.sign('fixture-loading-session', 'request-lifetime-fixture'))}`;
      const f = await fixture(
        app,
        new AsyncController(async (_req, res) => {
          dispatched = true;
          res.end('done');
        }),
        { session: { secret: 'request-lifetime-fixture', store }, cookie, entered: reading.promise }
      );
      try {
        await f.abort();
        const lowering = f.shutdown();
        await turn();
        expect(f.shutdownComplete).to.equal(false);
        expect(persistenceReady(app)).to.equal(true);
        expect(lookupComplete).to.equal(false);
        expect(dispatched).to.equal(false);
        held.resolve();
        await lowering;
        expect(lookupComplete).to.equal(true);
        expect(f.errors).to.deep.equal(result === 'error' ? [marker] : []);
      } finally {
        held.resolve();
        await turn();
        await f.close();
      }
    });
  }

  it('retains a synchronous session failure until the async error response finishes', async () => {
    const held = deferred(),
      marker = new Error('fixture session get failure');
    const store = new session.MemoryStore();
    store.get = () => {
      throw marker;
    };
    const signature = require('cookie-signature') as { sign(value: string, secret: string): string };
    const cookie = `connect.sid=${encodeURIComponent('s:' + signature.sign('fixture-session', 'request-lifetime-fixture'))}`;
    let written = false,
      dispatched = false;
    const f = await fixture(
      app,
      new CallbackController(() => {
        dispatched = true;
      }),
      {
        session: { secret: 'request-lifetime-fixture', store },
        cookie,
        handleError: async (error, res) => {
          expect(error).to.equal(marker);
          await held.promise;
          await persistenceOperation(app, async () => {
            written = true;
          });
          res.status(500).end('failed');
        },
      }
    );
    try {
      const lowering = f.shutdown();
      await turn();
      expect(f.shutdownComplete).to.equal(false);
      expect(persistenceReady(app)).to.equal(true);
      held.resolve();
      expect(await f.body).to.equal('failed');
      await lowering;
      expect(written).to.equal(true);
      expect(dispatched).to.equal(false);
      expect(f.errors).to.deep.equal([marker]);
    } finally {
      held.resolve();
      await f.close();
    }
  });

  it('completes an ordinary async request before shutting down', async () => {
    let written = false;
    const f = await fixture(
      app,
      new AsyncController(async (_req, res) => {
        await persistenceOperation(app, async () => {
          written = true;
        });
        res.end('done');
      })
    );
    try {
      expect(await f.body).to.equal('done');
      await f.shutdown();
      expect(written).to.equal(true);
      expect(persistenceReady(app)).to.equal(false);
    } finally {
      await f.close();
    }
  });
});
