import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { firstValueFrom, Observable } from 'rxjs';
import { Services } from '../../src/services/WorkspaceAsyncService';
import * as runtime from '../../src/persistence/runtime';
import type { ProgressRepositories } from '../../src/persistence/progress/ProgressRepositories';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('WorkspaceAsyncService', () => {
  const workspaces = {
    registerWork: sinon.stub(),
    reviseStatus: sinon.stub(),
    listStatus: sinon.stub(),
    removeWork: sinon.stub(),
  };
  let service: Services.WorkspaceAsyncService;
  beforeEach(() => {
    setupServiceTestGlobals(createMockSails());
    for (const method of Object.values(workspaces)) method.reset();
    const repositories: ProgressRepositories = {
      workspaces,
      progress: {
        startProgress: sinon.stub(),
        reviseProgress: sinon.stub(),
        listProgress: sinon.stub(),
        removeProgress: sinon.stub(),
      },
    };
    sinon.stub(require('../../src/persistence/progress/runtime'), 'getProgressRepositories').returns(repositories);
    service = new Services.WorkspaceAsyncService();
  });
  afterEach(() => {
    cleanupServiceTestGlobals();
    sinon.restore();
  });
  it('registers started work lazily through the existing Observable interface', async () => {
    const row = { id: 'work' };
    workspaces.registerWork.resolves(row);
    const observable = service.start({
      name: 'test',
      recordType: 'workspace',
      username: 'admin',
      service: 'test',
      method: 'run',
      args: [],
    });
    assert.equal(workspaces.registerWork.callCount, 0);
    assert.deepEqual(await firstValueFrom(observable), row);
    assert.equal(workspaces.registerWork.firstCall.args[0].started_by, 'admin');
    assert.equal(workspaces.registerWork.firstCall.args[0].status, 'started');
  });
  it('keeps revision arrays and adds completion time only for finished writes', async () => {
    workspaces.reviseStatus.resolves([{ id: 'work' }]);
    await firstValueFrom(service.update('work', { status: 'running' }));
    assert.equal(workspaces.reviseStatus.firstCall.args[1].date_completed, undefined);
    await firstValueFrom(service.update('work', { status: 'finished' }));
    assert.equal(typeof workspaces.reviseStatus.secondCall.args[1].date_completed, 'string');
  });
  it('forwards pending and status/type reads', async () => {
    workspaces.listStatus.resolves([]);
    assert.deepEqual(await firstValueFrom(service.pending()), []);
    assert.deepEqual(workspaces.listStatus.firstCall.args, ['pending']);
    await firstValueFrom(service.status({ status: 'error', recordType: 'workspace' }));
    assert.deepEqual(workspaces.listStatus.secondCall.args, ['error', 'workspace']);
  });
  it('drains jobs and completion writes before invoking the persistence shutdown hook', async () => {
    let finish!: () => void;
    let closed = false;
    sails.config.beforeShutdown = callback => {
      closed = true;
      callback();
    };
    sails.services.test = {
      run: () =>
        new Observable(sub => {
          finish = () => {
            sub.next({ done: true });
            sub.complete();
          };
        }),
    };
    workspaces.listStatus.resolves([{ id: 'work', service: 'test', method: 'run', args: [] }]);
    workspaces.reviseStatus.resolves([{ id: 'work' }]);
    await service.init();
    service.loop();
    await new Promise<void>(ok => setImmediate(ok));
    const shutdown = new Promise<void>((ok, fail) => sails.config.beforeShutdown!(e => (e ? fail(e) : ok())));
    assert.equal(closed, false);
    finish();
    await shutdown;
    assert.equal(closed, true);
    assert.equal(workspaces.reviseStatus.firstCall.args[1].status, 'finished');
    service.loop();
    assert.equal(workspaces.listStatus.callCount, 1);
  });
  it('persists enumerable Error JSON and error status for failed jobs', async () => {
    const failure = new Error('job failed');
    workspaces.listStatus.resolves([{ id: 'work', service: 'test', method: 'run', args: [] }]);
    workspaces.reviseStatus.resolves([]);
    sails.services.test = {
      run: () =>
        new Observable(sub => {
          sub.error(failure);
        }),
    };
    service.loop();
    await service.drain();
    assert.deepEqual(workspaces.reviseStatus.firstCall.args, ['work', { status: 'error', message: {} }]);
  });
  it('drains every accepted job and status write when another write fails', async () => {
    let finishJob!: () => void;
    let finishWrite!: () => void;
    let closed = false;
    sails.config.beforeShutdown = callback => {
      closed = true;
      callback();
    };
    sails.services.test = {
      immediate: () =>
        new Observable(sub => {
          sub.next('private payload');
          sub.complete();
        }),
      delayed: () =>
        new Observable(sub => {
          finishJob = () => {
            sub.next('done');
            sub.complete();
          };
        }),
    };
    workspaces.listStatus.resolves([
      { id: 'failed', service: 'test', method: 'immediate' },
      { id: 'delayed', service: 'test', method: 'delayed' },
    ]);
    workspaces.reviseStatus.withArgs('failed').rejects(new Error('private payload'));
    workspaces.reviseStatus.withArgs('delayed').returns(
      new Promise(resolve => {
        finishWrite = () => resolve([]);
      })
    );
    await service.init();
    service.loop();
    await new Promise<void>(ok => setImmediate(ok));
    const shutdown = new Promise<void>((ok, fail) => sails.config.beforeShutdown!(e => (e ? fail(e) : ok())));
    await new Promise<void>(ok => setImmediate(ok));
    assert.equal(closed, false, 'a failed sibling must not release the batch');
    finishJob();
    await new Promise<void>(ok => setImmediate(ok));
    assert.equal(closed, false, 'the remaining completion write must finish');
    finishWrite();
    await shutdown;
    assert.equal(closed, true);
    assert(!JSON.stringify((sails.log.error as sinon.SinonStub).args).includes('private payload'));
  });
  it('owns early rejected writes and waits for later writes from the same job', async () => {
    let finishJob!: () => void;
    let finishWrite!: () => void;
    sails.services.test = {
      run: () =>
        new Observable(sub => {
          sub.next('first');
          finishJob = () => {
            sub.next('last');
            sub.complete();
          };
        }),
    };
    workspaces.listStatus.resolves([{ id: 'work', service: 'test', method: 'run' }]);
    workspaces.reviseStatus.onFirstCall().rejects(new Error('private failure'));
    workspaces.reviseStatus.onSecondCall().returns(
      new Promise(resolve => {
        finishWrite = () => resolve([]);
      })
    );
    service.loop();
    await new Promise<void>(ok => setImmediate(ok));
    finishJob();
    let drained = false;
    const drain = service.drain().then(() => {
      drained = true;
    });
    await new Promise<void>(ok => setImmediate(ok));
    assert.equal(drained, false);
    finishWrite();
    await drain;
  });
  it('exports status and worker drain entry points', () => {
    for (const name of ['start', 'update', 'pending', 'status', 'loop', 'init', 'drain'])
      assert.equal(typeof Reflect.get(service.exports(), name), 'function');
  });
});
